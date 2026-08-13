import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, divisions } from "@/db/schema";
import { duplicate, fkViolation } from "@/lib/pg";

/**
 * Divisions and the shift each one works (PRD §6.8, widened from the single
 * company-wide schedule).
 *
 * The name is the primary key and employees reference it, so a rename is an
 * UPDATE that cascades rather than a re-tagging job across the employee table.
 */
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus berformat HH:mm")
  .or(z.literal(""));

const upsertBody = z
  .object({
    name: z.string().trim().min(2, "Nama divisi terlalu pendek").max(80),
    /** present when renaming: the row to update, as opposed to a new one */
    original: z.string().trim().min(1).optional(),
    shiftStart: hhmm.default(""),
    shiftEnd: hhmm.default(""),
    /** "" = inherit the company tolerance; 0 is a real value meaning "be on time" */
    lateToleranceMinutes: z
      .union([z.coerce.number().int().min(0).max(240), z.literal("")])
      .default(""),
  })
  // both hours or neither: a division with a start and no end has no shift at all,
  // and half-inheriting would silently pair 09:30 with the company's 17:00
  .refine((v) => Boolean(v.shiftStart) === Boolean(v.shiftEnd), {
    message: "Isi jam masuk dan jam keluar bersama, atau kosongkan keduanya",
    path: ["shiftEnd"],
  })
  .refine((v) => !v.shiftStart || v.shiftStart < v.shiftEnd, {
    message: "Jam keluar harus setelah jam masuk",
    path: ["shiftEnd"],
  });

const deleteBody = z.object({ name: z.string().trim().min(1) });

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = upsertBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const { name, original, shiftStart, shiftEnd, lateToleranceMinutes } =
    parsed.data;

  const values = {
    name,
    // "" means inherit — stored as NULL so resolveShift() falls through to settings
    shiftStart: shiftStart ? `${shiftStart}:00` : null,
    shiftEnd: shiftEnd ? `${shiftEnd}:00` : null,
    lateToleranceMinutes:
      lateToleranceMinutes === "" ? null : lateToleranceMinutes,
  };
  const shiftLabel = shiftStart
    ? `${shiftStart}–${shiftEnd}`
    : "ikut jam default";

  try {
    if (original) {
      const [row] = await db
        .update(divisions)
        .set(values)
        .where(eq(divisions.name, original))
        .returning({ name: divisions.name });
      if (!row)
        return Response.json(
          { error: "Divisi tidak ditemukan" },
          { status: 404 },
        );
    } else {
      await db.insert(divisions).values(values);
    }
  } catch (e) {
    if (duplicate(e)) {
      return Response.json(
        { error: `Divisi "${name}" sudah ada` },
        { status: 409 },
      );
    }
    throw e;
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: original ? "division.update" : "division.create",
    entity: "divisions",
    detail:
      original && original !== name
        ? `${original} → ${name} · ${shiftLabel}`
        : `${name} · ${shiftLabel}`,
  });

  // a rename cascades into employees, and the shift feeds the kehadiran header
  revalidatePath("/divisi");
  revalidatePath("/karyawan");
  revalidatePath("/kehadiran");
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = deleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  let removed;
  try {
    [removed] = await db
      .delete(divisions)
      .where(eq(divisions.name, parsed.data.name))
      .returning({ name: divisions.name });
  } catch (e) {
    // employees.division points here; let the FK be the guard rather than racing
    // a count query against a concurrent hire
    if (fkViolation(e)) {
      return Response.json(
        { error: "Masih ada karyawan di divisi ini. Pindahkan mereka dulu." },
        { status: 409 },
      );
    }
    throw e;
  }

  if (!removed)
    return Response.json({ error: "Divisi tidak ditemukan" }, { status: 404 });

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "division.delete",
    entity: "divisions",
    detail: removed.name,
  });

  revalidatePath("/divisi");
  revalidatePath("/karyawan");
  return Response.json({ ok: true });
}
