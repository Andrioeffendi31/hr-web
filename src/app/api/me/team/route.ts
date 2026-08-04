import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { initials, jam, todayWib } from "@/lib/hr";
import { withMe } from "@/lib/me";

/**
 * "Kehadiran Tim" (PRD-Mobile §6.4) — colleagues and their status today.
 *
 * Search and status filtering stay on the phone: the whole company is 16 rows,
 * so shipping the list once and filtering locally beats a request per keystroke.
 * Email, NIK and contract details are deliberately absent — this is a presence
 * board, not the employee directory (that one is admin-only, PRD §3).
 */
export const GET = withMe(async () => {
  const today = todayWib();
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      division: employees.division,
      photoKey: employees.photoUrl,
      status: attendance.status,
      clockIn: attendance.clockIn,
      location: attendance.location,
      note: attendance.note,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(eq(attendance.employeeId, employees.id), eq(attendance.date, today)),
    )
    .where(eq(employees.active, true))
    .orderBy(asc(employees.name));

  return Response.json({
    date: today,
    members: rows.map((r) => ({
      ...r,
      status: r.status ?? "belum_absen",
      initials: initials(r.name),
      detail: r.clockIn
        ? `masuk ${jam(r.clockIn)}${r.location ? ` · ${r.location}` : ""}`
        : (r.note ?? "belum absen masuk"),
    })),
  });
});
