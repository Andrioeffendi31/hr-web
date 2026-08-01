import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import { isIsoDate } from "@/lib/hr";

const base = {
  nik: z.string().trim().min(3).max(32),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  role: z.enum(["hr_admin", "manager", "employee"]),
  division: z.string().trim().min(2).max(80),
  position: z.string().trim().min(2).max(80),
  contractType: z.enum(["Tetap", "Kontrak"]),
  joinedAt: z.string().refine(isIsoDate, "Tanggal mulai kerja tidak valid"),
  workLocation: z.string().trim().min(2).max(80),
  managerId: z.coerce.number().int().positive().nullable().optional(),
};

const createBody = z.object({ ...base, password: z.string().min(8).max(72) });
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

/** Postgres unique_violation → which column, in Indonesian. Drizzle wraps the
 *  pg error, so the real one is on `.cause`. */
function duplicateMessage(e: unknown): string | null {
  type PgError = { code?: string; constraint?: string; detail?: string; cause?: unknown };
  let err = e as PgError;
  while (err && err.code !== "23505" && err.cause) err = err.cause as PgError;
  if (err?.code !== "23505") return null;
  const hay = `${err.constraint ?? ""} ${err.detail ?? ""}`;
  if (hay.includes("email")) return "Email sudah dipakai karyawan lain";
  if (hay.includes("nik")) return "NIK sudah dipakai karyawan lain";
  return "Data karyawan sudah ada";
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
    const dup = duplicateMessage(e);
    if (dup) return Response.json({ error: dup }, { status: 409 });
    throw e;
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "employee.create",
    entity: "employees",
    entityId: created.id,
    detail: `${data.name} (${data.nik}) · ${data.division}`,
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
  const full = updateBody.safeParse(raw);
  const toggle = full.success ? null : toggleBody.safeParse(raw);
  if (!full.success && !toggle?.success) {
    return Response.json(
      { error: full.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }

  let id: number;
  let set: Partial<typeof employees.$inferInsert>;
  if (full.success) {
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
      .returning({ id: employees.id, name: employees.name, active: employees.active });
  } catch (e) {
    const dup = duplicateMessage(e);
    if (dup) return Response.json({ error: dup }, { status: 409 });
    throw e;
  }

  if (!updated) {
    return Response.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: full.success ? "employee.update" : `employee.${set.active ? "activate" : "deactivate"}`,
    entity: "employees",
    entityId: id,
    detail: updated.name,
  });

  revalidatePath("/karyawan");
  return Response.json({ ok: true, id, active: updated.active });
}
