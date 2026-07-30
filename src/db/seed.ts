/** Seeds the demo dataset lifted from the "Ruang HR Lite" mockup.
 *  Run: npm run db:seed  (idempotent — truncates first) */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  announcements,
  attendance,
  auditLog,
  documents,
  employees,
  holidays,
  leaveRequests,
  overtimeRequests,
  settings,
} from "./schema";
import { attendanceStatus, overtimeCost, overtimeMinutes, workingDays } from "../lib/hr";

const TODAY = "2026-07-30";

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
  ["Andini Rahmawati", "NDG-0012", "Human Resource", "HR Admin", "Tetap", "2021-02-01", "hadir", "07:52", "17:04", "Kantor Pusat"],
  ["Bagas Prasetyo", "NDG-0044", "Engineering", "Backend Engineer", "Tetap", "2022-03-14", "telat", "08:26", "17:12", "Kantor Pusat"],
  ["Citra Maharani", "NDG-0051", "Engineering", "QA Engineer", "Tetap", "2022-08-02", "hadir", "07:45", null, "Kantor Pusat"],
  ["Dimas Anggara", "NDG-0063", "Finance", "Accounting Staff", "Tetap", "2023-01-09", "wfh", "08:02", null, "Rumah · Bekasi"],
  ["Eka Wulandari", "NDG-0070", "Marketing", "Content Lead", "Tetap", "2023-04-21", "cuti", null, null, "Cuti tahunan"],
  ["Fajar Nugroho", "NDG-0078", "Engineering", "Frontend Engineer", "Kontrak", "2023-06-05", "hadir", "07:58", null, "Kantor Pusat"],
  ["Gita Permata", "NDG-0085", "Human Resource", "Recruiter", "Tetap", "2023-09-18", "telat", "08:41", null, "Kantor Pusat"],
  ["Hendra Saputra", "NDG-0091", "Operations", "Field Supervisor", "Tetap", "2023-11-03", "hadir", "07:12", null, "Gudang Cakung"],
  ["Indah Lestari", "NDG-0098", "Finance", "Payroll Officer", "Tetap", "2024-02-12", "hadir", "07:49", null, "Kantor Pusat"],
  ["Joko Susilo", "NDG-0104", "Operations", "Driver", "Kontrak", "2024-03-26", "belum_absen", null, null, null as unknown as string],
  ["Kirana Ayu", "NDG-0110", "Marketing", "Social Media", "Kontrak", "2024-07-08", "sakit", null, null, "Surat dokter"],
  ["Lukman Hakim", "NDG-0117", "Engineering", "DevOps", "Tetap", "2024-08-19", "hadir", "07:35", null, "Kantor Pusat"],
  ["Maya Sari", "NDG-0123", "Human Resource", "GA Staff", "Tetap", "2024-11-04", "belum_absen", null, null, null as unknown as string],
  ["Nanda Pratama", "NDG-0131", "Operations", "Warehouse", "Kontrak", "2025-01-13", "hadir", "06:58", null, "Gudang Cakung"],
  ["Oktavia Rini", "NDG-0138", "Finance", "Tax Staff", "Tetap", "2025-03-17", "izin", null, null, "Izin keluarga"],
  ["Putra Wijaya", "NDG-0145", "Marketing", "Designer", "Kontrak", "2025-06-02", "belum_absen", null, null, null as unknown as string],
];

const email = (name: string) =>
  name.toLowerCase().replace(/ /g, ".") + "@nusantaradigital.co.id";

