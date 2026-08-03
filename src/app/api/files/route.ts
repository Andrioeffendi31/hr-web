import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  auditLog,
  documents,
  employees,
} from "@/db/schema";
import {
  MAX_DOC,
  MAX_IMAGE,
  allowed,
  deleteObject,
  extOf,
  headObject,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";
import { isIsoDate } from "@/lib/hr";

/** Step 2 of a document upload: the bytes are already in R2 (see
 *  /api/files/presign), this writes the metadata row. */
const confirm = z.object({
  kind: z.literal("doc"),
  key: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  folder: z.enum(["personal", "kontrak", "sertif", "legal"]),
  /** absent = company-wide document, visible to everyone */
  ownerId: z.coerce.number().int().positive().optional(),
});

/** Images are small enough to proxy through the handler, so they arrive as
 *  multipart in a single request. */
const image = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("photo"),
    employeeId: z.coerce.number().int().positive(),
  }),
  z.object({
    kind: z.literal("selfie"),
    employeeId: z.coerce.number().int().positive(),
    date: z.string().refine(isIsoDate, "tanggal harus YYYY-MM-DD"),
  }),
  /** photo evidence for one moment in the location log */
  z.object({
    kind: z.literal("event"),
    eventId: z.coerce.number().int().positive(),
  }),
]);

const forbidden = (e: unknown) =>
  Response.json({ error: (e as Error).message }, { status: 403 });
const unconfigured = () =>
  Response.json({ error: "Object storage belum dikonfigurasi" }, { status: 503 });

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return forbidden(e);
  }
  if (!r2Configured()) return unconfigured();

  return req.headers.get("content-type")?.includes("application/json")
    ? confirmDocument(req, Number(admin.id))
    : uploadImage(req, Number(admin.id));
}

async function confirmDocument(req: Request, actorId: number) {
  const parsed = confirm.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const { key, name, folder, ownerId } = parsed.data;

  // the key must be one we handed out for this folder, or a caller could claim
  // any object in the bucket — including somebody else's document
  if (!key.startsWith(`docs/${folder}/`) || key.split("/").length !== 3) {
    return Response.json({ error: "Kunci berkas tidak valid" }, { status: 400 });
  }
  if (!allowed(extOf(name), "doc")) {
    return Response.json({ error: "Tipe file tidak didukung" }, { status: 400 });
  }

  // a presigned URL cannot cap what gets written to it, so the real size is
  // whatever R2 reports — never what the browser claimed
  const sizeBytes = await headObject(key);
  if (sizeBytes === null) {
    return Response.json({ error: "Berkas belum sampai di penyimpanan" }, { status: 400 });
  }
  if (sizeBytes > MAX_DOC) {
    await deleteObject(key);
    return Response.json(
      { error: `File terlalu besar (maks ${MAX_DOC / (1024 * 1024)} MB)` },
      { status: 413 },
    );
  }
  if (sizeBytes === 0) {
    await deleteObject(key);
    return Response.json({ error: "File kosong" }, { status: 400 });
  }

  const [row] = await db
    .insert(documents)
    .values({
      name,
      ext: (extOf(name) || "bin").toUpperCase(),
      folder,
      sizeBytes,
      ownerId: ownerId ?? null,
      url: key,
    })
    .returning({ id: documents.id });

  await db.insert(auditLog).values({
    actorId,
    action: "document.upload",
    entity: "documents",
    entityId: row.id,
    detail: `${name} · ${folder}`,
  });
  revalidatePath("/berkas");
  return Response.json({ ok: true, id: row.id, key, sizeBytes });
}

async function uploadImage(req: Request, actorId: number) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "File tidak ditemukan" }, { status: 400 });
  }

  const parsed = image.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const m = parsed.data;

  if (!allowed(extOf(file.name), "photo")) {
    return Response.json(
      { error: "Tipe file tidak didukung (JPG, PNG, WEBP)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE) {
    return Response.json(
      { error: `File terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "File kosong" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();

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
      actorId,
      action: "employee.photo",
      entity: "employees",
      entityId: m.employeeId,
    });
    revalidatePath("/karyawan");
    return Response.json({ ok: true, key });
  }

  if (m.kind === "event") {
    // the event carries no employee/date of its own — they come from the
    // attendance row it belongs to, which is also what makes the key
    // authorizable by the existing selfie/<employeeId>/… prefix rule
    const [event] = await db
      .select({
        id: attendanceEvents.id,
        kind: attendanceEvents.kind,
        employeeId: attendance.employeeId,
        date: attendance.date,
      })
      .from(attendanceEvents)
      .innerJoin(attendance, eq(attendance.id, attendanceEvents.attendanceId))
      .where(eq(attendanceEvents.id, m.eventId))
      .limit(1);
    if (!event) {
      return Response.json({ error: "Event kehadiran tidak ditemukan" }, { status: 404 });
    }

    const key = keyFor("selfie", `${event.employeeId}/${event.date}/${event.id}`);
    await putObject(key, bytes, file.type);
    await db
      .update(attendanceEvents)
      .set({ photoUrl: key })
      .where(eq(attendanceEvents.id, event.id));

    await db.insert(auditLog).values({
      actorId,
      action: "attendance.event_photo",
      entity: "attendance_events",
      entityId: event.id,
      detail: `${event.date} · ${event.kind}`,
    });
    revalidatePath("/kehadiran");
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
    actorId,
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
    return forbidden(e);
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
