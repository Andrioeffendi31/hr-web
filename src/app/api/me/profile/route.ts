import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import { Bad, withMe } from "@/lib/me";

/**
 * The part of their own record an employee may correct (PRD §7: the app is not a
 * ticket queue for a changed phone number).
 *
 * Four fields, listed explicitly rather than filtered out of a wider body. Name,
 * NIK, division, role and salary-adjacent columns are HR's to set — an employee
 * who can rename themselves can impersonate a colleague in every list, and one
 * who can move divisions can pick a shift with a later start time.
 *
 * `withMe` supplies the id from the session, so this cannot be aimed at anyone
 * else no matter what the body says.
 */
/**
 * Each field is optional *around* its transform, not nullish inside it.
 *
 * The difference is destructive: with `.nullish()` an absent key parsed as
 * undefined, became null, and was written — so a PATCH carrying only `phone`
 * silently erased the address and both emergency-contact fields. Absent now means
 * "leave it alone"; an explicit null or "" still clears the field.
 */
const teks = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null)
    .optional();

const telp = (pesan: string) =>
  z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => v === null || /^0\d{8,14}$/.test(v), pesan)
    .optional();

const body = z.object({
  phone: telp("Nomor telepon tidak valid (mulai 0, 9–15 digit)"),
  address: teks(300),
  emergencyName: teks(120),
  emergencyPhone: telp("Nomor darurat tidak valid (mulai 0, 9–15 digit)"),
});

export const PATCH = withMe(async (me, req) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }

  // nothing recognised in the body: not an error, but not a write either
  if (Object.keys(parsed.data).length === 0) return Response.json({ ok: true });

  await db.update(employees).set(parsed.data).where(eq(employees.id, me.id));

  // logged like any other write to an employee row: HR has to be able to see
  // that a contact number changed, and who changed it
  await db.insert(auditLog).values({
    actorId: me.id,
    action: "employee.self_update",
    entity: "employees",
    entityId: me.id,
    detail: `${me.name} memperbarui kontak pribadi`,
  });

  revalidatePath("/profil");
  return Response.json({ ok: true });
});
