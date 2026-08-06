import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attendance, attendanceEvents, officeLocations } from "@/db/schema";
import {
  attendanceStatus,
  formatJarak,
  jarakMeter,
  jam,
  resolveShift,
  todayWib,
} from "@/lib/hr";
import { Bad, config, withMe } from "@/lib/me";
import {
  MAX_IMAGE,
  allowed,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";

/**
 * Self-service clock in/out (PRD-Mobile §6.1) — the punch itself, which until
 * now only HR could enter from the web console.
 *
 * Arrives as multipart because the selfie rides along: one request, so a photo
 * can never end up attached to a punch that failed, or a punch recorded without
 * the photo the policy asked for.
 */
const body = z.object({
  action: z.enum(["in", "out"]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** optional reverse-geocoded label from the device */
  location: z.string().trim().max(120).optional(),
  /** working from home skips the geofence, but must be declared, not inferred */
  wfh: z.enum(["1", "0"]).optional(),
  /** which office this punch is measured against; required on clock-in unless WFH,
   *  and ignored on clock-out, which reuses whatever clock-in chose */
  locationId: z.coerce.number().int().positive().optional(),
});

export const POST = withMe(async (me, req) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new Bad("Permintaan harus multipart/form-data");

  const parsed = body.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const { action, lat, lng, location, wfh, locationId } = parsed.data;

  /**
   * The selfie is mandatory for both punches, and it is checked here — before the
   * geofence, before the duplicate check, and above all before any row is written.
   * The upload used to happen after the insert, so rejecting a photo at that point
   * would have left the punch recorded and the evidence missing: exactly the state
   * the requirement exists to prevent.
   *
   * Storage being unreachable therefore blocks attendance rather than quietly
   * recording photoless punches. That is the policy, not an oversight — an
   * exception that fires whenever R2 has a bad day is not a requirement.
   */
  const file = form.get("selfie");
  if (!(file instanceof File) || file.size === 0) {
    throw new Bad("Foto selfie wajib untuk absen masuk maupun keluar");
  }
  if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);
  if (!allowed(extOf(file.name), "photo")) {
    throw new Bad("Foto harus JPG, PNG atau WEBP");
  }
  if (file.size > MAX_IMAGE) {
    throw new Bad(`Foto terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)`, 413);
  }

  const cfg = await config();
  const today = todayWib();

  // WIB, like todayWib() — a UTC clock would stamp a 07:30 punch as 00:30 and
  // every morning would read as on-time
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  const isWfh = wfh === "1";

  const [existing] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      locationId: attendance.locationId,
    })
    .from(attendance)
    .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, today)))
    .limit(1);

  if (action === "in" && existing?.clockIn) {
    throw new Bad(`Sudah absen masuk ${jam(existing.clockIn)} hari ini`);
  }
  if (action === "out") {
    if (!existing?.clockIn) throw new Bad("Belum absen masuk hari ini");
    if (existing.clockOut) {
      throw new Bad(`Sudah absen keluar ${jam(existing.clockOut)} hari ini`);
    }
  }

  /**
   * Which office this punch is measured against.
   *
   * On clock-out the answer is settled: it is whatever clock-in chose, read from
   * the row. The client may send a locationId and it is ignored — letting somebody
   * end the day against a different office than they started it at would make the
   * geofence opt-out-able by picking the nearest one at 17:00.
   *
   * A null on clock-out means the day was declared WFH, so there is nothing to
   * measure and the punch passes, same as the clock-in did.
   */
  const wantedId = action === "out" ? existing!.locationId : isWfh ? null : locationId;
  if (action === "in" && !isWfh && !wantedId) throw new Bad("Pilih titik absen dulu");

  const office = wantedId
    ? (
        await db
          .select()
          .from(officeLocations)
          .where(eq(officeLocations.id, wantedId))
          .limit(1)
      )[0]
    : undefined;

  if (wantedId && !office) throw new Bad("Titik absen tidak ditemukan");
  // only checked when the employee picked it — an office deactivated after somebody
  // clocked in must not trap them, unable to clock out for the rest of the day
  if (office && action === "in" && !office.active) {
    throw new Bad(`${office.name} sudah tidak aktif, pilih titik absen lain`);
  }

  const meter = office
    ? jarakMeter(lat, lng, Number(office.lat), Number(office.lng))
    : null;
  if (office && meter! > office.radiusM) {
    throw new Bad(
      `Di luar radius ${office.name} (${formatJarak(meter!)} dari titik absen, maks ${office.radiusM} m)`,
    );
  }

  const label = location ?? office?.name ?? me.workLocation;
  let attendanceId: number;

  if (action === "in") {
    const shift = resolveShift(me, cfg);
    const status = attendanceStatus(now, shift.start, shift.toleranceMinutes, isWfh);
    const values = {
      employeeId: me.id,
      date: today,
      clockIn: now,
      status,
      location: label,
      lat: String(lat),
      lng: String(lng),
      locationId: office?.id ?? null,
    };
    const [row] = existing
      ? await db
          .update(attendance)
          .set(values)
          .where(eq(attendance.id, existing.id))
          .returning({ id: attendance.id })
      : await db.insert(attendance).values(values).returning({ id: attendance.id });
    attendanceId = row.id;
  } else {
    attendanceId = existing!.id;
    await db
      .update(attendance)
      .set({ clockOut: now })
      .where(eq(attendance.id, attendanceId));
  }

  const [event] = await db
    .insert(attendanceEvents)
    .values({
      attendanceId,
      kind: action === "in" ? "masuk" : "keluar",
      location: label,
      lat: String(lat),
      lng: String(lng),
      note: office ? `${formatJarak(meter!)} dari ${office.name}` : "WFH",
    })
    .returning({ id: attendanceEvents.id });

  const selfieKey = keyFor("selfie", `${me.id}/${today}/${event.id}`);
  await putObject(selfieKey, await file.arrayBuffer(), file.type);
  await db
    .update(attendanceEvents)
    .set({ photoUrl: selfieKey })
    .where(eq(attendanceEvents.id, event.id));
  // the admin table shows one selfie per day and clock-in is the one that proves
  // who showed up, so only that punch claims it
  if (action === "in") {
    await db
      .update(attendance)
      .set({ selfieUrl: selfieKey })
      .where(eq(attendance.id, attendanceId));
  }

  revalidatePath("/kehadiran");
  return Response.json({
    ok: true,
    action,
    at: now.slice(0, 5),
    distanceM: meter === null ? null : Math.round(meter),
    location: label,
    selfieKey,
  });
});
