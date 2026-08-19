import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  divisions,
  employees,
  leaveRequests,
  officeLocations,
  settings,
} from "@/db/schema";
import { HARI_KERJA_DEFAULT, todayWib } from "./hr";
import { holidaySet } from "./leave";

/**
 * Status kehadiran harian, dinyatakan dalam SQL.
 *
 * Aturannya sama persis dengan `statusHarian()` di lib/hr.ts dan urutannya wajib
 * cocok — versi TS dipakai untuk satu baris (riwayat karyawan, detail hari), versi
 * ini untuk memfilter, menghitung, dan memaginasi ribuan baris tanpa menariknya
 * dulu ke Node. hr.check.ts menjaga versi TS; yang menjaga keduanya tetap sejalan
 * adalah kenyataan bahwa keduanya pendek dan berdampingan di satu commit.
 *
 * Yang diperbaiki di sini, di luar status baru: sebelumnya tidak ada satu pun kode
 * yang menulis status `cuti`/`izin`/`sakit` ke tabel absensi — menyetujui cuti
 * tidak membuat baris apa pun. Akibatnya karyawan yang sedang cuti resmi tetap
 * terhitung "belum absen" dan tetap dikirimi pengingat. Sekarang cutinya dibaca
 * langsung dari pengajuan yang disetujui, jadi tidak ada lagi baris yang perlu
 * ditulis dan tidak ada lagi yang salah tuduh.
 */

/**
 * Sejak kapan aplikasi ini mencatat kehadiran (`settings.tracking_since`), atau
 * null kalau tanpa batas.
 *
 * Dibaca per permintaan, bukan dititipkan lewat argumen dari halaman ke halaman:
 * satu select baris tunggal jauh lebih murah daripada satu parameter yang kelak
 * lupa diteruskan di satu tempat — dan tempat yang lupa itulah yang akan menuduh
 * orang untuk hari yang tidak pernah direkam.
 */
export async function mulaiCatat(): Promise<string | null> {
  const [row] = await db
    .select({ sejak: settings.trackingSince })
    .from(settings)
    .limit(1);
  return row?.sejak ?? null;
}

/** Jenis cuti yang DISETUJUI dan mencakup tanggal ini, atau NULL. */
export const cutiPadaTanggal = (tanggal: Tanggal): SQL<string | null> => sql`(
  select lr.type from ${leaveRequests} lr
  where lr.employee_id = ${employees.id}
    and lr.status = 'disetujui'
    and lr.start_date <= ${tanggal}
    and lr.end_date >= ${tanggal}
  limit 1
)`;

/**
 * Izin setengah hari yang DISETUJUI pada tanggal itu — jamnya, bukan sekadar
 * ada-tidaknya.
 *
 * Dipakai jalur absen dan bootstrap ponsel untuk menggeser batas keterlambatan
 * (`geserShift()` di lib/hr.ts). Terpisah dari `cutiPadaTanggal` karena itu
 * subkueri skalar di dalam kueri papan, sementara ini satu baris untuk satu
 * orang pada satu hari.
 */
export async function izinSetengahHari(employeeId: number, tanggal: string) {
  const [row] = await db
    .select({
      startTime: leaveRequests.startTime,
      endTime: leaveRequests.endTime,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.type, "Izin Setengah Hari"),
        eq(leaveRequests.status, "disetujui"),
        lte(leaveRequests.startDate, tanggal),
        gte(leaveRequests.endDate, tanggal),
      ),
    )
    .orderBy(desc(leaveRequests.id))
    .limit(1);
  // jamnya wajib menurut /api/me/requests, tapi kolomnya nullable — baris tanpa
  // jam tidak boleh menggeser apa pun
  return row?.startTime && row.endTime
    ? { startTime: row.startTime, endTime: row.endTime }
    : null;
}

/**
 * Hari kerja divisi karyawan pada baris ini; NULL mewarisi default perusahaan,
 * persis seperti jam shift. Subkueri skalar, bukan join, supaya setiap pemanggil
 * `statusHarianSql` tetap menulis kuerinya sendiri tanpa tahu soal tabel divisi —
 * sama seperti `cutiPadaTanggal` di atas.
 */
const hariKerjaDivisi = sql`coalesce(
  (select d.work_days from ${divisions} d where d.name = ${employees.division}),
  ${sql.raw(`ARRAY[${HARI_KERJA_DEFAULT.join(",")}]`)}
)`;

/** Apakah nomor hari ini (0 = Minggu … 6 = Sabtu) hari kerja bagi karyawan itu. */
export const hariKerjaSql = (dow: SQL | number): SQL =>
  sql`${dow} = any(${hariKerjaDivisi})`;

/** Nomor hari dari sebuah ekspresi tanggal SQL. */
export const dowSql = (tanggal: SQL): SQL =>
  sql`extract(dow from ${tanggal})::int`;

