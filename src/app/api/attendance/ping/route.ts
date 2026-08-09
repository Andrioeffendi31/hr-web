import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { attendance, attendanceEvents, officeLocations } from "@/db/schema";
import { formatJarak, jarakMeter, todayWib } from "@/lib/hr";
import { sendPush } from "@/lib/push";

/**
 * Periodic location ping while the employee is clocked in (every ~3 hours from
 * the mobile app's background task).
 *
 * The first self-service write endpoint in this app: every other mutation is
 * requireAdmin(). Two rules make that safe:
 *
 *  1. Identity comes from the session, never the body — there is deliberately
 *     no employeeId field, so employee A cannot ping as employee B.
 *  2. The minimum gap below IS the rate limit (PRD §12 asks for one on the
 *     attendance endpoints), so a looping or malicious client cannot flood the
 *     log: at most one row per ~2.5 hours per attendance day.
 *
 * A ping outside the geofence it was clocked in against is flagged on the event
 * and pushed back to the employee. Unlike clock-in it is never *rejected*: the
 * point of a trail is to record where somebody actually was, and a refused ping
 * would erase exactly the fact worth recording. The same gap is what keeps the
 * warning from becoming a nag — at most one every ~2.5 hours.
 */
const body = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** optional human-readable label from reverse geocoding on the device */
  location: z.string().trim().max(120).optional(),
});

/** 2.5 h, not 3 h: a phone's background scheduler drifts, and rejecting a
 *  legitimate ping for being 8 minutes early would silently lose coverage. */
const MIN_GAP_MS = 2.5 * 60 * 60 * 1000;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Koordinat tidak valid" }, { status: 400 });
  }
  const { lat, lng, location } = parsed.data;

  const [att] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      // the office chosen at clock-in — the only point this ping can meaningfully
      // be measured against. Null on a WFH day, where being away from an office
      // is the arrangement rather than something to flag.
      officeName: officeLocations.name,
      officeLat: officeLocations.lat,
      officeLng: officeLocations.lng,
      officeRadiusM: officeLocations.radiusM,
    })
    .from(attendance)
    .leftJoin(officeLocations, eq(officeLocations.id, attendance.locationId))
    .where(
      and(
        eq(attendance.employeeId, Number(user.id)),
        eq(attendance.date, todayWib()),
      ),
    )
    .limit(1);

  // tracking only runs between the two punches — never before, never after
  if (!att?.clockIn) {
    return Response.json({ error: "Belum clock-in hari ini" }, { status: 400 });
  }
  if (att.clockOut) {
    return Response.json({ error: "Sudah clock-out hari ini" }, { status: 400 });
  }

  const [last] = await db
    .select({ at: attendanceEvents.at })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.attendanceId, att.id),
        eq(attendanceEvents.kind, "lokasi"),
      ),
    )
    .orderBy(desc(attendanceEvents.at))
    .limit(1);

  if (last) {
    const elapsed = Date.now() - last.at.getTime();
    if (elapsed < MIN_GAP_MS) {
      return Response.json(
        {
          error: "Ping terlalu cepat",
          nextAllowedAt: new Date(last.at.getTime() + MIN_GAP_MS).toISOString(),
        },
        { status: 409 },
      );
    }
  }

  /**
   * Is this ping outside the geofence it was clocked in against?
   *
   * Measured against the office the day belongs to, never "whichever is nearest
   * now" — somebody who clocked in at the head office and spent the afternoon two
   * streets from the warehouse is away from where they said they would be, and a
   * nearest-match would quietly call that fine.
   *
   * A WFH day has no office, so there is nothing to be outside of and no warning
   * to give.
   */
  const meter = att.officeLat
    ? jarakMeter(lat, lng, Number(att.officeLat), Number(att.officeLng!))
    : null;
  const outside = meter !== null && meter > att.officeRadiusM!;

  const [row] = await db
    .insert(attendanceEvents)
    .values({
      attendanceId: att.id,
      kind: "lokasi",
      lat: String(lat),
      lng: String(lng),
      location: location ?? null,
      // only when it is worth saying: the drawer already renders the distance for
      // every ping, so a note repeating it would be noise. This one flags it.
      note: outside ? `Di luar radius ${att.officeName}` : null,
    })
    .returning({ id: attendanceEvents.id, at: attendanceEvents.at });

  if (outside) {
    // awaited, but sendPush swallows its own failures — an unreachable phone must
    // not turn a recorded ping into a 500 the device would retry
    await sendPush({
      to: Number(user.id),
      title: "Anda di luar area kantor",
      body: `Terpantau ${formatJarak(meter!)} dari ${att.officeName} pada pengecekan lokasi berkala.`,
      route: "/kehadiran",
    });
  }

  // no auditLog row: that table tracks administrative actions needing a trail,
  // and attendance_events is already the trail for this one
  revalidatePath("/kehadiran");
  return Response.json({ ok: true, id: row.id, at: row.at, outside });
}