/** Deterministic pseudo-random so reseeding gives the same history. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

async function main() {
  await db.execute(
    sql`TRUNCATE TABLE audit_log, announcement_reads, documents, announcements, overtime_requests, leave_requests, attendance, employees, holidays, settings RESTART IDENTITY CASCADE`,
  );

  await db.insert(settings).values({ id: 1 });

  await db.insert(holidays).values([
    { date: "2026-08-17", name: "Hari Kemerdekaan RI" },
    { date: "2026-08-18", name: "Libur bersama Kemerdekaan" },
  ]);

  const passwordHash = await bcrypt.hash("password123", 10);
  const inserted = await db
    .insert(employees)
    .values(
      EMP.map(([name, nik, division, position, contractType, joinedAt], i) => ({
        nik,
        name,
        email: email(name),
        passwordHash,
        role: (i === 0 ? "hr_admin" : i === 7 ? "manager" : "employee") as
          | "hr_admin"
          | "manager"
          | "employee",
        division,
        position,
        contractType,
        joinedAt,
        workLocation: division === "Operations" ? "Gudang Cakung" : "Kantor Pusat",
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
    })),
  );

  // 60 working days of history so the monthly recap and 5-day drawer log have data
  const rand = rng(42);
  const history: (typeof attendance.$inferInsert)[] = [];
  for (let back = 1; back <= 60; back++) {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - back);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    for (const [name] of EMP) {
      const r = rand();
      if (r < 0.03) {
        history.push({ employeeId: idOf(name), date, status: "cuti", location: "Cuti tahunan" });
        continue;
      }
      if (r < 0.05) {
        history.push({ employeeId: idOf(name), date, status: "sakit", location: "Surat dokter" });
        continue;
      }
      if (r < 0.06) {
        history.push({ employeeId: idOf(name), date, status: "belum_absen" });
        continue;
      }
      const late = r > 0.9;
      const wfh = r > 0.82 && r <= 0.9;
      const clockIn = late
        ? `08:${String(16 + Math.floor(rand() * 40)).padStart(2, "0")}`
        : `07:${String(35 + Math.floor(rand() * 24)).padStart(2, "0")}`;
      history.push({
        employeeId: idOf(name),
        date,
        clockIn,
        clockOut: `17:${String(Math.floor(rand() * 40)).padStart(2, "0")}`,
        status: attendanceStatus(clockIn, "08:00:00", 15, wfh),
        location: wfh ? "Rumah" : "Kantor Pusat",
      });
    }
  }
  for (let i = 0; i < history.length; i += 500) {
    await db.insert(attendance).values(history.slice(i, i + 500));
  }

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
    { name: "Citra Maharani", type: "Cuti Tahunan", start: "2026-08-03", end: "2026-08-05", delegate: "Fajar Nugroho", reason: "Menghadiri pernikahan keluarga di Yogyakarta.", status: "menunggu" },
    { name: "Dimas Anggara", type: "Cuti Sakit", start: "2026-07-31", end: "2026-07-31", delegate: "Indah Lestari", reason: "Demam, sudah melampirkan surat dokter klinik.", status: "menunggu" },
    { name: "Hendra Saputra", type: "Cuti Tahunan", start: "2026-08-10", end: "2026-08-14", delegate: "Nanda Pratama", reason: "Libur keluarga yang sudah direncanakan sejak awal tahun.", status: "menunggu" },
    { name: "Kirana Ayu", type: "Izin Khusus", start: "2026-08-01", end: "2026-08-01", delegate: "Putra Wijaya", reason: "Mengurus dokumen kependudukan di kelurahan.", status: "menunggu" },
    { name: "Eka Wulandari", type: "Cuti Tahunan", start: "2026-07-28", end: "2026-07-30", delegate: "Kirana Ayu", reason: "Cuti tahunan periode kedua.", status: "disetujui" },
    { name: "Joko Susilo", type: "Izin Khusus", start: "2026-07-18", end: "2026-07-18", delegate: null, reason: "Pengajuan terlambat tanpa bukti pendukung.", status: "ditolak", note: "Tanpa bukti pendukung." },
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
      decidedAt: l.status === "menunggu" ? null : new Date(`${TODAY}T03:00:00Z`),
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
    { name: "Bagas Prasetyo", date: "2026-07-29", start: "17:30", end: "20:30", kind: "Hari kerja", reason: "Perbaikan bug rilis payroll", status: "menunggu" },
    { name: "Lukman Hakim", date: "2026-07-28", start: "18:00", end: "22:00", kind: "Hari kerja", reason: "Migrasi server produksi", status: "menunggu" },
    { name: "Nanda Pratama", date: "2026-07-26", start: "08:00", end: "14:00", kind: "Hari libur", reason: "Stock opname gudang", status: "menunggu" },
    { name: "Hendra Saputra", date: "2026-07-24", start: "17:00", end: "19:00", kind: "Hari kerja", reason: "Pengiriman mendesak klien", status: "disetujui" },
    { name: "Joko Susilo", date: "2026-07-23", start: "19:00", end: "21:00", kind: "Hari kerja", reason: "Tanpa persetujuan atasan", status: "ditolak", note: "Tidak ada persetujuan atasan sebelum lembur." },
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
        estimatedCost: overtimeCost(minutes, 95000, o.kind, 1.5),
        reason: o.reason,
        status: o.status,
        decisionNote: o.note ?? null,
        decidedById: o.status === "menunggu" ? null : 1,
        decidedAt: o.status === "menunggu" ? null : new Date(`${TODAY}T03:00:00Z`),
      };
    }),
  );

  await db.insert(announcements).values([
    { title: "Penyesuaian jam kerja bulan Agustus", category: "Kebijakan", audience: "Semua karyawan", pinned: true, authorId: idOf("Andini Rahmawati"), createdAt: new Date("2026-07-29T02:00:00Z"), body: "Mulai 1 Agustus 2026 jam kerja shift pagi menjadi 08.00–17.00 dengan toleransi keterlambatan 15 menit. Absensi tetap melalui aplikasi karyawan dengan verifikasi lokasi." },
    { title: "Libur bersama Hari Kemerdekaan", category: "Libur", audience: "Semua karyawan", authorId: idOf("Andini Rahmawati"), createdAt: new Date("2026-07-27T02:00:00Z"), body: "Kantor tutup pada 17–18 Agustus 2026. Tim Operations yang bertugas jaga akan dihitung sebagai lembur hari libur." },
    { title: "Pengumpulan berkas BPJS tanggungan keluarga", category: "Administrasi", audience: "Karyawan tetap", authorId: idOf("Gita Permata"), createdAt: new Date("2026-07-24T02:00:00Z"), body: "Bagi karyawan yang ingin menambahkan anggota keluarga, unggah KK dan akta ke folder Berkas Pribadi paling lambat 8 Agustus 2026." },
    { title: "Pelatihan K3 untuk tim gudang", category: "Pelatihan", audience: "Divisi Operations", authorId: idOf("Hendra Saputra"), createdAt: new Date("2026-07-22T02:00:00Z"), body: "Sesi wajib pada 6 Agustus 2026, 09.00–12.00 di Gudang Cakung. Kehadiran dicatat otomatis melalui absensi lokasi." },
  ]);

  const MB = 1024 * 1024;
  const docs: [string, string, "personal" | "kontrak" | "sertif" | "legal", number, string | null, string][] = [
    ["KTP - Bagas Prasetyo.pdf", "PDF", "personal", 1.2 * MB, "Bagas Prasetyo", "2026-07-29"],
    ["NPWP - Citra Maharani.pdf", "PDF", "personal", 0.68 * MB, "Citra Maharani", "2026-07-28"],
    ["Kartu Keluarga - Dimas A.pdf", "PDF", "personal", 2.1 * MB, "Dimas Anggara", "2026-07-27"],
    ["Ijazah S1 - Fajar Nugroho.pdf", "PDF", "personal", 3.4 * MB, "Fajar Nugroho", "2026-07-26"],
    ["Rekening BCA - Indah L.jpg", "JPG", "personal", 0.42 * MB, "Indah Lestari", "2026-07-24"],
    ["BPJS - Maya Sari.pdf", "PDF", "personal", 0.91 * MB, "Maya Sari", "2026-07-21"],
    ["PKWT - Nanda Pratama 2026.pdf", "PDF", "kontrak", 1.8 * MB, "Nanda Pratama", "2026-07-28"],
    ["PKWT - Putra Wijaya 2026.pdf", "PDF", "kontrak", 1.7 * MB, "Putra Wijaya", "2026-07-26"],
    ["SK Pengangkatan - Lukman H.pdf", "PDF", "kontrak", 0.94 * MB, "Lukman Hakim", "2026-07-20"],
    ["Adendum Gaji - Bagas P.pdf", "PDF", "kontrak", 0.62 * MB, "Bagas Prasetyo", "2026-07-18"],
    ["Sertifikat K3 Umum - Hendra S.pdf", "PDF", "sertif", 2.4 * MB, "Hendra Saputra", "2026-07-25"],
    ["Brevet Pajak A - Oktavia R.pdf", "PDF", "sertif", 1.9 * MB, "Oktavia Rini", "2026-07-19"],
    ["AWS Solutions Architect - Lukman.pdf", "PDF", "sertif", 1.1 * MB, "Lukman Hakim", "2026-07-12"],
    ["Peraturan Perusahaan 2026.pdf", "PDF", "legal", 4.2 * MB, null, "2026-07-15"],
    ["SOP Absensi & Lembur.pdf", "PDF", "legal", 1.3 * MB, null, "2026-07-14"],
    ["Rekap Karyawan Aktif.xlsx", "XLSX", "legal", 0.78 * MB, null, "2026-07-30"],
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
    `Seed OK — ${inserted.length} karyawan, ${history.length + EMP.length} absensi, ${leaves.length} cuti, ${ots.length} lembur, ${docs.length} berkas`,
  );
  console.log("Login: andini.rahmawati@nusantaradigital.co.id / password123 (HR Admin)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
