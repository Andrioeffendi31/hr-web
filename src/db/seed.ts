/** Seeds the demo dataset lifted from the "NanumHR Lite" mockup.
 *  Run: npm run db:seed  (idempotent — truncates first) */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "./index";
import {
  announcements,
  attendance,
  attendanceEvents,
  auditLog,
  divisions,
  documents,
  employees,
  holidays,
  leaveRequests,
  officeLocations,
  overtimeRequests,
  settings,
} from "./schema";
import { type Role } from "../lib/access";
import {
  attendanceStatus,
  overtimeMinutes,
  todayWib,
  workingDays,
} from "../lib/hr";

const TODAY = "2026-07-30";
/**
 * Skenario "tanpa keterangan": pengajuan izin ditolak, karyawannya tetap tidak
 * masuk dan tidak pernah absen. 16 Juli 2026 adalah hari Kamis, dan Joko ada di
 * Operations yang hari kerjanya Minggu–Kamis — jadi ini benar-benar hari kerjanya,
 * bukan Jumat yang justru hari liburnya. Baris absensinya sengaja tidak dibuat:
 * tidak masuk memang berarti tidak ada baris.
 */
const MANGKIR = { name: "Joko Susilo", date: "2026-07-16" } as const;

/** One password for every demo account, printed at the end of the seed. Dev and
 *  preview only — production accounts are changed by hand (README). */
const SEED_PASSWORD = "securePass123";

type Row = [
  name: string,
  nik: string,
  division: string,
  position: string,
  contract: "Tetap" | "Kontrak",
  joined: string,
  status: string,
  clockIn: string | null,
  clockOut: string | null,
  location: string,
];

const EMP: Row[] = [
  [
    "Andini Rahmawati",
    "NIS-0012",
    "Human Resource",
    "HR Admin",
    "Tetap",
    "2021-02-01",
    "hadir",
    "07:52",
    "17:04",
    "Kantor Pusat",
  ],
  [
    "Bagas Prasetyo",
    "NIS-0044",
    "Engineering",
    "Backend Engineer",
    "Tetap",
    "2022-03-14",
    "telat",
    "08:26",
    "17:12",
    "Kantor Pusat",
  ],
  [
    "Citra Maharani",
    "NIS-0051",
    "Engineering",
    "QA Engineer",
    "Tetap",
    "2022-08-02",
    "hadir",
    "07:45",
    null,
    "Kantor Pusat",
  ],
  [
    "Dimas Anggara",
    "NIS-0063",
    "Finance",
    "Accounting Staff",
    "Tetap",
    "2023-01-09",
    "wfh",
    "08:02",
    null,
    "Rumah · Bekasi",
  ],
  [
    "Eka Wulandari",
    "NIS-0070",
    "Marketing",
    "Content Lead",
    "Tetap",
    "2023-04-21",
    "cuti",
    null,
    null,
    "Cuti tahunan",
  ],
  [
    "Fajar Nugroho",
    "NIS-0078",
    "Engineering",
    "Frontend Engineer",
    "Kontrak",
    "2023-06-05",
    "hadir",
    "07:58",
    null,
    "Kantor Pusat",
  ],
  [
    "Gita Permata",
    "NIS-0085",
    "Human Resource",
    "Recruiter",
    "Tetap",
    "2023-09-18",
    "telat",
    "08:41",
    null,
    "Kantor Pusat",
  ],
  [
    "Hendra Saputra",
    "NIS-0091",
    "Operations",
    "Field Supervisor",
    "Tetap",
    "2023-11-03",
    "hadir",
    "07:12",
    null,
    "Gudang Cakung",
  ],
  [
    "Indah Lestari",
    "NIS-0098",
    "Finance",
    "Payroll Officer",
    "Tetap",
    "2024-02-12",
    "hadir",
    "07:49",
    null,
    "Kantor Pusat",
  ],
  [
    "Joko Susilo",
    "NIS-0104",
    "Operations",
    "Driver",
    "Kontrak",
    "2024-03-26",
    "belum_absen",
    null,
    null,
    null as unknown as string,
  ],
  [
    "Kirana Ayu",
    "NIS-0110",
    "Marketing",
    "Social Media",
    "Kontrak",
    "2024-07-08",
    "sakit",
    null,
    null,
    "Surat dokter",
  ],
  [
    "Lukman Hakim",
    "NIS-0117",
    "Engineering",
    "DevOps",
    "Tetap",
    "2024-08-19",
    "hadir",
    "07:35",
    null,
    "Kantor Pusat",
  ],
  [
    "Maya Sari",
    "NIS-0123",
    "Human Resource",
    "GA Staff",
    "Tetap",
    "2024-11-04",
    "belum_absen",
    null,
    null,
    null as unknown as string,
  ],
  [
    "Nanda Pratama",
    "NIS-0131",
    "Operations",
    "Warehouse",
    "Kontrak",
    "2025-01-13",
    "hadir",
    "06:58",
    null,
    "Gudang Cakung",
  ],
  [
    "Oktavia Rini",
    "NIS-0138",
    "Finance",
    "Tax Staff",
    "Tetap",
    "2025-03-17",
    "izin",
    null,
    null,
    "Izin keluarga",
  ],
  [
    "Putra Wijaya",
    "NIS-0145",
    "Marketing",
    "Designer",
    "Kontrak",
    "2025-06-02",
    "belum_absen",
    null,
    null,
    null as unknown as string,
  ],
];

