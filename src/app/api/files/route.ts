import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { attendance, auditLog, documents, employees } from "@/db/schema";
import {
  MAX_DOC,
  MAX_IMAGE,
  allowed,
  deleteObject,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";
import { isIsoDate } from "@/lib/hr";

const meta = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("doc"),
    folder: z.enum(["personal", "kontrak", "sertif", "legal"]),
    /** absent = company-wide document, visible to everyone */
    ownerId: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("photo"),
    employeeId: z.coerce.number().int().positive(),
  }),
  z.object({
    kind: z.literal("selfie"),
    employeeId: z.coerce.number().int().positive(),
    date: z.string().refine(isIsoDate, "tanggal harus YYYY-MM-DD"),
  }),
]);

/**
 * One upload endpoint for all three storage users (document, profile photo,
 * clock-in selfie) — the only thing that differs per kind is which row the key
 * gets written to, so three near-identical routes would be worse.
 *
 * The bytes are proxied through here rather than uploaded straight to R2, which
 * is what makes the bucket private and the download path authorizable.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  if (!r2Configured()) {
    return Response.json(
      { error: "Object storage belum dikonfigurasi" },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "File tidak ditemukan" }, { status: 400 });
  }

  const parsed = meta.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const m = parsed.data;

  const ext = extOf(file.name);
  if (!allowed(ext, m.kind)) {
    return Response.json(
      {
        error:
          m.kind === "doc"
            ? "Tipe file tidak didukung (PDF, CSV, XLSX, DOCX, JPG, PNG)"
            : "Tipe file tidak didukung (JPG, PNG, WEBP)",
      },
      { status: 400 },
    );
  }

  const max = m.kind === "doc" ? MAX_DOC : MAX_IMAGE;
  if (file.size > max) {
    return Response.json(
      { error: `File terlalu besar (maks ${max / (1024 * 1024)} MB)` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "File kosong" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();

  if (m.kind === "doc") {
    const key = keyFor("doc", m.folder, file.name);
    await putObject(key, bytes, file.type);
    const [row] = await db
      .insert(documents)
      .values({
        name: file.name.slice(0, 200),
        ext: (ext || "bin").toUpperCase(),
        folder: m.folder,
        sizeBytes: file.size,
        ownerId: m.ownerId ?? null,
        url: key,
      })
      .returning({ id: documents.id });

    await db.insert(auditLog).values({
      actorId: Number(admin.id),
      action: "document.upload",
      entity: "documents",
      entityId: row.id,
      detail: `${file.name} · ${m.folder}`,
    });
    revalidatePath("/berkas");
    return Response.json({ ok: true, id: row.id, key });
  }

  if (m.kind === "photo") {
    const key = keyFor("photo", String(m.employeeId));
    const [row] = await db
      .update(employees)
      .set({ photoUrl: key })
      .where(eq(employees.id, m.employeeId))
      .returning({ id: employees.id });
    if (!row) {
      return Response.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
    }
    // written after the row check so a bad id cannot leave a stray object
    await putObject(key, bytes, file.type);

    await db.insert(auditLog).values({
      actorId: Number(admin.id),
      action: "employee.photo",
      entity: "employees",
      entityId: m.employeeId,
    });
    revalidatePath("/karyawan");
    return Response.json({ ok: true, key });
  }

  // selfie — the attendance row must already exist; this endpoint stores the
  // photo, it does not create attendance (there is no clock-in flow yet).
  const key = keyFor("selfie", `${m.employeeId}/${m.date}`);
  const [row] = await db
    .update(attendance)
    .set({ selfieUrl: key })
    .where(and(eq(attendance.employeeId, m.employeeId), eq(attendance.date, m.date)))
    .returning({ id: attendance.id });
  if (!row) {
    return Response.json(
      { error: "Data kehadiran untuk tanggal itu tidak ditemukan" },
      { status: 404 },
    );
  }
  await putObject(key, bytes, file.type);

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "attendance.selfie",
    entity: "attendance",
    entityId: row.id,
    detail: m.date,
  });
  revalidatePath("/kehadiran");
  return Response.json({ ok: true, key });
}

const del = z.object({ id: z.coerce.number().int().positive() });

/** Documents only. Photos and selfies use deterministic keys, so re-uploading
 *  overwrites them and there is nothing to clean up. */
export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = del.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const [row] = await db
    .delete(documents)
    .where(eq(documents.id, parsed.data.id))
    .returning({ id: documents.id, name: documents.name, url: documents.url });
  if (!row) {
    return Response.json({ error: "Berkas tidak ditemukan" }, { status: 404 });
  }
  // seeded rows have no object behind them
  if (row.url && r2Configured()) await deleteObject(row.url);

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "document.delete",
    entity: "documents",
    entityId: row.id,
    detail: row.name,
  });
  revalidatePath("/berkas");
  return Response.json({ ok: true });
}
