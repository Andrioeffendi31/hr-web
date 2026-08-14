import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendanceEvents } from "@/db/schema";
import { isIsoDate, jam, jarakMeter, resolveShift } from "@/lib/hr";
import { hariKaryawan } from "@/lib/kehadiran";
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

  const day = await hariKaryawan(me.id, date);
  if (!day) throw new Bad("Karyawan tidak ditemukan", 404);

  const [events, cfg] = await Promise.all([
    day.id
      ? db
          .select({
            id: attendanceEvents.id,
            kind: attendanceEvents.kind,
            at: attendanceEvents.at,
            location: attendanceEvents.location,
            lat: attendanceEvents.lat,
            lng: attendanceEvents.lng,
            photoKey: attendanceEvents.photoUrl,
            note: attendanceEvents.note,
            suspect: attendanceEvents.suspect,
          })
          .from(attendanceEvents)
          .where(eq(attendanceEvents.attendanceId, day.id))
          .orderBy(asc(attendanceEvents.at))
      : [],
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
    shift: resolveShift(me, cfg),
    office: day.officeName,
    /** pengajuan yang ditolak dan mencakup hari ini — konteks untuk hari tanpa
     *  keterangan, bukan status kedua */
    ditolak: day.ditolak,
    /**
     * The same office as a point, so the phone can draw the day rather than only
     * list it. Added alongside `office` rather than replacing it: a shipped build
     * reads that string, and an installed app is not something we get to migrate.
     */
    officeGeo: day.officeLat
      ? {
          lat: Number(day.officeLat),
          lng: Number(day.officeLng),
          radiusM: day.officeRadius!,
        }
      : null,
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
      suspect: e.suspect,
      photoKey: e.photoKey,
      /** where it happened; null for a punch written before coordinates were kept */
      lat: e.lat === null ? null : Number(e.lat),
      lng: e.lng === null ? null : Number(e.lng),
      /**
       * Distance from the office at the moment of the event, measured against the
       * office this day was actually punched at — never "whichever is nearest now",
       * which would relabel an old day the moment HR opens a site next door.
       * Null when the day has no office (WFH) or the event carries no coordinates.
       */
      distanceM:
        e.lat && e.lng && day.officeLat && day.officeLng
          ? Math.round(
              jarakMeter(
                Number(day.officeLat),
                Number(day.officeLng),
                Number(e.lat),
                Number(e.lng),
              ),
            )
          : null,
    })),
  });
});