/**
 * Tanggal yang dinilai: satu literal (papan harian) atau sebuah ekspresi SQL
 * (rekap, yang menilai tiap hari dalam rentang lewat `generate_series`).
 */
type Tanggal = string | SQL;

/**
 * Status akhir sebagai teks. Untuk tanggal literal `lewat` dihitung sekali di JS —
 * papan hanya pernah menampilkan satu tanggal, jadi "hari kerja yang sudah lewat"
 * adalah satu boolean, bukan perhitungan per baris. Untuk ekspresi SQL, akhir pekan
 * dan hari libur sudah disaring oleh `hariKerjaDalamRentang`, jadi cukup bandingkan
 * tanggalnya dengan hari ini.
 */
export function statusHarianSql(
  tanggal: Tanggal,
  hariIni: string,
  libur: Set<string> = new Set(),
  /** Untuk tanggal berupa ekspresi: apakah hari itu hari kerja bagi karyawan ini.
   *  Hanya perlu kalau kuerinya ikut memuat hari libur (riwayat karyawan
   *  memuatnya kalau ada absennya). */
  hariKerja: SQL | boolean = true,
  /** `settings.tracking_since` — hari sebelum ini tidak dinilai sama sekali. */
  sejak: string | null = null,
): SQL<string> {
  // Dua pertanyaan terpisah: apakah hari itu hari kerja ORANG INI, dan apakah
  // harinya sudah lewat. Tanggal literal sudah diketahui nomor harinya di JS, jadi
  // yang tersisa untuk SQL hanyalah hari kerja divisinya.
  const kerja =
    typeof tanggal === "string"
      ? libur.has(tanggal)
        ? sql`false`
        : hariKerjaSql(new Date(`${tanggal}T00:00:00Z`).getUTCDay())
      : hariKerja === true
        ? sql`true`
        : hariKerja;
  const lewat =
    typeof tanggal === "string"
      ? sql.raw(tanggal < hariIni ? "true" : "false")
      : sql`${tanggal} < ${hariIni}::date`;
  /**
   * Sebelum aplikasi ini mulai mencatat. Diperiksa SESUDAH baris tersimpan dan
   * SESUDAH cuti: kalau ternyata ada catatannya (mis. diimpor dari sistem lama),
   * catatan itu yang benar — batas ini hanya menjawab hari yang kosong.
   */
  const belumDicatat = !sejak
    ? sql`false`
    : typeof tanggal === "string"
      ? sql.raw(tanggal < sejak ? "true" : "false")
      : sql`${tanggal} < ${sejak}::date`;
  const cuti = cutiPadaTanggal(tanggal);
  return sql`case
    -- Keterlambatan yang alasannya diterima admin. Di ATAS cabang berikutnya,
    -- karena cabang itu mengembalikan kolom mentah dan akan menang. Barisnya
    -- tetap 'telat' di database — yang berubah hanyalah apa yang dibaca setiap
    -- papan, rekap, laporan dan riwayat, yaitu semua yang memanggil fungsi ini.
    when ${attendance.status} = 'telat' and ${attendance.reviewOk} then 'hadir'
    -- Baris tersimpan menang, KECUALI kalau isinya 'belum_absen': baris seperti itu
    -- tidak memuat informasi apa pun (tidak ada jam masuk) dan hanya dibuat oleh
    -- seed. Membiarkannya menang berarti hari kerja yang sudah lewat tetap tampil
    -- "belum absen" selamanya — persis keadaan yang fitur ini perbaiki.
    when ${attendance.status} is not null and ${attendance.status} <> 'belum_absen'
      then ${attendance.status}::text
    when ${cuti} = 'Cuti Sakit'  then 'sakit'
    when ${cuti} = 'Izin Khusus' then 'izin'
    -- Izin setengah hari hanya sampai ke sini kalau TIDAK ada absennya sama
    -- sekali (cabang di atas menang): hari yang diizinkan separuh lalu tidak
    -- dihadiri separuhnya juga bukan hari yang bisa dituduh tanpa keterangan.
    when ${cuti} = 'Izin Setengah Hari' then 'izin'
    when ${cuti} is not null      then 'cuti'
    -- Aplikasi belum ada di sana: hari itu tidak dinilai, tidak dituduh, dan tidak
    -- masuk penyebut rekap. Tanpa cabang ini, sistem yang baru dipasang melaporkan
    -- seluruh karyawan tanpa keterangan untuk setiap hari kerja di masa lalu.
    when ${belumDicatat} then 'belum_dicatat'
    -- Hari libur divisinya (atau libur nasional) bukan hari yang bisa dibolos, dan
    -- juga bukan hari yang perlu ditagih absennya.
    when not (${kerja}) then 'libur'
    when ${lewat} then 'tanpa_keterangan'
    else 'belum_absen'
  end`;
}

