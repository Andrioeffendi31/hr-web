import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { initials, jam, todayWib } from "@/lib/hr";
import { statusHarianSql } from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
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
  // aturan yang sama dengan papan admin: yang sedang cuti resmi tampil cuti, dan
  // hari libur divisinya tidak tampil sebagai "belum absen"
  const status = statusHarianSql(
    today,
    today,
    await holidaySet(Number(today.slice(0, 4))),
  );
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      position: employees.position,
      division: employees.division,
      photoKey: employees.photoUrl,
      status: sql<string>`${status}`.as("status"),
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

      initials: initials(r.name),
      detail: r.clockIn
        ? `masuk ${jam(r.clockIn)}${r.location ? ` · ${r.location}` : ""}`
        : (r.note ??
          (r.status === "libur" ? "bukan hari kerjanya" : "belum absen masuk")),
    })),
  });
});
