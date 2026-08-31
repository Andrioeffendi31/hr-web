/**
 * Kueri di balik setiap laporan, terpisah dari cara ia disajikan.
 *
 * Dulu semuanya hidup di dalam `api/export/[report]/route.ts`, terkunci di balik
 * `Request` dan `requireAdmin()`. Itu tidak jadi masalah selama satu-satunya
 * pembacanya adalah tombol "Unduh CSV". Sejak ada arsip bulanan — sebuah script
 * yang jalan di GitHub Action, tanpa request dan tanpa sesi — kuerinya harus bisa
 * dipanggil tanpa HTTP.
 *
 * Yang dijaga di sini bukan kerapian, melainkan kesamaan: arsip Excel adalah
 * SATU-SATUNYA sisa data setelah `db/purge.ts` menghapus yang mentah. Kalau
 * kuerinya disalin, salinan itu akan menyimpang, dan yang menyimpang adalah
 * satu-satunya yang tersisa. Satu badan kueri, dua penyaji.
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { ATT_LABEL, durasi, jam, jamWib, todayWib } from "@/lib/hr";
import {
  dowSql,
  hariKerjaSql,
  mulaiCatat,
  rekapSql,
  statusHarianSql,
  type RekapBaris,
} from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
import { REQ_LABEL } from "@/components/bits";

/** Satu laporan sebagai tabel mentah: CSV dan sheet Excel sama-sama tinggal menulisnya. */
export type Laporan = { headers: string[]; rows: (string | number | null)[][] };

/**
 * Daftar laporan — satu sumber untuk tiga pembaca: kartu unduh di /laporan,
 * validasi `key` di route ekspor, dan nama sheet di workbook arsip.
 *
 * Judul kartunya sekaligus menjadi nama sheet, jadi keduanya tidak akan pernah
 * berbeda tanpa ada yang menyadarinya. Semua label di bawah aman sebagai nama
 * sheet Excel: ≤31 karakter dan tanpa `[ ] : * ? / \`.
 */
