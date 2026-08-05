import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, attendanceEvents } from "@/db/schema";
import { isIsoDate, jam, jarakMeter } from "@/lib/hr";
import { Bad, config, withMe } from "@/lib/me";

/**
 * One day of the employee's own attendance, with the event trail behind it.
 *
 * The month list already carries the summary the cards show; this exists for what
 * it cannot: the punches with the place they were made, the photo filed with them,
 * and the periodic location pings this app writes while somebody is clocked in.
 * That last part is the reason an employee is entitled to this view at all — being
 * able to see the trail your employer recorded about you should not require asking
 * HR for a screenshot of their console.
 *
 * `withMe` scopes every query to the caller, so the date in the path is the only
 * input and it cannot reach another employee's day.
 */
export const GET = withMe(async (me, _req, ctx) => {
  const { date } = await ctx.params;
  if (!date || !isIsoDate(date)) throw new Bad("Tanggal harus YYYY-MM-DD");

  const [day] = await db
    .select({
      id: attendance.id,
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
      location: attendance.location,
      note: attendance.note,
      selfieKey: attendance.selfieUrl,
    })
    .from(attendance)
    .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, date)))
    .limit(1);

  if (!day) throw new Bad("Belum ada catatan kehadiran di tanggal ini", 404);

  const [events, cfg] = await Promise.all([
    db
      .select({
        id: attendanceEvents.id,
        kind: attendanceEvents.kind,
        at: attendanceEvents.at,
        location: attendanceEvents.location,
        lat: attendanceEvents.lat,
        lng: attendanceEvents.lng,
        photoKey: attendanceEvents.photoUrl,
        note: attendanceEvents.note,
      })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.attendanceId, day.id))
      .orderBy(asc(attendanceEvents.at)),
    config(),
  ]);

  return Response.json({
    date: day.date,
    status: day.status,
    in: jam(day.clockIn),
    out: jam(day.clockOut),
    location: day.location,
    note: day.note,
    selfieKey: day.selfieKey,
    shift: { start: cfg.shiftStart.slice(0, 5), end: cfg.shiftEnd.slice(0, 5) },
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      /** WIB clock time, formatted here so the phone never re-derives a timezone */
      at: new Date(e.at).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }),
      location: e.location,
      note: e.note,
      photoKey: e.photoKey,
      /** distance from the office at the moment of the event, when it was recorded
       *  with coordinates — computed server-side against the settings row, the same
       *  point /api/me/clock measures against */
      distanceM:
        e.lat && e.lng
          ? Math.round(
              jarakMeter(
                Number(cfg.officeLat),
                Number(cfg.officeLng),
                Number(e.lat),
                Number(e.lng),
              ),
            )
          : null,
    })),
  });
});