const email = (name: string) =>
  name.toLowerCase().replace(/ /g, ".") + "@nanumindahsejati.co.id";

/** Deterministic pseudo-random so reseeding gives the same history. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

async function main() {
  await db.execute(
    sql`TRUNCATE TABLE audit_log, announcement_reads, documents, announcements, overtime_requests, leave_requests, leave_adjustments, attendance, employees, divisions, office_locations, holidays, settings RESTART IDENTITY CASCADE`,
  );

  await db.insert(settings).values({ id: 1 });

  /**
   * Divisions. Operations keeps its own shift on purpose: with every division
   * inheriting the default, nothing in the demo would ever exercise resolveShift,
   * and a warehouse crew starting at 07:00 is exactly why the feature exists.
   */
  await db.insert(divisions).values([
    { name: "Human Resource" },
    { name: "Engineering" },
    { name: "Finance" },
    { name: "Marketing" },
    {
      name: "Operations",
      shiftStart: "07:00:00",
      shiftEnd: "16:00:00",
      lateToleranceMinutes: 10,
      // Gudang jalan hari Minggu dan tutup hari Jumat–Sabtu. Divisi dengan hari
      // kerja sendiri ada di seed supaya jalur itu ikut teruji, bukan hanya
      // dipercaya: sebelum ada kolom ini, mereka tercatat "tanpa keterangan"
      // setiap Minggu dan "belum absen" setiap Jumat.
      workDays: [0, 1, 2, 3, 4],
    },
  ]);
  /** hari kerja divisi, nomor Postgres — cerminan tabel di atas */
  const hariKerjaOf = (division: string) =>
    division === "Operations" ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const shiftOf = (division: string) =>
    division === "Operations"
      ? { start: "07:00:00", startM: 7 * 60, tol: 10 }
      : { start: "08:00:00", startM: 8 * 60, tol: 15 };

  /** minutes-since-midnight back to HH:mm */
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const [pusat, gudang] = await db
    .insert(officeLocations)
    .values([
      {
        name: "Kantor Pusat",
        lat: "-6.224900",
        lng: "106.809200",
        radiusM: 150,
      },
      {
        name: "Gudang Cakung",
        lat: "-6.188900",
        lng: "106.939400",
        radiusM: 250,
      },
    ])
    .returning({ id: officeLocations.id, name: officeLocations.name });

  /** WFH and leave days have no office point; field staff punch at the warehouse. */
  const officeFor = (location: string | null) =>
    location === "Gudang Cakung"
      ? gudang.id
      : location === "Kantor Pusat"
        ? pusat.id
        : null;

  await db.insert(holidays).values([
    { date: "2026-08-17", name: "Hari Kemerdekaan RI" },
    { date: "2026-08-18", name: "Cuti Bersama Kemerdekaan", collective: true },
  ]);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const inserted = await db
    .insert(employees)
    .values(
      EMP.map(([name, nik, division, position, contractType, joinedAt], i) => ({
        nik,
        name,
        email: email(name),
        passwordHash,
        /**
         * Indeks 1 dijadikan Pimpinan supaya persetujuan cuti dua tingkat bisa
         * diuji sungguhan: tanpa satu pun Pimpinan di seed, smoke tidak punya cara
         * membuktikan bahwa tingkat kedua benar-benar wajib.
         */
        /**
         * Indeks 5 (Fajar Nugroho) dijadikan Pimpinan supaya persetujuan cuti dua
         * tingkat bisa diuji sungguhan — tanpa satu pun Pimpinan di seed, smoke
         * tidak punya cara membuktikan tingkat kedua benar-benar wajib.
         *
         * Bukan indeks 1: itu Bagas Prasetyo, fixture KARYAWAN yang dipakai seluruh
         * uji otorisasi peran di smoke.sh. Menaikkan perannya akan membuat seksi itu
         * hijau karena alasan yang salah.
         */
        role: (
          i === 0
            ? "hr_admin"
            : i === 5
              ? "pimpinan"
              : i === 7
                ? "manager"
                : "employee"
        ) as Role,
        division,
        position,
        contractType,
        joinedAt,
        workLocation:
          division === "Operations" ? "Gudang Cakung" : "Kantor Pusat",
        managerId: i === 0 ? null : 1,
      })),
    )
    .returning({ id: employees.id, name: employees.name });

  const idOf = (name: string) => inserted.find((e) => e.name === name)!.id;

  // today's board, verbatim from the mockup
  await db.insert(attendance).values(
    EMP.map(([name, , , , , , status, clockIn, clockOut, location]) => ({
      employeeId: idOf(name),
      date: TODAY,
      clockIn,
      clockOut,
      status: status as "hadir",
      location: location ?? null,
      locationId: clockIn ? officeFor(location ?? null) : null,
    })),
  );

  /**
   * Dua fixture alasan keterlambatan, di kedua sisi tinjauan admin:
   * Bagas menulis alasan yang BELUM ditinjau (harinya tetap terbaca terlambat,
   * dan papan menandainya perlu dilihat), Gita alasannya sudah DITERIMA — hari
   * itu terbaca "hadir" sementara kolom statusnya tetap 'telat'. Pemutihan yang
   * tidak punya fixture adalah pemutihan yang tidak bisa diuji.
   */
  await db
    .update(attendance)
    .set({ lateReason: "Banjir di Kalimalang, jalan ditutup satu jam." })
    .where(
      and(
        eq(attendance.employeeId, idOf("Bagas Prasetyo")),
        eq(attendance.date, TODAY),
      ),
    );
  await db
    .update(attendance)
    .set({
      lateReason: "Mengantar anak ke rumah sakit, ada surat dokternya.",
      reviewOk: true,
      reviewedById: idOf("Andini Rahmawati"),
      reviewedAt: new Date(`${TODAY}T09:15:00+07:00`),
      reviewNote: "Sesuai surat dokter yang dikirim.",
    })
    .where(
      and(
        eq(attendance.employeeId, idOf("Gita Permata")),
        eq(attendance.date, TODAY),
      ),
    );

  /**
   * Satu orang yang absen masuk pada tanggal HARI INI yang sebenarnya, bukan pada
   * TODAY yang dipatok di atas.
   *
   * Papan di atas sengaja dipatok supaya angkanya deterministik, tapi jalur ping
   * lokasi memakai `todayWib()` dan karena itu tidak bisa disentuh sama sekali oleh
   * data yang dipatok — endpoint yang tidak bisa diuji adalah endpoint yang rusak
   * diam-diam. Baris ini yang membuat smoke bisa memeriksanya.
   */
  const hariIniAsli = todayWib();
  if (hariIniAsli !== TODAY) {
    // Dua orang, bukan satu: uji jeda 2,5 jam dan uji GPS palsu sama-sama menulis
    // baris `lokasi`, dan kalau berbagi satu absensi maka yang kedua selalu jatuh
    // di dalam jendela jeda yang baru saja dibuat yang pertama.
    await db
      .insert(attendance)
      .values(
        ["Citra Maharani", "Dimas Anggara"].map((nama) => ({
          employeeId: idOf(nama),
          date: hariIniAsli,
          // 00:01, bukan 08:00: smoke mengirim fix bertanggal beberapa jam ke
          // belakang, dan semuanya harus jatuh SESUDAH absen masuk berapa pun jam
          // pengujiannya dijalankan.
          clockIn: "00:01:00",
          status: "hadir" as const,
          location: "Kantor Pusat",
          lat: "-6.224900",
          lng: "106.809200",
          locationId: officeFor("Kantor Pusat"),
        })),
      )
      .onConflictDoNothing();
  }

  // 60 hari ke belakang (hari kerja masing-masing divisi) supaya rekap bulanan
  // dan log 5 hari di drawer punya isi

  const rand = rng(42);
  const history: (typeof attendance.$inferInsert)[] = [];
  for (let back = 1; back <= 60; back++) {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    const date = d.toISOString().slice(0, 10);
    for (const [name, , division] of EMP) {
      // absensi hanya pada hari kerja divisinya masing-masing
      if (!hariKerjaOf(division).includes(d.getUTCDay())) continue;
      // Skenario "tanpa keterangan": izin ditolak, tetap tidak masuk, tidak pernah
      // absen — dan karena tidak masuk berarti tidak ada baris, harinya benar-benar
      // dilewati di sini. Tanpa satu kasus nyata, smoke tidak bisa menjaganya.
      if (name === MANGKIR.name && date === MANGKIR.date) continue;
      const r = rand();
      if (r < 0.03) {
        history.push({
          employeeId: idOf(name),
          date,
          status: "cuti",
          location: "Cuti tahunan",
        });
        continue;
      }
      if (r < 0.05) {
        history.push({
          employeeId: idOf(name),
          date,
          status: "sakit",
          location: "Surat dokter",
        });
        continue;
      }
      if (r < 0.06) {
        history.push({ employeeId: idOf(name), date, status: "belum_absen" });
        continue;
      }
      const late = r > 0.9;
      const wfh = r > 0.82 && r <= 0.9;
      // relative to the division's own start, not a hardcoded 08:00 — otherwise
      // Operations' 07:00 shift would read as 110 late days out of 112
      const shift = shiftOf(division);
      const clockIn = hhmm(
        late
          ? shift.startM + shift.tol + 1 + Math.floor(rand() * 25)
          : shift.startM - 25 + Math.floor(rand() * 23),
      );
      const location = wfh
        ? "Rumah"
        : division === "Operations"
          ? "Gudang Cakung"
          : "Kantor Pusat";
      history.push({
        employeeId: idOf(name),
        date,
        clockIn,
        clockOut: `17:${String(Math.floor(rand() * 40)).padStart(2, "0")}`,
        status: attendanceStatus(clockIn, shift.start, shift.tol, wfh),
        location,
        locationId: officeFor(location),
      });
    }
  }
  for (let i = 0; i < history.length; i += 500) {
    await db.insert(attendance).values(history.slice(i, i + 500));
  }

  // Location log. Every punch becomes an event so the day detail has something
  // real to show; the summary row above keeps feeding the board and the export.
  // Coordinates jitter around the office (inside the 150 m geofence) except for
  // WFH days, which sit in Bekasi — otherwise the "di luar radius" branch would
  // never appear in a demo.
  const OFFICE = { lat: -6.2249, lng: 106.8092 };
  const GUDANG = { lat: -6.1889, lng: 106.9394 };
  const RUMAH = { lat: -6.2383, lng: 106.9756 };
  const punched = await db
    .select({
      id: attendance.id,
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      location: attendance.location,
    })
    .from(attendance)
    .where(isNotNull(attendance.clockIn));

  /** ±~50 m, deterministic: same seed, same demo, every time */
  const jitter = () => (rand() - 0.5) * 0.0009;
  /** WIB is UTC+7; a bare time string would be read as UTC and shift the day */
  const wib = (date: string, t: string) =>
    new Date(`${date}T${t.length === 5 ? `${t}:00` : t}+07:00`);

  const events: (typeof attendanceEvents.$inferInsert)[] = [];
  for (const row of punched) {
    const jauh = row.location?.startsWith("Rumah");
    // coordinates have to sit at the office the row points at, or the day detail
    // would report every warehouse punch as 14 km outside its own geofence
    const base = jauh
      ? RUMAH
      : row.location === "Gudang Cakung"
        ? GUDANG
        : OFFICE;
    events.push({
      attendanceId: row.id,
      kind: "masuk",
      at: wib(row.date, row.clockIn!),
      location: row.location,
      lat: String((base.lat + jitter()).toFixed(6)),
      lng: String((base.lng + jitter()).toFixed(6)),
    });
    if (row.clockOut) {
      events.push({
        attendanceId: row.id,
        kind: "keluar",
        at: wib(row.date, row.clockOut),
        location: row.location,
        lat: String((base.lat + jitter()).toFixed(6)),
        lng: String((base.lng + jitter()).toFixed(6)),
      });
    }
  }
  for (let i = 0; i < events.length; i += 500) {
    await db.insert(attendanceEvents).values(events.slice(i, i + 500));
  }

  // the summary row's coordinates are the clock-in point — one statement rather
  // than one UPDATE per row
  await db.execute(sql`
    update attendance a
       set lat = e.lat, lng = e.lng
      from attendance_events e
     where e.attendance_id = a.id and e.kind = 'masuk'`);

  const holidaySet = new Set(["2026-08-17", "2026-08-18"]);
  const leaves: {
    name: string;
    type: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus";
    start: string;
    end: string;
    delegate: string | null;
    reason: string;
    status: "menunggu" | "disetujui" | "ditolak";
    note?: string;
  }[] = [
    {
      name: "Citra Maharani",
      type: "Cuti Tahunan",
      start: "2026-08-03",
      end: "2026-08-05",
      delegate: "Fajar Nugroho",
      reason: "Menghadiri pernikahan keluarga di Yogyakarta.",
      status: "menunggu",
    },
    {
      name: "Dimas Anggara",
      type: "Cuti Sakit",
      start: "2026-07-31",
      end: "2026-07-31",
      delegate: "Indah Lestari",
      reason: "Demam, sudah melampirkan surat dokter klinik.",
      status: "menunggu",
    },
    {
      name: "Hendra Saputra",
      type: "Cuti Tahunan",
      start: "2026-08-10",
      end: "2026-08-14",
      delegate: "Nanda Pratama",
      reason: "Libur keluarga yang sudah direncanakan sejak awal tahun.",
      status: "menunggu",
    },
    {
      name: "Kirana Ayu",
      type: "Izin Khusus",
      start: "2026-08-01",
      end: "2026-08-01",
      delegate: "Putra Wijaya",
      reason: "Mengurus dokumen kependudukan di kelurahan.",
      status: "menunggu",
    },
    {
      name: "Eka Wulandari",
      type: "Cuti Tahunan",
      start: "2026-07-28",
      end: "2026-07-30",
      delegate: "Kirana Ayu",
      reason: "Cuti tahunan periode kedua.",
      status: "disetujui",
    },
    {
      name: MANGKIR.name,
      type: "Izin Khusus",
      start: MANGKIR.date,
      end: MANGKIR.date,
      delegate: null,
      reason: "Pengajuan terlambat tanpa bukti pendukung.",
      status: "ditolak",
      note: "Tanpa bukti pendukung.",
    },
  ];

  await db.insert(leaveRequests).values(
    leaves.map((l) => ({
      employeeId: idOf(l.name),
      type: l.type,
      startDate: l.start,
      endDate: l.end,
      days: workingDays(l.start, l.end, holidaySet),
      reason: l.reason,
      delegateId: l.delegate ? idOf(l.delegate) : null,
      status: l.status,
      decisionNote: l.note ?? null,
      decidedById: l.status === "menunggu" ? null : 1,
      decidedAt:
        l.status === "menunggu" ? null : new Date(`${TODAY}T03:00:00Z`),
    })),
  );

  const ots: {
    name: string;
    date: string;
    start: string;
    end: string;
    kind: "Hari kerja" | "Hari libur";
    reason: string;
    status: "menunggu" | "disetujui" | "ditolak";
    note?: string;
  }[] = [
    {
      name: "Bagas Prasetyo",
      date: "2026-07-29",
      start: "17:30",
      end: "20:30",
      kind: "Hari kerja",
      reason: "Perbaikan bug rilis payroll",
      status: "menunggu",
    },
    {
      name: "Lukman Hakim",
      date: "2026-07-28",
      start: "18:00",
      end: "22:00",
      kind: "Hari kerja",
      reason: "Migrasi server produksi",
      status: "menunggu",
    },
    {
      name: "Nanda Pratama",
      date: "2026-07-26",
      start: "08:00",
      end: "14:00",
      kind: "Hari libur",
      reason: "Stock opname gudang",
      status: "menunggu",
    },
    {
      name: "Hendra Saputra",
      date: "2026-07-24",
      start: "17:00",
      end: "19:00",
      kind: "Hari kerja",
      reason: "Pengiriman mendesak klien",
      status: "disetujui",
    },
    {
      name: "Joko Susilo",
      date: "2026-07-23",
      start: "19:00",
      end: "21:00",
      kind: "Hari kerja",
      reason: "Tanpa persetujuan atasan",
      status: "ditolak",
      note: "Tidak ada persetujuan atasan sebelum lembur.",
    },
  ];

  await db.insert(overtimeRequests).values(
    ots.map((o) => {
      const minutes = overtimeMinutes(o.start, o.end);
      return {
        employeeId: idOf(o.name),
        date: o.date,
        startTime: o.start,
        endTime: o.end,
        minutes,
        kind: o.kind,
        reason: o.reason,
        status: o.status,
        decisionNote: o.note ?? null,
        decidedById: o.status === "menunggu" ? null : 1,
        decidedAt:
          o.status === "menunggu" ? null : new Date(`${TODAY}T03:00:00Z`),
      };
    }),
  );

  await db.insert(announcements).values([
    {
      title: "Penyesuaian jam kerja bulan Agustus",
      category: "Kebijakan",
      audience: "Semua karyawan",
      pinned: true,
      authorId: idOf("Andini Rahmawati"),
      createdAt: new Date("2026-07-29T02:00:00Z"),
      body: "Mulai 1 Agustus 2026 jam kerja shift pagi menjadi 08.00–17.00 dengan toleransi keterlambatan 15 menit. Absensi tetap melalui aplikasi karyawan dengan verifikasi lokasi.",
    },
    {
      title: "Libur bersama Hari Kemerdekaan",
      category: "Libur",
      audience: "Semua karyawan",
      authorId: idOf("Andini Rahmawati"),
      createdAt: new Date("2026-07-27T02:00:00Z"),
      body: "Kantor tutup pada 17–18 Agustus 2026. Tim Operations yang bertugas jaga akan dihitung sebagai lembur hari libur.",
    },
    {
      title: "Pengumpulan berkas BPJS tanggungan keluarga",
      category: "Administrasi",
      audience: "Karyawan tetap",
      authorId: idOf("Gita Permata"),
      createdAt: new Date("2026-07-24T02:00:00Z"),
      body: "Bagi karyawan yang ingin menambahkan anggota keluarga, unggah KK dan akta ke folder Berkas Pribadi paling lambat 8 Agustus 2026.",
    },
    {
      title: "Pelatihan K3 untuk tim gudang",
      category: "Pelatihan",
      audience: "Divisi Operations",
      authorId: idOf("Hendra Saputra"),
      createdAt: new Date("2026-07-22T02:00:00Z"),
      body: "Sesi wajib pada 6 Agustus 2026, 09.00–12.00 di Gudang Cakung. Kehadiran dicatat otomatis melalui absensi lokasi.",
    },
  ]);

  const MB = 1024 * 1024;
  const docs: [
    string,
    string,
    "personal" | "kontrak" | "sertif" | "legal",
    number,
    string | null,
    string,
  ][] = [
    [
      "KTP - Bagas Prasetyo.pdf",
      "PDF",
      "personal",
      1.2 * MB,
      "Bagas Prasetyo",
      "2026-07-29",
    ],
    [
      "NPWP - Citra Maharani.pdf",
      "PDF",
      "personal",
      0.68 * MB,
      "Citra Maharani",
      "2026-07-28",
    ],
    [
      "Kartu Keluarga - Dimas A.pdf",
      "PDF",
      "personal",
      2.1 * MB,
      "Dimas Anggara",
      "2026-07-27",
    ],
    [
      "Ijazah S1 - Fajar Nugroho.pdf",
      "PDF",
      "personal",
      3.4 * MB,
      "Fajar Nugroho",
      "2026-07-26",
    ],
    [
      "Rekening BCA - Indah L.jpg",
      "JPG",
      "personal",
      0.42 * MB,
      "Indah Lestari",
      "2026-07-24",
    ],
    [
      "BPJS - Maya Sari.pdf",
      "PDF",
      "personal",
      0.91 * MB,
      "Maya Sari",
      "2026-07-21",
    ],
    [
      "PKWT - Nanda Pratama 2026.pdf",
      "PDF",
      "kontrak",
      1.8 * MB,
      "Nanda Pratama",
      "2026-07-28",
    ],
    [
      "PKWT - Putra Wijaya 2026.pdf",
      "PDF",
      "kontrak",
      1.7 * MB,
      "Putra Wijaya",
      "2026-07-26",
    ],
    [
      "SK Pengangkatan - Lukman H.pdf",
      "PDF",
      "kontrak",
      0.94 * MB,
      "Lukman Hakim",
      "2026-07-20",
    ],
    [
      "Adendum Gaji - Bagas P.pdf",
      "PDF",
      "kontrak",
      0.62 * MB,
      "Bagas Prasetyo",
      "2026-07-18",
    ],
    [
      "Sertifikat K3 Umum - Hendra S.pdf",
      "PDF",
      "sertif",
      2.4 * MB,
      "Hendra Saputra",
      "2026-07-25",
    ],
    [
      "Brevet Pajak A - Oktavia R.pdf",
      "PDF",
      "sertif",
      1.9 * MB,
      "Oktavia Rini",
      "2026-07-19",
    ],
    [
      "AWS Solutions Architect - Lukman.pdf",
      "PDF",
      "sertif",
      1.1 * MB,
      "Lukman Hakim",
      "2026-07-12",
    ],
    [
      "Peraturan Perusahaan 2026.pdf",
      "PDF",
      "legal",
      4.2 * MB,
      null,
      "2026-07-15",
    ],
    ["SOP Absensi & Lembur.pdf", "PDF", "legal", 1.3 * MB, null, "2026-07-14"],
    [
      "Rekap Karyawan Aktif.xlsx",
      "XLSX",
      "legal",
      0.78 * MB,
      null,
      "2026-07-30",
    ],
  ];

  await db.insert(documents).values(
    docs.map(([name, ext, folder, sizeBytes, owner, uploadedAt]) => ({
      name,
      ext,
      folder,
      sizeBytes: Math.round(sizeBytes),
      ownerId: owner ? idOf(owner) : null,
      uploadedAt: new Date(`${uploadedAt}T02:00:00Z`),
    })),
  );

  await db.insert(auditLog).values({
    actorId: 1,
    action: "seed",
    entity: "system",
    detail: `Seeded ${inserted.length} karyawan, ${history.length + EMP.length} baris absensi`,
  });

  console.log(
    `Seed OK — ${inserted.length} karyawan, ${history.length + EMP.length} absensi, ${events.length} event lokasi, ${leaves.length} cuti, ${ots.length} lembur, ${docs.length} berkas`,
  );
  console.log(
    `Login: andini.rahmawati@nanumindahsejati.co.id / ${SEED_PASSWORD} (HR Admin)`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
