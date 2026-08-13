import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, officeLocations } from "@/db/schema";
import { fkViolation } from "@/lib/pg";

/**
 * The places an employee may clock in from (PRD §6.8 "Lokasi absensi").
 *
 * Each row is a point plus its own radius, because the geofence that fits a head
 * office on a city block does not fit a warehouse yard. Deactivating is the
 * ordinary way to retire one — attendance rows reference these, and history has
 * to keep resolving to the place it happened.
 */
const upsertBody = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nama lokasi terlalu pendek").max(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  // below ~25 m ordinary GPS drift alone would lock people out; above 5 km it is
  // not a geofence any more
  radiusM: z.coerce.number().int().min(25, "Radius minimal 25 m").max(5000),
  active: z.boolean().default(true),
});

const deleteBody = z.object({ id: z.coerce.number().int().positive() });

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
  const { id, name, lat, lng, radiusM, active } = parsed.data;

  // numeric(9,6) — fix the scale here so the value read back matches what was
  // typed, rather than depending on the driver's rounding
  const values = {
    name,
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    radiusM,
    active,
  };

  let row;
  if (id) {
    [row] = await db
      .update(officeLocations)
      .set(values)
      .where(eq(officeLocations.id, id))
      .returning({ id: officeLocations.id });
    if (!row)
      return Response.json(
        { error: "Lokasi tidak ditemukan" },
        { status: 404 },
      );
  } else {
    [row] = await db.insert(officeLocations).values(values).returning({
      id: officeLocations.id,
    });
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: id ? "location.update" : "location.create",
    entity: "office_locations",
    entityId: row.id,
    detail: `${name} · ${lat.toFixed(6)},${lng.toFixed(6)} · ${radiusM} m${active ? "" : " · nonaktif"}`,
  });

  revalidatePath("/lokasi");
  revalidatePath("/kehadiran");
  return Response.json({ ok: true, id: row.id });
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
      .delete(officeLocations)
      .where(eq(officeLocations.id, parsed.data.id))
      .returning({ name: officeLocations.name });
  } catch (e) {
    // attendance rows point here, ON DELETE RESTRICT. Deleting would erase which
    // office those punches were measured against, so it is refused on purpose.
    if (fkViolation(e)) {
      return Response.json(
        {
          error:
            "Sudah ada absensi di lokasi ini, jadi tidak bisa dihapus. Nonaktifkan saja.",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  if (!removed)
    return Response.json({ error: "Lokasi tidak ditemukan" }, { status: 404 });

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "location.delete",
    entity: "office_locations",
    entityId: parsed.data.id,
    detail: removed.name,
  });

  revalidatePath("/lokasi");
  revalidatePath("/kehadiran");
  return Response.json({ ok: true });
}
