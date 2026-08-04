import { revalidatePath } from "next/cache";
import { desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, documents } from "@/db/schema";
import { ukuranFile } from "@/lib/hr";
import { Bad, withMe } from "@/lib/me";
import { allowed, extOf, keyFor, putObject, r2Configured } from "@/lib/r2";

/**
 * "Berkas Saya" (PRD-Mobile §6.5): own documents plus the company-wide ones.
 *
 * The privacy note in the mockup is enforced by this where clause, not by
 * hiding rows in the app — `ownerId = me` or `ownerId is null`, nothing else.
 * Bytes themselves still leave through /api/files/[...key], which re-checks
 * ownership per download.
 */
export const GET = withMe(async (me) => {
  const rows = await db
    .select()
    .from(documents)
    .where(or(eq(documents.ownerId, me.id), isNull(documents.ownerId)))
    .orderBy(desc(documents.uploadedAt))
    .limit(100);

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      ext: r.ext,
      folder: r.folder,
      key: r.url,
      size: ukuranFile(r.sizeBytes),
      mine: r.ownerId === me.id,
      uploadedAt: r.uploadedAt,
    })),
  });
});

/**
 * Upload one's own document. Bytes are proxied through here rather than
 * presigned like the admin flow, with a much smaller ceiling: a phone uploads a
 * scan or a photo, and 10 MB through the function is cheaper than teaching the
 * app the two-step presign dance for files it will never send.
 *
 * ponytail: 10 MB proxy cap. If employees ever need to send the same 100 MB
 * files HR does, reuse /api/files/presign with a requireUser() variant.
 */
const MAX_MOBILE_DOC = 10 * 1024 * 1024;

export const POST = withMe(async (me, req) => {
  if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new Bad("File tidak ditemukan");
  if (file.size === 0) throw new Bad("File kosong");
  if (file.size > MAX_MOBILE_DOC) {
    throw new Bad(`File terlalu besar (maks ${MAX_MOBILE_DOC / (1024 * 1024)} MB)`, 413);
  }
  if (!allowed(extOf(file.name), "doc")) throw new Bad("Tipe file tidak didukung");

  const key = keyFor("doc", "personal", file.name);
  await putObject(key, await file.arrayBuffer(), file.type);

  const [row] = await db
    .insert(documents)
    .values({
      name: file.name,
      ext: (extOf(file.name) || "bin").toUpperCase(),
      folder: "personal",
      sizeBytes: file.size,
      ownerId: me.id,
      url: key,
    })
    .returning({ id: documents.id });

  // an employee adding to their own file is worth a trail: HR sees documents
  // appear that they did not upload
  await db.insert(auditLog).values({
    actorId: me.id,
    action: "document.upload_self",
    entity: "documents",
    entityId: row.id,
    detail: file.name,
  });
  revalidatePath("/berkas");
  return Response.json({ ok: true, id: row.id, key });
});
