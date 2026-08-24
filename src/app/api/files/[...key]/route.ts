import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { documents, leaveRequests } from "@/db/schema";
import { getObject, presignGet, r2Configured } from "@/lib/r2";
import { bolehKonsol, type Role } from "@/lib/access";
import { ekstensi, previewKind } from "@/lib/hr";

/**
 * The only way anything leaves the bucket. Authorization is derived from the key
 * prefix, so a leaked key is not a leaked file (PRD §6.6):
 *
 *   docs/legal/…    any signed-in user (company-wide documents)
 *   docs/…          HR Admin atau Pimpinan, or the employee the document belongs to
 *   photo/<id>      any signed-in user (avatars appear in the employee list)
 *   logo/company    any signed-in user (company branding in the app shell)
 *   selfie/<id>/…   HR Admin atau Pimpinan, or that employee
 *   lampiran/<req>/… HR Admin atau Pimpinan, or the employee whose request it is
 *
 * Anything else is a 404 — including a key that tries to climb out of its prefix.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const segments = (await ctx.params).key;
  if (segments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))) {
    return new Response("Tidak ditemukan", { status: 404 });
  }
  const key = segments.join("/");
  /**
   * `bolehKonsol`, bukan `=== "hr_admin"`.
   *
   * Pimpinan punya hak akses yang IDENTIK dengan hr_admin — itu definisinya di
   * lib/access.ts, dan requireAdmin() sudah menerima keduanya. Membandingkan
   * peran dengan satu string di sini membuat Pimpinan diperlakukan sebagai
   * karyawan biasa: setiap selfie dan setiap dokumen milik orang lain menjadi
   * "Tidak boleh diakses" untuknya. Satu daftar peran, satu tempat.
   */
  const isAdmin = bolehKonsol(user.role as Role);
  const me = String(user.id);

  let filename: string | null = null;

  if (segments[0] === "docs") {
    const [doc] = await db
      .select({ name: documents.name, ownerId: documents.ownerId })
      .from(documents)
      .where(eq(documents.url, key))
      .limit(1);
    if (!doc) return new Response("Tidak ditemukan", { status: 404 });
    const own = doc.ownerId === null || String(doc.ownerId) === me;
    if (!isAdmin && !own) {
      return new Response("Tidak boleh diakses", { status: 403 });
    }
    filename = doc.name;
  } else if (segments[0] === "lampiran") {
    /**
     * Authorized from the request row, not from a documents row: a leave
     * attachment belongs to a pengajuan, and the only people entitled to it are
     * the employee who filed it and the HR admins who decide it.
     */
    const [row] = await db
      .select({
        employeeId: leaveRequests.employeeId,
        name: leaveRequests.attachmentName,
        key: leaveRequests.attachmentKey,
      })
      .from(leaveRequests)
      .where(eq(leaveRequests.id, Number(segments[1])))
      .limit(1);
    // key equality matters: an id alone must not unlock a sibling's attachment
    if (!row || row.key !== key)
      return new Response("Tidak ditemukan", { status: 404 });
    if (!isAdmin && String(row.employeeId) !== me) {
      return new Response("Tidak boleh diakses", { status: 403 });
    }
    filename = row.name;
  } else if (segments[0] === "selfie") {
    if (!isAdmin && segments[1] !== me) {
      return new Response("Tidak boleh diakses", { status: 403 });
    }
  } else if (
    segments[0] !== "photo" &&
    segments[0] !== "logo" &&
    // banner pengumuman: memang untuk dibaca semua karyawan, jadi cukup sudah
    // masuk — tidak ada baris yang perlu ditanyai kepemilikannya
    segments[0] !== "banner"
  ) {
    return new Response("Tidak ditemukan", { status: 404 });
  }

  if (!r2Configured()) {
    return new Response("Object storage belum dikonfigurasi", { status: 503 });
  }

  // Documents can be 100 MB, which has no business flowing through a serverless
  // function: authorize here, then hand out a short-lived signed URL and let R2
  // serve the bytes. Images stay proxied — they are small and same-origin keeps
  // them cacheable by the browser without a fresh signature every time.
  if (filename) {
    // ?inline=1 is what the preview dialog asks for. Only for types the browser
    // renders as data — an inline .svg or .html would execute on the object
    // host, so those keep falling back to a download.
    const params = new URL(req.url).searchParams;
    const wantsInline = params.get("inline") === "1";
    const inline = wantsInline && previewKind(ekstensi(filename)) !== null;

    // ?json=1 hands back the signed URL instead of redirecting to it. The mobile
    // app needs that: it holds the session as a header, so it cannot let the
    // system browser follow a 302 that requires the cookie — but it can open the
    // signed URL, which carries its own authorization.
    if (params.get("json") === "1") {
      return Response.json({
        url: await presignGet(key, filename, inline ? "inline" : "attachment"),
        name: filename,
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: await presignGet(
          key,
          filename,
          inline ? "inline" : "attachment",
        ),
        // the signed URL is a bearer token for its lifetime, so nothing caches it
        "cache-control": "private, no-store",
      },
    });
  }

  const res = await getObject(key);
  if (!res.ok || !res.body) {
    return new Response("Tidak ditemukan", {
      status: res.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers({
    "content-type":
      res.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": "private, max-age=300",
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new Response(res.body, { headers });
}
