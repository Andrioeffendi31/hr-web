import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements,
  attendance,
  officeLocations,
} from "@/db/schema";
import { initials, resolveShift, tanggalPendek, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";
import { config, withMe } from "@/lib/me";

/** Critical data needed to paint the first Home viewport. Large secondary lists
 *  (the team directory and full announcement bodies) use their own endpoints. */
export const GET = withMe(async (me) => {
  const today = todayWib();
  const year = Number(today.slice(0, 4));

  const [
    cfg,
    [att],
    balances,
    anns,
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
        id: announcements.id,
        title: announcements.title,
        category: announcements.category,
        pinned: announcements.pinned,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(2),
    /** every place this employee may punch from — the phone picks one and the
     *  server re-checks the geofence against whichever it picked */
    db
      .select()
      .from(officeLocations)
      .where(eq(officeLocations.active, true))
      .orderBy(asc(officeLocations.name)),
  ]);

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
    // Total lembur no longer appears on Home. Keep the response field for older
    // mobile builds without making every launch aggregate a month of requests.
    overtime: { minutes: 0, capHours: cfg.weeklyOvertimeCapHours },
    // Loaded by the screens that display them. Keep the response shape stable
    // while current cold-start avoids querying unrelated tables.
    pendingRequests: 0,
    passkeys: [],
    announcements: anns.map((a) => ({
      ...a,
      date: tanggalPendek(a.createdAt.toISOString().slice(0, 10)),
    })),
    // Team is below the first viewport and has its own endpoint. Returning the
    // compatibility shape keeps older clients safe without scanning every
    // employee during the critical bootstrap.
    team: {
      total: 0,
      present: 0,
      avatars: [],
    },
  });
});