/** Ember filter kartu statistik — cerminan `statusGroup()` di lib/hr.ts. */
export function grupSql(status: SQL<string>) {
  return {
    hadir: sql`${status} in ('hadir','wfh')`,
    telat: sql`${status} = 'telat'`,
    cuti: sql`${status} in ('cuti','izin','sakit')`,
    belum: sql`${status} = 'belum_absen'`,
    alpa: sql`${status} = 'tanpa_keterangan'`,
  } as const;
}

export type GrupStatus = keyof ReturnType<typeof grupSql>;

/**
 * Adakah titik mencurigakan pada absensi hari ini? Subkueri skalar dengan pola
 * yang sama seperti `cutiPadaTanggal`, jadi papan tidak perlu join tambahan.
 * Ada indeks parsial untuk ini (`att_events_suspect`, migrasi 0008) — barisnya
 * segelintir, jadi pertanyaannya murah meski ditanyakan per baris.
 */
export const adaCurigaSql = sql<boolean>`exists (
  select 1 from ${attendanceEvents} ae
  where ae.attendance_id = ${attendance.id} and ae.suspect is not null
)`;

/**
 * Rekap dihitung dari HARI KERJA, bukan dari baris absensi.
 *
 * Yang lama: `count(*)` di atas LEFT JOIN attendance. Tidak masuk = tidak ada baris
 * sama sekali, jadi kolom "Absen" praktis selalu 0 dan bar tingkat kehadiran membaca
 * ~100% untuk orang yang tidak pernah datang. Di sini penyebutnya adalah hari kerja
 * itu sendiri — `generate_series` yang disaring akhir pekan dan hari libur — lalu
 * tiap hari dinilai dengan `statusHarianSql` yang sama seperti papan harian.
 * Hasilnya konsisten menurut konstruksi: hadir + telat + cuti + alpa = hari.
 *
 * `sampai` harus sudah dibatasi ke hari ini oleh pemanggil; hari yang belum tiba
 * bukan hari yang bisa dibolos.
 *
 * ponytail: satu baris per karyawan per hari kerja (±22 × jumlah karyawan sebulan).
 * Ratusan karyawan masih jauh di bawah satu detik; kalau nanti ribuan, materialisasi
 * per hari lewat tabel ringkasan — bukan sebelum itu.
 */
export function rekapSql(o: {
  dari: string;
  sampai: string;
  hariIni: string;
  libur: Set<string>;
  /** Kolom pengelompokan, mis. sql`${employees.id}, ${employees.name}`. */
  /** `settings.tracking_since`; hari sebelumnya tidak masuk penyebut */
  sejak?: string | null;
  pilih: SQL;
  groupBy: SQL;
  where?: SQL;
  orderBy?: SQL;
  limit?: number;
  offset?: number;
}): SQL {
  const hari = sql`hk.d`;
  const st = statusHarianSql(hari, o.hariIni, new Set(), true, o.sejak ?? null);
  const g = grupSql(st);
  return sql`
    select ${o.pilih},
      count(*) filter (where ${g.hadir})::int as hadir,
      count(*) filter (where ${g.telat})::int as telat,
      count(*) filter (where ${g.cuti})::int  as cuti,
      count(*) filter (where ${g.alpa})::int  as alpa,
      count(*)::int                           as hari
    from ${employees}
    cross join lateral (
      select d::date as d
      from generate_series(${o.dari}::date, ${o.sampai}::date, interval '1 day') d
      -- LATERAL, jadi baris ini boleh menyebut employees di atasnya: penyebutnya
      -- hari kerja ORANG ITU, bukan hari kerja rata-rata perusahaan
      where ${hariKerjaSql(dowSql(sql`d`))}
        ${o.sejak ? sql`and d::date >= ${o.sejak}::date` : sql``}
        ${
          o.libur.size
            ? sql`and d::date not in (${sql.join(
                [...o.libur].map((t) => sql`${t}::date`),
                sql`, `,
              )})`
            : sql``
        }
    ) hk
    left join ${attendance}
      on ${attendance.employeeId} = ${employees.id} and ${attendance.date} = hk.d
    where ${o.where ?? sql`true`}
    group by ${o.groupBy}
    ${o.orderBy ? sql`order by ${o.orderBy}` : sql``}
    ${o.limit !== undefined ? sql`limit ${o.limit}` : sql``}
    ${o.offset ? sql`offset ${o.offset}` : sql``}
  `;
}

/**
 * Riwayat sebulan milik satu karyawan — menyusuri HARI, bukan baris absensi.
 *
 * Yang lama memetakan baris `attendance` yang ada, jadi hari yang dibolos tidak
 * muncul sama sekali: karyawan tidak punya cara tahu dirinya tercatat tanpa
 * keterangan. Dipakai bersama oleh halaman web `/saya/kehadiran` dan endpoint
 * `/api/me/attendance` supaya keduanya tidak lagi menyimpan salinan aturannya.
 *
 * Akhir pekan dan hari libur ikut ditampilkan HANYA kalau ada absensinya —
 * lembur Sabtu tetap terlihat, tapi Sabtu yang kosong tidak dituduh apa-apa.
 */
