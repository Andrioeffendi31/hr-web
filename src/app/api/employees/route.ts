import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import { cekSandi, isIsoDate } from "@/lib/hr";
import { duplicate, fkViolation } from "@/lib/pg";
import { LABEL_PERAN, type Role } from "@/lib/access";

/** Semua nilai peran yang sah, dari satu sumber. */
const PERAN = Object.keys(LABEL_PERAN) as Role[];

/**
 * An unfilled field arrives as "" from the form and has to reach the column as
 * NULL — "" would read as "answered, with nothing" in every display and sort.
 */
const opsional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const tanggalOpsional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || isIsoDate(v), "Tanggal tidak valid");

/** Stored digits-only; the source data mixes "0858 8182 0410" and "085881820410"
 *  and a phone number that differs only by spacing is the same phone number. */
const teleponOpsional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.replace(/\D/g, "") : null))
  .refine(
    (v) => v === null || /^0\d{8,14}$/.test(v),
    "Nomor telepon tidak valid (mulai 0, 9–15 digit)",
  );

/** A `<select>` with nothing chosen submits "", which is not a member of any
 *  enum — without this the whole body fails to parse over one blank dropdown. */
const enumOpsional = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .nullish()
    .transform((v) => (v ? (v as T[number]) : null));

const base = {
  nik: z.string().trim().min(3).max(32),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  // diturunkan dari LABEL_PERAN, bukan ditulis ulang: daftar kedua yang
  // ditulis tangan adalah daftar yang akan tertinggal saat peran bertambah
  role: z.enum(PERAN as [Role, ...Role[]]),
  /**
   * Employment data is optional, matching the columns.
   *
   * Requiring it here would mean an imported employee could not have their
   * address corrected without HR first inventing a division for them — the save
   * would fail on a field the edit never touched.
   */
  division: opsional(80),
  position: opsional(80),
  contractType: enumOpsional(["Tetap", "Kontrak"] as const),
  joinedAt: tanggalOpsional,
  workLocation: z.string().trim().min(2).max(80),
  managerId: z.coerce.number().int().positive().nullable().optional(),

  // personal data
  birthPlace: opsional(80),
  birthDate: tanggalOpsional,
  address: opsional(300),
  gender: enumOpsional(["Laki-laki", "Perempuan"] as const),
  religion: opsional(40),
  phone: teleponOpsional,
  emergencyName: opsional(120),
  emergencyPhone: teleponOpsional,
};

const createBody = z.object({
  ...base,
  // same rule as every other password path (lib/hr.ts) — an account HR creates
  // must not start weaker than one the employee sets themselves
  password: z
    .string()
    .max(200)
    .refine((v) => cekSandi(v) === null, {
      error: (iss) => cekSandi(String(iss.input)) ?? "Kata sandi tidak valid",
    }),
});
const updateBody = z.object({
  ...base,
  id: z.coerce.number().int().positive(),
  active: z.boolean(),
});
/** Deactivate/reactivate only — the form sends the full body, the drawer this one. */
const toggleBody = z.object({
  id: z.coerce.number().int().positive(),
  active: z.boolean(),
});

/** Postgres constraint violation → which column, in Indonesian. */
function constraintMessage(e: unknown): string | null {
  const dup = duplicate(e);
  if (dup) {
    const hay = `${dup.constraint ?? ""} ${dup.detail ?? ""}`;
    if (hay.includes("email")) return "Email sudah dipakai karyawan lain";
    if (hay.includes("nik")) return "NIK sudah dipakai karyawan lain";
    return "Data karyawan sudah ada";
  }
  // the division column is a foreign key into `divisions`; a name that is not
  // there can only come from a stale form or a hand-crafted request
  if (fkViolation(e)?.constraint?.includes("division")) {
    return "Divisi tidak dikenal — tambahkan dulu lewat menu Divisi";
  }
  return null;
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = createBody.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const { password, ...data } = parsed.data;

  let created;
  try {
    [created] = await db
      .insert(employees)
      .values({
        ...data,
        email: data.email.toLowerCase(),
        managerId: data.managerId ?? null,
        passwordHash: await bcrypt.hash(password, 10),
      })
      .returning({ id: employees.id });
  } catch (e) {
    const dup = constraintMessage(e);
    if (dup) return Response.json({ error: dup }, { status: 409 });
    throw e;
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "employee.create",
    entity: "employees",
    entityId: created.id,
    detail: `${data.name} (${data.nik}) · ${data.division ?? "tanpa divisi"}`,
  });

  revalidatePath("/karyawan");
  return Response.json({ ok: true, id: created.id });
}

export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const raw = await req.json();
  // Which body this is has to be decided by shape, not by "did the full one
  // parse". Falling back on failure meant an invalid edit quietly parsed as a
  // toggle — 200, a success toast, and not one field written.
  const isToggle = raw !== null && typeof raw === "object" && !("nik" in raw);
  const full = isToggle ? null : updateBody.safeParse(raw);
  const toggle = isToggle ? toggleBody.safeParse(raw) : null;
  if (!full?.success && !toggle?.success) {
    const err = full?.error ?? toggle?.error;
    return Response.json(
      { error: err?.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }

  let id: number;
  let set: Partial<typeof employees.$inferInsert>;
  if (full?.success) {
    const { id: fullId, managerId, email, ...rest } = full.data;
    id = fullId;
    set = { ...rest, email: email.toLowerCase(), managerId: managerId ?? null };
  } else {
    id = toggle!.data!.id;
    set = { active: toggle!.data!.active };
  }

  // Deactivating himself would lock the last admin out of his own console.
  if (Number(admin.id) === id && set.active === false) {
    return Response.json(
      { error: "Tidak bisa menonaktifkan akun Anda sendiri" },
      { status: 400 },
    );
  }

  let updated;
  try {
    [updated] = await db
      .update(employees)
      .set(set)
      .where(eq(employees.id, id))
      .returning({
        id: employees.id,
        name: employees.name,
        active: employees.active,
      });
  } catch (e) {
    const dup = constraintMessage(e);
    if (dup) return Response.json({ error: dup }, { status: 409 });
    throw e;
  }

  if (!updated) {
    return Response.json(
      { error: "Karyawan tidak ditemukan" },
      { status: 404 },
    );
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: full?.success
      ? "employee.update"
      : `employee.${set.active ? "activate" : "deactivate"}`,
    entity: "employees",
    entityId: id,
    detail: updated.name,
  });

  revalidatePath("/karyawan");
  return Response.json({ ok: true, id, active: updated.active });
}
