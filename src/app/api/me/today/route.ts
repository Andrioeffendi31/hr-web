import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { todayWib } from "@/lib/hr";
import { withMe } from "@/lib/me";

/** Watchdog latar belakang ponsel hanya butuh dua jam ini, tiap ~15 menit.
 *  Bootstrap penuh /api/me menjalankan enam query untuk pertanyaan itu. */
export const GET = withMe(async (me) => {
  const [att] = await db
    .select({ clockIn: attendance.clockIn, clockOut: attendance.clockOut })
    .from(attendance)
    .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, todayWib())))
    .limit(1);
  return Response.json({
    today: { clockIn: att?.clockIn ?? null, clockOut: att?.clockOut ?? null },
  });
});