export const REPORTS = [
  {
    key: "kehadiran",
    label: "Rekap Kehadiran",
    desc: "Masuk, keluar, dan status harian per karyawan",
  },
  {
    key: "keterlambatan",
    label: "Rekap Keterlambatan",
    desc: "Jumlah dan menit keterlambatan per karyawan",
  },
  {
    key: "cuti",
    label: "Rekap Cuti & Izin",
    desc: "Pengajuan, durasi, dan saldo terpakai",
  },
  {
    key: "lembur",
    label: "Rekap Lembur",
    desc: "Jam lembur dan tipe hari per karyawan",
  },
  {
    key: "divisi",
    label: "Absensi per Divisi",
    desc: "Tingkat kehadiran agregat tiap divisi",
  },
  {
    key: "karyawan",
    label: "Daftar Karyawan Aktif",
    desc: "Data kepegawaian siap audit",
  },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

export type Rentang = { from: string; to: string; div?: string | null };

const divisiWhere = (div?: string | null) =>
  div && div !== "all" ? eq(employees.division, div) : undefined;

/**
 * Rekap kehadiran — menyusuri HARI, bukan baris absensi.
 *
 * Bentuknya sama dengan `bulanKaryawan()` di lib/kehadiran.ts: hari yang dibolos
 * wajib muncul, dan itu tidak mungkin kalau yang dipetakan adalah baris yang ada.
 *
 * ponytail: satu baris per karyawan per hari kerja (±22 × jumlah karyawan
 * sebulan). Kalau nanti ribuan karyawan, streaming CSV atau tabel ringkasan —
 * bukan sebelum itu.
 */
export async function laporanKehadiran({
  from,
  to,
  div,
}: Rentang): Promise<Laporan> {
  const today = todayWib();
  const divWhere = divisiWhere(div);

  // dua tahun kalau rentangnya melewati Tahun Baru; satu set libur dari tahun
  // `from` saja membuat Januari tampak penuh hari tanpa keterangan
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const libur = new Set([
    ...(await holidaySet(y1)),
    ...(y2 !== y1 ? await holidaySet(y2) : []),
  ]);
  const kerja = sql`hk.kerja`;
  // aturan yang sama dengan papan /kehadiran — CSV yang berbeda dari layar
  // yang mengekspornya lebih buruk daripada tidak ada CSV sama sekali
  const st = statusHarianSql(sql`hk.d`, today, libur, kerja, await mulaiCatat());

  const data = (
    await db.execute(sql`
      select hk.d::text as date,
        ${employees.nik} as nik,
        ${employees.name} as name,
        ${employees.division} as division,
        ${employees.position} as position,
        ${attendance.clockIn} as "clockIn",
        ${attendance.clockOut} as "clockOut",
        ${st} as status,
        ${attendance.location} as location
      from ${employees}
      cross join lateral (
        select d::date as d,
          ${hariKerjaSql(dowSql(sql`d`))}
            ${
              libur.size
                ? sql`and d::date not in (${sql.join(
                    [...libur].map((t) => sql`${t}::date`),
                    sql`, `,
                  )})`
                : sql``
            } as kerja
        from generate_series(${from}::date, ${to}::date, interval '1 day') d
      ) hk
      left join ${attendance}
        on ${attendance.employeeId} = ${employees.id} and ${attendance.date} = hk.d
      where ${and(eq(employees.active, true), divWhere)}
        -- hari libur hanya kalau ada absennya: lembur Sabtu tetap terlihat,
        -- Sabtu yang kosong tidak dituduh apa-apa
        and (hk.kerja or ${attendance.id} is not null)
        and hk.d <= ${today}::date
      order by hk.d asc, ${employees.name} asc
    `)
  ).rows as {
    date: string;
    nik: string;
    name: string;
    division: string | null;
    position: string | null;
    clockIn: string | null;
    clockOut: string | null;
    status: string;
    location: string | null;
  }[];

  return {
    headers: [
      "Tanggal",
      "NIK",
      "Nama",
      "Divisi",
      "Jabatan",
      "Masuk",
      "Keluar",
      "Status",
      "Lokasi",
    ],
    rows: data.map((r) => [
      r.date,
      r.nik,
      r.name,
      r.division,
      r.position,
      jam(r.clockIn),
      jam(r.clockOut),
      ATT_LABEL[r.status as keyof typeof ATT_LABEL],
      r.location ?? "",
    ]),
  };
}

export async function laporanKeterlambatan({
  from,
  to,
  div,
}: Rentang): Promise<Laporan> {
  const data = await db
    .select({
      nik: employees.nik,
      name: employees.name,
      division: employees.division,
      // `review_ok is not true` bukan `is false`: yang belum ditinjau masih
      // terhitung terlambat. Satu-satunya kueri di aplikasi ini yang membaca
      // kolom status mentah, jadi satu-satunya yang harus menyaring pemutihan
      // sendiri — statusHarianSql() sudah melakukannya untuk semua yang lain.
      telat:
        sql<number>`count(*) filter (where ${attendance.status} = 'telat' and ${attendance.reviewOk} is not true)`.mapWith(
          Number,
        ),
      hari: sql<number>`count(${attendance.id})`.mapWith(Number),
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(
        eq(attendance.employeeId, employees.id),
        gte(attendance.date, from),
        lte(attendance.date, to),
      ),
    )
    .where(and(eq(employees.active, true), divisiWhere(div)))
    .groupBy(employees.id, employees.nik, employees.name, employees.division)
    .orderBy(asc(employees.name));

  return {
    headers: ["NIK", "Nama", "Divisi", "Jumlah terlambat", "Hari tercatat"],
    rows: data.map((r) => [r.nik, r.name, r.division, r.telat, r.hari]),
  };
}

export async function laporanCuti({
  from,
  to,
  div,
}: Rentang): Promise<Laporan> {
  const delegate = alias(employees, "delegate");
  const data = await db
    .select({
      nik: employees.nik,
      name: employees.name,
      division: employees.division,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      startTime: leaveRequests.startTime,
      endTime: leaveRequests.endTime,
      days: leaveRequests.days,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      delegateName: delegate.name,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
    .where(
      and(
        gte(leaveRequests.startDate, from),
        lte(leaveRequests.startDate, to),
        divisiWhere(div),
      ),
    )
    .orderBy(asc(leaveRequests.startDate));

  return {
    headers: [
      "NIK",
      "Nama",
      "Divisi",
      "Jenis",
      "Mulai",
      "Selesai",
      // kolomnya sendiri, bukan disisipkan ke "Jenis": kolom yang isinya
      // kadang tanggal kadang jam adalah kolom yang tidak bisa disortir
      "Jam izin",
      "Hari kerja",
      "Status",
      "Pengganti",
      "Alasan",
    ],
    rows: data.map((r) => [
      r.nik,
      r.name,
      r.division,
      r.type,
      r.startDate,
      r.endDate,
      r.startTime && r.endTime ? `${jam(r.startTime)}-${jam(r.endTime)}` : "",
      r.days,
      REQ_LABEL[r.status],
      r.delegateName ?? "",
      r.reason,
    ]),
  };
}

export async function laporanLembur({
  from,
  to,
  div,
}: Rentang): Promise<Laporan> {
  const data = await db
    .select({
      nik: employees.nik,
      name: employees.name,
      division: employees.division,
      date: overtimeRequests.date,
      startTime: overtimeRequests.startTime,
      endTime: overtimeRequests.endTime,
      minutes: overtimeRequests.minutes,
      kind: overtimeRequests.kind,
      status: overtimeRequests.status,
    })
    .from(overtimeRequests)
    .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
    .where(
      and(
        gte(overtimeRequests.date, from),
        lte(overtimeRequests.date, to),
        divisiWhere(div),
      ),
    )
    .orderBy(asc(overtimeRequests.date));

  return {
    headers: [
      "NIK",
      "Nama",
      "Divisi",
      "Tanggal",
      "Mulai",
      "Selesai",
      "Durasi",
      "Tipe",
      "Status",
    ],
    rows: data.map((r) => [
      r.nik,
      r.name,
      r.division,
      r.date,
      jam(r.startTime),
      jam(r.endTime),
      durasi(r.minutes),
      r.kind,
      REQ_LABEL[r.status],
    ]),
  };
}

export async function laporanDivisi({ from, to }: Rentang): Promise<Laporan> {
  const hariIni = todayWib();
  const data = (
    await db.execute(
      rekapSql({
        sejak: await mulaiCatat(),
        dari: from,
        sampai: to < hariIni ? to : hariIni,
        hariIni,
        libur: await holidaySet(Number(from.slice(0, 4))),
        pilih: sql`${employees.division} as division`,
        groupBy: sql`${employees.division}`,
        where: eq(employees.active, true),
        orderBy: sql`${employees.division} asc`,
      }),
    )
  ).rows as (RekapBaris & { division: string | null })[];

  return {
    headers: [
      "Divisi",
      "Hadir",
      "Terlambat",
      "Cuti/izin/sakit",
      "Tanpa keterangan",
      "Tingkat kehadiran (%)",
    ],
    rows: data.map((r) => [
      r.division ?? "Tanpa divisi",
      r.hadir,
      r.telat,
      r.cuti,
      r.alpa,
      r.hari ? Math.round(((r.hadir + r.telat) / r.hari) * 100) : 0,
    ]),
  };
}

export async function laporanKaryawan({ div }: Rentang): Promise<Laporan> {
  const manager = alias(employees, "manager");
  const data = await db
    .select({
      nik: employees.nik,
      name: employees.name,
      email: employees.email,
      division: employees.division,
      position: employees.position,
      contractType: employees.contractType,
      joinedAt: employees.joinedAt,
      workLocation: employees.workLocation,
      managerName: manager.name,
      active: employees.active,
    })
    .from(employees)
    .leftJoin(manager, eq(manager.id, employees.managerId))
    .where(divisiWhere(div))
    .orderBy(asc(employees.name));

  return {
    headers: [
      "NIK",
      "Nama",
      "Email",
      "Divisi",
      "Jabatan",
      "Tipe kontrak",
      "Mulai kerja",
      "Lokasi kerja",
      "Atasan langsung",
      "Status",
    ],
    rows: data.map((r) => [
      r.nik,
      r.name,
      r.email,
      r.division,
      r.position,
      r.contractType,
      r.joinedAt,
      r.workLocation,
      r.managerName ?? "",
      r.active ? "Aktif" : "Tidak aktif",
    ]),
  };
}

/** Satu tempat memilih laporan — dipakai route ekspor maupun arsip bulanan. */
export const LAPORAN: Record<ReportKey, (o: Rentang) => Promise<Laporan>> = {
  kehadiran: laporanKehadiran,
  keterlambatan: laporanKeterlambatan,
  cuti: laporanCuti,
  lembur: laporanLembur,
  divisi: laporanDivisi,
  karyawan: laporanKaryawan,
};

/**
 * Jejak mentah di balik rekap kehadiran: setiap baris `attendance_events`.
 *
 * TIDAK ada di `REPORTS` dan tidak muncul sebagai tombol unduh — ini bukan
 * laporan yang dibaca orang di layar, melainkan isi arsip. Alasannya satu:
 * `db/purge.ts` menghapus `attendance_events` beserta objek fotonya, sedangkan
 * Rekap Kehadiran hanya menyimpan ringkasan harian. Tanpa sheet ini, purge
 * menghancurkan seluruh jejak GPS, catatan, dan penanda GPS palsu tanpa
 * meninggalkan satu baris pun di mana pun.
 *
 * Kolom "Kunci foto" sengaja ikut walau fotonya nanti dihapus: ia bukti bahwa
 * foto itu pernah ada dan pernah bernama itu, satu-satunya yang tersisa untuk
 * dicocokkan kalau suatu hari ada cadangan bucket yang perlu ditelusuri.
 */
export async function jejakKehadiran({ from, to }: Rentang): Promise<Laporan> {
  const data = await db
    .select({
      date: attendance.date,
      nik: employees.nik,
      name: employees.name,
      kind: attendanceEvents.kind,
      at: attendanceEvents.at,
      location: attendanceEvents.location,
      lat: attendanceEvents.lat,
      lng: attendanceEvents.lng,
      note: attendanceEvents.note,
      suspect: attendanceEvents.suspect,
      photoUrl: attendanceEvents.photoUrl,
    })
    .from(attendanceEvents)
    .innerJoin(attendance, eq(attendance.id, attendanceEvents.attendanceId))
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .where(and(gte(attendance.date, from), lte(attendance.date, to)))
    // `id` sebagai pemecah seri: ping yang tiba bersamaan punya stempel waktu
    // sama persis, dan arsip yang urutannya berubah tiap kali dibuat bukan arsip
    .orderBy(asc(attendanceEvents.at), asc(attendanceEvents.id));

  return {
    headers: [
      "Tanggal",
      "NIK",
      "Nama",
      "Jenis",
      "Waktu",
      "Lokasi",
      "Lat",
      "Lng",
      "Catatan",
      "Penanda curiga",
      "Kunci foto",
    ],
    rows: data.map((r) => [
      r.date,
      r.nik,
      r.name,
      r.kind,
      jamWib(r.at),
      r.location ?? "",
      r.lat ?? "",
      r.lng ?? "",
      r.note ?? "",
      r.suspect ?? "",
      r.photoUrl ?? "",
    ]),
  };
}
