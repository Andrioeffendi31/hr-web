import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  employees,
  leaveRequests,
  officeLocations,
} from "@/db/schema";
import { type AttStatus, todayWib } from "@/lib/hr";
import { statusHariSql } from "@/lib/kehadiran";
import type {
  AttEvent,
  DayDetail,
} from "@/app/(app)/(admin)/kehadiran/detail-modal";

/**
 * Satu hari milik satu karyawan, untuk dialog detail di /kehadiran.
 *
 * Dulu kueri ini hidup di dalam page.tsx dan dipicu `?open=<id>`, jadi membuka
 * satu baris berarti merender ulang SELURUH halaman papan — belasan kueri —
 * dan menutupnya sekali lagi. Sekarang dialognya dibuka oleh state di klien dan
 * hanya hari yang dibuka itu yang diambil.
 *
 * SATU kueri, bukan enam. Sebelumnya: hari libur setahun + `settings` (paralel),
 * lalu baris utamanya, lalu jejak + cuti ditolak + izin (paralel) — tiga
 * gelombang berurutan. Datanya sendiri segelintir baris, jadi yang dibayar bukan
 * rencana kuerinya melainkan perjalanan bolak-baliknya: tiap kueri paralel pada
 * pool yang masih dingin membuka koneksi TLS BARU ke Neon (±230 ms sekali jabat
 * tangan), dan tiga gelombang itu menjadi ±900 ms sebelum satu byte pun dikirim.
 * Semuanya muat di satu pernyataan: hari libur dan `tracking_since` menjadi
 * subkueri di dalam `statusHarianSql`, dan tiga kueri sisanya menjadi subkueri
 * json skalar.
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

  // hari libur dan `tracking_since` ikut sebagai subkueri di dalamnya, jadi
  // tidak ada satu pun kueri pendahulu sebelum yang di bawah ini
  const statusText = statusHariSql(date);
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
      /**
       * Garis waktunya. `ae.id` sebagai pemecah seri, bukan `ae.at` sendirian:
       * ping yang tiba bersamaan punya stempel waktu yang sama persis, dan
       * urutan mereka dulu diserahkan pada kebetulan rencana kueri — dua kali
       * membuka hari yang sama bisa memberi dua urutan.
       */
      events: sql<AttEvent[]>`coalesce((
        select json_agg(json_build_object(
          'id', ae.id, 'kind', ae.kind, 'at', ae.at, 'location', ae.location,
          'lat', ae.lat::text, 'lng', ae.lng::text, 'photoUrl', ae.photo_url,
          'note', ae.note, 'suspect', ae.suspect
        ) order by ae.at, ae.id)
        from ${attendanceEvents} ae where ae.attendance_id = ${attendance.id}
      ), '[]'::json)`.as("events"),
      /** Pengajuan yang DITOLAK dan mencakup hari ini — konteks, bukan status. */
      ditolak: sql<DayDetail["ditolak"]>`(
        select json_build_object(
          'type', lr.type, 'startDate', lr.start_date,
          'endDate', lr.end_date, 'note', lr.decision_note)
        from ${leaveRequests} lr
        where lr.employee_id = ${employees.id} and lr.status = 'ditolak'
          and lr.start_date <= ${date}::date and lr.end_date >= ${date}::date
        order by lr.id desc limit 1
      )`.as("ditolak"),
      /**
       * Izin setengah hari yang disetujui. Jamnya wajib menurut
       * /api/me/requests tapi kolomnya nullable, jadi baris tanpa jam tidak
       * boleh mendarat di sini sama sekali — `is not null` menyaringnya, persis
       * seperti yang dulu dilakukan `izinSetengahHari()` di sisi Node.
       */
      izin: sql<DayDetail["izin"]>`(
        select json_build_object(
          'start', to_char(lr.start_time, 'HH24:MI'),
          'end', to_char(lr.end_time, 'HH24:MI'))
        from ${leaveRequests} lr
        where lr.employee_id = ${employees.id}
          and lr.type = 'Izin Setengah Hari' and lr.status = 'disetujui'
          and lr.start_date <= ${date}::date and lr.end_date >= ${date}::date
          and lr.start_time is not null and lr.end_time is not null
        order by lr.id desc limit 1
      )`.as("izin"),
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

  const detail: DayDetail = {
    ...row,
    date,
    status: row.status as AttStatus,
    // `at` mendarat dari json sebagai teks ISO; klien memanggil `new Date()`
    // atasnya persis seperti dulu, jadi tidak ada yang perlu diubah di sana
    events: row.events,
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
