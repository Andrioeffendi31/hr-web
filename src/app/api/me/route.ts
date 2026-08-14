import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements,
  attendance,
  authenticators,
  employees,
  leaveRequests,
  officeLocations,
  overtimeRequests,
} from "@/db/schema";
import { initials, resolveShift, tanggalPendek, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";
import { config, withMe } from "@/lib/me";

/** Everything the Beranda screen shows, in one request — a phone on 4G pays
 *  more for six round trips than the server pays for six parallel queries. */
export const GET = withMe(async (me) => {
  const today = todayWib();
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));

  const [
    cfg,
    [att],
    balances,
    [ot],
    anns,
    team,
    [pendLeave],
    [pendOt],
    passkeys,
    offices,
  ] = await Promise.all([
    config(),
    db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, today)))
      .limit(1),
    leaveBalances(year, me.id),
    db
      .select({
        minutes:
          sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(
            Number,
          ),
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
        and(
          eq(attendance.employeeId, employees.id),
          eq(attendance.date, today),
        ),
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
    /** The credential ids this account has, not a count: a count says how many
     *  passkeys exist but not *which* device holds them, so the phone could only
     *  guess. Given the ids it compares against the one it created itself and
     *  knows. They are not secret — `allowCredentials` publishes them at every
     *  login — and there are a handful per person at most. */
    db
      .select({ id: authenticators.credentialId })
      .from(authenticators)
      .where(eq(authenticators.employeeId, me.id)),
    /** every place this employee may punch from — the phone picks one and the
     *  server re-checks the geofence against whichever it picked */
    db
      .select()
      .from(officeLocations)
      .where(eq(officeLocations.active, true))
      .orderBy(asc(officeLocations.name)),
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
      division: me.division ?? "Tanpa divisi",
      position: me.position ?? "",
      role: me.role,
      photoKey: me.photoUrl,
      // the rest of the record, so the phone's Profil screen is a read of one
      // payload rather than a second round trip
      email: me.email,
      birthPlace: me.birthPlace,
      birthDate: me.birthDate,
      gender: me.gender,
      religion: me.religion,
      address: me.address,
      phone: me.phone,
      emergencyName: me.emergencyName,
      emergencyPhone: me.emergencyPhone,
      contractType: me.contractType,
      joinedAt: me.joinedAt,
      workLocation: me.workLocation,
      mustChangePassword: me.mustChangePassword,
    },
    today: {
      date: today,
      clockIn: att?.clockIn ?? null,
      clockOut: att?.clockOut ?? null,
      status: att?.status ?? "belum_absen",
      location: att?.location ?? null,
      selfieKey: att?.selfieUrl ?? null,
      /** the office chosen at clock-in, so clock-out can follow it without asking */
      officeId: att?.locationId ?? null,
    },
    shift: resolveShift(me, cfg),
    offices: offices.map((o) => ({
      id: o.id,
      name: o.name,
      lat: Number(o.lat),
      lng: Number(o.lng),
      radiusM: o.radiusM,
    })),
    /** the one to show before GPS answers; falls back to the first by name so the
     *  phone never has to render "pilih kantor" when there is an obvious answer */
    defaultOfficeId: cfg.defaultLocationId ?? offices[0]?.id ?? null,
    leave: {
      remaining: balances[0]?.remaining ?? 0,
      quota: balances[0]?.quota ?? cfg.baseLeaveQuota,
      used: balances[0]?.used ?? 0,
      expiresAt: `31 Des ${year}`,
    },
    overtime: { minutes: ot.minutes, capHours: cfg.weeklyOvertimeCapHours },
    pendingRequests: pendLeave.n + pendOt.n,
    passkeys: passkeys.map((k) => k.id),
    announcements: anns.map((a) => ({
      ...a,
      date: tanggalPendek(a.createdAt.toISOString().slice(0, 10)),
    })),
    team: {
      total: team.length,
      present: present.length,
      // lima, bukan empat: baris avatar di Beranda memuat lima wajah lalu sebuah
      // gelembung "+N" untuk sisanya
      avatars: present.slice(0, 5).map((t) => ({
        id: t.id,
        initials: initials(t.name),
        /** nama depan saja yang ditampilkan di bawah avatar; nama lengkapnya
         *  dikirim utuh karena memenggalnya adalah urusan tampilan */
        name: t.name,
        /** the same colleague is a photo in the Tim tab; the stack on the Beranda
         *  should not show them as initials */
        photoKey: t.photoKey,
      })),
    },
  });
});
