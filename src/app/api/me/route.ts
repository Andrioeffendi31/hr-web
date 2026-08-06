import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements,
  attendance,
  authenticators,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { initials, tanggalPendek, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";
import { config, withMe } from "@/lib/me";

/** Everything the Beranda screen shows, in one request — a phone on 4G pays
 *  more for six round trips than the server pays for six parallel queries. */
export const GET = withMe(async (me) => {
  const today = todayWib();
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));

  const [cfg, [att], balances, [ot], anns, team, [pendLeave], [pendOt], [passkeys]] =
    await Promise.all([
    config(),
    db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, today)))
      .limit(1),
    leaveBalances(year, me.id),
    db
      .select({
        minutes: sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(Number),
      })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.employeeId, me.id),
          eq(overtimeRequests.status, "disetujui"),
          gte(overtimeRequests.date, `${month}-01`),
          lte(overtimeRequests.date, `${month}-31`),
        ),
      ),
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        category: announcements.category,
        pinned: announcements.pinned,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(2),
    db
      .select({
        id: employees.id,
        name: employees.name,
        photoKey: employees.photoUrl,
        status: attendance.status,
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(eq(attendance.employeeId, employees.id), eq(attendance.date, today)),
      )
      .where(eq(employees.active, true)),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, me.id),
          // a revision needs the employee to act, so it belongs in their badge —
          // unlike HR's sidebar count, which stays on `menunggu` alone
          inArray(leaveRequests.status, ["menunggu", "revisi"]),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.employeeId, me.id),
          eq(overtimeRequests.status, "menunggu"),
        ),
      ),
    /** how many passkeys this account has, so the phone can stop offering to
     *  enrol a device that already did — and can tell that a passkey deleted from
     *  the web console really is gone */
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(authenticators)
      .where(eq(authenticators.employeeId, me.id)),
  ]);

  const present = team.filter(
    (t) => t.status === "hadir" || t.status === "wfh" || t.status === "telat",
  );

  return Response.json({
    profile: {
      id: me.id,
      nik: me.nik,
      name: me.name,
      initials: initials(me.name),
      division: me.division,
      position: me.position,
      role: me.role,
      photoKey: me.photoUrl,
    },
    today: {
      date: today,
      clockIn: att?.clockIn ?? null,
      clockOut: att?.clockOut ?? null,
      status: att?.status ?? "belum_absen",
      location: att?.location ?? null,
      selfieKey: att?.selfieUrl ?? null,
    },
    shift: {
      start: cfg.shiftStart.slice(0, 5),
      end: cfg.shiftEnd.slice(0, 5),
      toleranceMinutes: cfg.lateToleranceMinutes,
    },
    office: {
      lat: Number(cfg.officeLat),
      lng: Number(cfg.officeLng),
      radiusM: cfg.geofenceRadiusM,
      label: me.workLocation,
    },
    leave: {
      remaining: balances[0]?.remaining ?? 0,
      quota: balances[0]?.quota ?? cfg.baseLeaveQuota,
      used: balances[0]?.used ?? 0,
      expiresAt: `31 Des ${year}`,
    },
    overtime: { minutes: ot.minutes, capHours: cfg.weeklyOvertimeCapHours },
    pendingRequests: pendLeave.n + pendOt.n,
    passkeys: passkeys.n,
    announcements: anns.map((a) => ({
      ...a,
      date: tanggalPendek(a.createdAt.toISOString().slice(0, 10)),
    })),
    team: {
      total: team.length,
      present: present.length,
      avatars: present.slice(0, 4).map((t) => ({
        id: t.id,
        initials: initials(t.name),
        /** the same colleague is a photo in the Tim tab; the stack on the Beranda
         *  should not show them as initials */
        photoKey: t.photoKey,
      })),
    },
  });
});
