import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { jam, todayWib } from "@/lib/hr";
import { Bad, withMe } from "@/lib/me";

/** "Kehadiran Saya" (PRD-Mobile §6.2): own log for one month, plus the counts
 *  the three stat cards show. */
export const GET = withMe(async (me, req) => {
  const month = new URL(req.url).searchParams.get("month") ?? todayWib().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Bad("Bulan harus YYYY-MM");

  // last day of the month without a calendar table: day 0 of the next month
  const [y, m] = month.split("-").map(Number);
  const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

  const rows = await db
    .select({
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
      location: attendance.location,
      note: attendance.note,
      selfieKey: attendance.selfieUrl,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, me.id),
        gte(attendance.date, `${month}-01`),
        lte(attendance.date, end),
      ),
    )
    .orderBy(desc(attendance.date));

  const count = (...s: string[]) => rows.filter((r) => s.includes(r.status)).length;

  return Response.json({
    month,
    stats: {
      hadir: count("hadir", "wfh"),
      telat: count("telat"),
      cuti: count("cuti", "izin", "sakit"),
    },
    days: rows.map((r) => ({
      ...r,
      in: jam(r.clockIn),
      out: jam(r.clockOut),
      note: r.note ?? r.location ?? "",
    })),
  });
});
