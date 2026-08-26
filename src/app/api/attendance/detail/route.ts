import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  employees,
  officeLocations,
} from "@/db/schema";
import { type AttStatus, jam, todayWib } from "@/lib/hr";
import {
  cutiDitolak,
  izinSetengahHari,
  mulaiCatat,
  statusHarianSql,
} from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
import type { DayDetail } from "@/app/(app)/(admin)/kehadiran/detail-modal";

/**
 * Satu hari milik satu karyawan, untuk dialog detail di /kehadiran.
 *
 * Dulu kueri ini hidup di dalam page.tsx dan dipicu `?open=<id>`, jadi membuka
 * satu baris berarti merender ulang SELURUH halaman papan — belasan kueri —
 * dan menutupnya sekali lagi. Sekarang dialognya dibuka oleh state di klien dan
 * hanya hari yang dibuka itu yang diambil.
 *
 * `employee` adalah id KARYAWAN, bukan id absensi: hari tanpa keterangan tidak
 * punya baris absensi sama sekali, jadi kunci berbasis absensi membuat justru
 * hari yang paling perlu dibuka menjadi satu-satunya yang tidak bisa dibuka.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const url = new URL(req.url);
  const employeeId = Number(url.searchParams.get("employee"));
  const date = url.searchParams.get("date") ?? todayWib();
  if (!Number.isInteger(employeeId) || employeeId <= 0)
    return Response.json({ error: "Karyawan tidak sah" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "Tanggal tidak sah" }, { status: 400 });

  const [libur, sejak] = await Promise.all([
    holidaySet(Number(date.slice(0, 4))),
    mulaiCatat(),
  ]);
  const statusText = statusHarianSql(date, todayWib(), libur, true, sejak);
  const peninjau = alias(employees, "peninjau");

  const [row] = await db
    .select({
      attendanceId: attendance.id,
      employeeId: employees.id,
      name: employees.name,
      nik: employees.nik,
      division: employees.division,
      photoUrl: employees.photoUrl,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: sql<string>`${statusText}`.as("status"),
      location: attendance.location,
      selfieUrl: attendance.selfieUrl,
      lateReason: attendance.lateReason,
      earlyReason: attendance.earlyReason,
      awayReason: attendance.awayReason,
      reviewOk: attendance.reviewOk,
      reviewNote: attendance.reviewNote,
      reviewedAt: attendance.reviewedAt,
      reviewedBy: peninjau.name,
      officeName: officeLocations.name,
      officeLat: officeLocations.lat,
      officeLng: officeLocations.lng,
      officeRadius: officeLocations.radiusM,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
    )
    // the office this day was punched against — left, because a WFH day and any
    // row from before locations existed simply has none
    .leftJoin(officeLocations, eq(officeLocations.id, attendance.locationId))
    // siapa yang meninjau alasannya; left, karena sebagian besar hari tidak
    // punya alasan untuk ditinjau
    .leftJoin(peninjau, eq(peninjau.id, attendance.reviewedById))
    .where(and(eq(employees.id, employeeId), eq(employees.active, true)))
    .limit(1);

  if (!row)
    return Response.json(
      { error: "Karyawan tidak ditemukan" },
      { status: 404 },
    );

  const [events, ditolak, izin] = await Promise.all([
    row.attendanceId
      ? db
          .select({
            id: attendanceEvents.id,
            kind: attendanceEvents.kind,
            at: attendanceEvents.at,
            location: attendanceEvents.location,
            lat: attendanceEvents.lat,
            lng: attendanceEvents.lng,
            photoUrl: attendanceEvents.photoUrl,
            note: attendanceEvents.note,
            suspect: attendanceEvents.suspect,
          })
          .from(attendanceEvents)
          .where(eq(attendanceEvents.attendanceId, row.attendanceId))
          .orderBy(asc(attendanceEvents.at))
      : [],
    cutiDitolak(employeeId, date),
    izinSetengahHari(employeeId, date),
  ]);

  const detail: DayDetail = {
    ...row,
    date,
    status: row.status as AttStatus,
    events,
    ditolak,
    izin: izin ? { start: jam(izin.startTime), end: jam(izin.endTime) } : null,
    office: row.officeLat
      ? {
          name: row.officeName!,
          lat: Number(row.officeLat),
          lng: Number(row.officeLng),
          radius: row.officeRadius!,
        }
      : null,
  };

  // no-store: statusnya berubah sepanjang hari, dan dialog yang dibuka ulang
  // sesudah absen keluar harus memperlihatkannya
  return Response.json(detail, { headers: { "cache-control": "no-store" } });
}
