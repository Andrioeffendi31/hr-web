import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, settings } from "@/db/schema";
import { fkViolation } from "@/lib/pg";
import { deleteObject, r2Configured } from "@/lib/r2";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus berformat HH:mm");

const body = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(2, "Nama perusahaan terlalu pendek")
      .max(120),
    shiftStart: hhmm,
    shiftEnd: hhmm,
    lateToleranceMinutes: z.coerce.number().int().min(0).max(120),
    /**
     * Sejak kapan kehadiran dinilai. "" = tanpa batas (nilai kosong dari <input
     * type="date">), dan itu berarti setiap hari kerja lampau ikut dinilai —
     * benar untuk pemasangan yang mencatat sejak hari pertama.
     */
    trackingSince: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD"), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    baseLeaveQuota: z.coerce.number().int().min(1).max(60),
    weeklyOvertimeCapHours: z.coerce.number().int().min(1).max(40),
    // the office *point* moved to its own table (/api/locations) once one company
    // could have more than one; what stays here is which of them is primary.
    // "" is how an empty <select> arrives, and means "no default chosen"
    defaultLocationId: z
      .union([z.coerce.number().int().positive(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
  })
  .refine((v) => v.shiftStart < v.shiftEnd, {
    message: "Jam keluar harus setelah jam masuk",
    path: ["shiftEnd"],
  });

const forbidden = (e: unknown) =>
  Response.json({ error: (e as Error).message }, { status: 403 });

export async function PATCH(req: Request) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    return forbidden(e);
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Pengaturan tidak valid" },
      { status: 400 },
    );
  }

  const [before] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  const next = {
    ...parsed.data,
    shiftStart: `${parsed.data.shiftStart}:00`,
    shiftEnd: `${parsed.data.shiftEnd}:00`,
  };

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ id: 1, ...next })
        .onConflictDoUpdate({ target: settings.id, set: next });

      const changed = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => {
          const old = before?.[key as keyof typeof before];
          return String(old ?? "") !== String(value);
        }),
      );
      await tx.insert(auditLog).values({
        actorId: Number(actor.id),
        action: "settings.update",
        entity: "settings",
        entityId: 1,
        detail: JSON.stringify(changed),
      });
    });
  } catch (e) {
    // the only foreign key on this row is the default office; a value that is not
    // there means the form was submitted against a location deleted meanwhile
    if (fkViolation(e)) {
      return Response.json(
        { error: "Lokasi absen tidak ditemukan" },
        { status: 400 },
      );
    }
    throw e;
  }

  revalidatePath("/", "layout");
  revalidatePath("/pengaturan");
  return Response.json({ ok: true });
}

export async function DELETE() {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    return forbidden(e);
  }

  const [row] = await db
    .select({ key: settings.companyLogoUrl })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  await db
    .update(settings)
    .set({ companyLogoUrl: null })
    .where(eq(settings.id, 1));

  if (row?.key && r2Configured()) await deleteObject(row.key);
  await db.insert(auditLog).values({
    actorId: Number(actor.id),
    action: "settings.logo_remove",
    entity: "settings",
    entityId: 1,
  });

  revalidatePath("/", "layout");
  revalidatePath("/pengaturan");
  return Response.json({ ok: true });
}
