import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import {
  MAX_IMAGE,
  allowed,
  deleteObject,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";

/**
 * Replace one employee's profile photo.
 *
 * Shared by the two ways a photo gets set — HR editing somebody in the console,
 * and an employee changing their own from the phone or /profil — because the
 * interesting parts are identical and easy to get subtly different: the same size
 * and type limits, the same audit trail, and the old object being removed only
 * after the row already points at the new one.
 *
 * Authorization is the caller's job. This function trusts `employeeId`.
 */
export async function replacePhoto({
  employeeId,
  file,
  actorId,
}: {
  employeeId: number;
  file: File;
  /** who is doing it — the employee themselves, or the admin acting on them */
  actorId: number;
}): Promise<{ key: string }> {
  if (!r2Configured()) {
    throw Object.assign(new Error("Object storage belum dikonfigurasi"), { status: 503 });
  }
  if (!allowed(extOf(file.name), "photo")) {
    throw Object.assign(new Error("Foto harus JPG, PNG atau WEBP"), { status: 400 });
  }
  if (file.size > MAX_IMAGE) {
    throw Object.assign(
      new Error(`Foto terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)`),
      { status: 413 },
    );
  }

  const [current] = await db
    .select({ id: employees.id, photoUrl: employees.photoUrl })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!current) {
    throw Object.assign(new Error("Karyawan tidak ditemukan"), { status: 404 });
  }

  const key = keyFor("photo", String(employeeId));
  const bytes = await file.arrayBuffer();
  await putObject(key, bytes, file.type);
  await db.update(employees).set({ photoUrl: key }).where(eq(employees.id, employeeId));

  /**
   * Last, and never fatal. The row already points at the new object, so a failure
   * here costs one orphaned file — where deleting first would have risked an
   * employee with no photo at all if the upload that followed went wrong.
   */
  if (current.photoUrl && current.photoUrl !== key) {
    await deleteObject(current.photoUrl).catch(() => undefined);
  }

  await db.insert(auditLog).values({
    actorId,
    action: actorId === employeeId ? "employee.photo_self" : "employee.photo",
    entity: "employees",
    entityId: employeeId,
  });

  return { key };
}
