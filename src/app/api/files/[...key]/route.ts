import { eq } from "drizzle-orm";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getObject, r2Configured } from "@/lib/r2";

/**
 * The only way anything leaves the bucket. Authorization is derived from the key
 * prefix, so a leaked key is not a leaked file (PRD §6.6):
 *
 *   docs/legal/…    any signed-in user (company-wide documents)
 *   docs/…          HR Admin, or the employee the document belongs to
 *   photo/<id>      any signed-in user (avatars appear in the employee list)
 *   selfie/<id>/…   HR Admin, or that employee
 *
 * Anything else is a 404 — including a key that tries to climb out of its prefix.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
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
  const isAdmin = user.role === "hr_admin";
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
  } else if (segments[0] === "selfie") {
    if (!isAdmin && segments[1] !== me) {
      return new Response("Tidak boleh diakses", { status: 403 });
    }
  } else if (segments[0] !== "photo") {
    return new Response("Tidak ditemukan", { status: 404 });
  }

  if (!r2Configured()) {
    return new Response("Object storage belum dikonfigurasi", { status: 503 });
  }

  const res = await getObject(key);
  if (!res.ok || !res.body) {
    return new Response("Tidak ditemukan", { status: res.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    "content-type": res.headers.get("content-type") ?? "application/octet-stream",
    // never let a shared cache hold someone else's document
    "cache-control": filename ? "private, no-store" : "private, max-age=300",
  });
  const length = res.headers.get("content-length");
  if (length) headers.set("content-length", length);
  if (filename) {
    headers.set(
      "content-disposition",
      `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
    );
  }

  return new Response(res.body, { headers });
}