export async function bulanKaryawan(employeeId: number, month: string) {
  const [y, m] = month.split("-").map(Number);
  // hari terakhir bulan tanpa tabel kalender: hari ke-0 bulan berikutnya
  const akhir = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const hariIni = todayWib();
  const libur = await holidaySet(y);
  const sejak = await mulaiCatat();
  const kerja = sql`hk.kerja`;
  const st = statusHarianSql(sql`hk.d`, hariIni, libur, kerja, sejak);

  const rows = (
    await db.execute(sql`
      select hk.d::text as date,
        ${attendance.clockIn} as "clockIn",
        ${attendance.clockOut} as "clockOut",
        ${attendance.location} as location,
        ${attendance.note} as note,
        ${attendance.selfieUrl} as "selfieKey",
        ${st} as status
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
        from generate_series(${`${month}-01`}::date, ${akhir}::date, interval '1 day') d
      ) hk
      left join ${attendance}
        on ${attendance.employeeId} = ${employees.id} and ${attendance.date} = hk.d
      where ${employees.id} = ${employeeId}
        and (hk.kerja or ${attendance.id} is not null)
        and hk.d <= ${hariIni}::date
      order by hk.d desc
    `)
  ).rows as {
    date: string;
    clockIn: string | null;
    clockOut: string | null;
    location: string | null;
    note: string | null;
    selfieKey: string | null;
    status: string;
  }[];

  const hitung = (...s: string[]) =>
    rows.filter((r) => s.includes(r.status)).length;

  return {
    days: rows,
    stats: {
      hadir: hitung("hadir", "wfh"),
      telat: hitung("telat"),
      cuti: hitung("cuti", "izin", "sakit"),
      tanpaKeterangan: hitung("tanpa_keterangan"),
    },
  };
}

/**
 * Satu hari milik satu karyawan, ada baris absensinya atau tidak.
 *
 * Dulu kedua pemanggilnya (halaman web dan endpoint telepon) menjawab 404 kalau
 * barisnya tidak ada — jadi justru hari tanpa keterangan, satu-satunya hari yang
 * perlu dijelaskan, tidak bisa dibuka sama sekali.
 */
export async function hariKaryawan(employeeId: number, tanggal: string) {
  const libur = await holidaySet(Number(tanggal.slice(0, 4)));
  const st = statusHarianSql(tanggal, todayWib(), libur, true, await mulaiCatat());
  const [row] = await db
    .select({
      id: attendance.id,
      date: sql<string>`${tanggal}`.as("date"),
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: sql<string>`${st}`.as("status"),
      location: attendance.location,
      note: attendance.note,
      selfieKey: attendance.selfieUrl,
      lateReason: attendance.lateReason,
      earlyReason: attendance.earlyReason,
      reviewOk: attendance.reviewOk,
      reviewNote: attendance.reviewNote,
      reviewedAt: attendance.reviewedAt,
      officeName: officeLocations.name,
      officeLat: officeLocations.lat,
      officeLng: officeLocations.lng,
      officeRadius: officeLocations.radiusM,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(
        eq(attendance.employeeId, employees.id),
        eq(attendance.date, tanggal),
      ),
    )
    .leftJoin(officeLocations, eq(officeLocations.id, attendance.locationId))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return null;
  const [ditolak, izin] = await Promise.all([
    cutiDitolak(employeeId, tanggal),
    izinSetengahHari(employeeId, tanggal),
  ]);
  return { ...row, ditolak, izin };
}

/**
 * Pengajuan cuti yang DITOLAK dan mencakup tanggal ini — konteks untuk hari tanpa
 * keterangan. Inilah yang membedakan "tidak pernah minta izin" dari "sudah minta,
 * ditolak, tetap tidak masuk", tanpa perlu status kedua: barisnya tetap menyimpan
 * tanggalnya, jadi tidak ada perubahan skema.
 */
export async function cutiDitolak(employeeId: number, tanggal: string) {
  const [row] = await db
    .select({
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      note: leaveRequests.decisionNote,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "ditolak"),
        lte(leaveRequests.startDate, tanggal),
        gte(leaveRequests.endDate, tanggal),
      ),
    )
    .orderBy(desc(leaveRequests.id))
    .limit(1);
  return row ?? null;
}

export type CutiDitolak = Awaited<ReturnType<typeof cutiDitolak>>;

export type RekapBaris = {
  hadir: number;
  telat: number;
  cuti: number;
  alpa: number;
  hari: number;
};
