/** HR business rules. Single source of truth — web and mobile both compute
 *  through here on the server so the two clients can never drift (PRD §10). */

/**
 * Nama badan hukum perusahaan.
 *
 * Nilai sebenarnya tinggal di `settings.companyName` dan bisa diubah HR lewat
 * /pengaturan tanpa deploy — konstanta ini hanya default schema dan fallback untuk
 * tempat yang tidak bisa membaca database (judul tab, halaman login). Sebelumnya
 * literal yang sama ditulis ulang di lima tempat, dan satu di antaranya tertinggal
 * setiap kali nama perusahaan berubah.
 */
export const PERUSAHAAN = "PT NANUM INDAH SEJATI";

export const ATT_LABEL = {
  hadir: "Hadir",
  telat: "Terlambat",
  wfh: "WFH",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  belum_absen: "Belum absen",
  /**
   * Bukan hari kerja bagi orang ini: akhir pekan divisinya, atau hari libur
   * nasional. Sebuah status tampilan, bukan tuduhan dan bukan kehadiran — sebelum
   * ada `divisions.work_days`, hari seperti ini terlihat sebagai "Belum absen" dan
   * ikut masuk daftar yang perlu ditindaklanjuti.
   */
  libur: "Libur",
  /**
   * Hari kerja yang sudah lewat, tanpa catatan masuk dan tanpa izin yang
   * disetujui. Sengaja faktual, bukan "Mangkir": sistem tidak bisa membedakan
   * orang yang bolos dari orang yang masuk tapi lupa absen — keduanya terlihat
   * persis sama, yaitu tidak ada baris absensi. Yang menyimpulkan niat adalah HR,
   * bukan aplikasi.
   */
  tanpa_keterangan: "Tanpa keterangan",
} as const;

export type AttStatus = keyof typeof ATT_LABEL;

/**
 * Status yang benar-benar bisa tersimpan di kolom `attendance.status`.
 *
 * `tanpa_keterangan` dan `libur` sengaja tidak termasuk: keduanya disimpulkan saat ditampilkan dan
 * tidak pernah ditulis, jadi enum Postgres pun tidak memuatnya. Memisahkan kedua
 * tipe ini yang membuat compiler menolak percobaan menyimpannya — bukan constraint
 * database yang baru ketahuan saat runtime di produksi.
 */
export type StoredAttStatus = Exclude<AttStatus, "tanpa_keterangan" | "libur">;

/**
 * Groups the raw statuses into the buckets the stat cards filter by.
 *
 * Every value is matched explicitly and the fallthrough is gone: it used to
 * `return "cuti"`, which would have swallowed `tanpa_keterangan` into the leave
 * bucket — the exact opposite of what it means. The `satisfies` on the return type
 * keeps that from happening again silently.
 */
export function statusGroup(s: AttStatus) {
  if (s === "hadir" || s === "wfh") return "hadir";
  if (s === "telat") return "telat";
  if (s === "belum_absen") return "belum";
  if (s === "tanpa_keterangan") return "alpa";
  if (s === "libur") return "libur";
  return "cuti"; // cuti / izin / sakit
}

/**
 * Hari kerja default perusahaan sebagai nomor hari Postgres
 * (`extract(dow)`: 0 = Minggu … 6 = Sabtu), dipakai divisi yang `work_days`-nya
 * NULL — sama seperti jam shift yang kosong mewarisi jadwal perusahaan.
 */
export const HARI_KERJA_DEFAULT = [1, 2, 3, 4, 5] as const;

/** Nama hari sesuai nomor di atas, untuk label di layar. */
export const NAMA_HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

/**
 * Apakah tanggal ini hari kerja bagi orang yang bersangkutan?
 *
 * `kerja` adalah hari kerja divisinya; yang tidak menyebutkannya mendapat
 * Senin–Jumat. Hari libur nasional bukan hari kerja bagi siapa pun.
 *
 * Logikanya sebelumnya tertulis inline di jalur lembur
 * (api/me/requests/route.ts) untuk menentukan "Hari libur"; sekarang satu tempat.
 */
export function isHariKerja(
  isoDate: string,
  libur: Set<string> = new Set(),
  kerja: readonly number[] = HARI_KERJA_DEFAULT,
) {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return kerja.includes(dow) && !libur.has(isoDate);
}

/** Jenis pengajuan cuti → status kehadiran yang ditampilkan pada hari itu.
 *  Pemetaan ini tersirat di mana-mana tapi belum pernah ditulis. */
export function statusDariCuti(
  type: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus",
): AttStatus {
  if (type === "Cuti Sakit") return "sakit";
  if (type === "Izin Khusus") return "izin";
  return "cuti";
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Date → YYYY-MM-DD using the *local* calendar. `toISOString()` would shift
 *  a WIB (UTC+7) date back a day for anything before 07:00. */
export function isoFromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD → local midnight Date, the inverse of isoFromDate. */
export function dateFromIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A real calendar date in YYYY-MM-DD. The shape regex alone lets "2026-13-40"
 *  through, which then blows up inside Postgres instead of at the boundary. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && iso(d) === s;
}

/** Working days in an inclusive range, excluding the days this person does not
 *  work and national holidays. */
export function workingDays(
  start: string,
  end: string,
  holidays: Set<string> = new Set(),
  kerja: readonly number[] = HARI_KERJA_DEFAULT,
): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    if (kerja.includes(d.getUTCDay()) && !holidays.has(iso(d))) n++;
  }
  return n;
}

/** Base quota + 1 extra day per completed 2 years of tenure (PRD §6.2). */
export function leaveQuota(joinedAt: string, today: string, base = 12): number {
  const j = new Date(`${joinedAt}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  let years = t.getUTCFullYear() - j.getUTCFullYear();
  const anniversaryPassed =
    t.getUTCMonth() > j.getUTCMonth() ||
    (t.getUTCMonth() === j.getUTCMonth() && t.getUTCDate() >= j.getUTCDate());
  if (!anniversaryPassed) years--;
  return base + Math.max(0, Math.floor(years / 2));
}

/**
 * Status seorang karyawan pada satu tanggal — satu-satunya tempat yang memutuskan.
 *
 * Urutannya yang penting, bukan sekadar daftar syarat:
 *   1. sudah absen        → hadir/telat/wfh, apa pun yang lain
 *   2. cuti disetujui     → cuti/izin/sakit; izin selalu menang atas tuduhan
 *   3. bukan hari kerja   → null, hari itu tidak masuk hitungan sama sekali
 *   4. hari ini / nanti   → belum_absen; orangnya masih mungkin datang
 *   5. sisanya            → tanpa_keterangan
 *
 * Langkah 2 sebelum 5 itulah yang membuat orang yang cutinya disetujui tidak
 * pernah tertuduh, dan langkah 4 yang membuat aplikasi tidak menghakimi hari yang
 * belum selesai. Dihitung, tidak disimpan: kalau HR menyetujui izin susulan untuk
 * tanggal lampau, status hari itu berubah sendiri tanpa perbaikan data.
 */
export function statusHarian(input: {
  tanggal: string;
  hariIni: string;
  clockIn: string | null;
  /** jenis cuti yang DISETUJUI dan mencakup tanggal ini, kalau ada */
  cuti?: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus" | null;
  wfh?: boolean;
  libur?: Set<string>;
  /** hari kerja divisinya; kosong = Senin–Jumat */
  hariKerja?: readonly number[];
  shift: { start: string; toleranceMinutes: number };
}): AttStatus | null {
  const { tanggal, hariIni, clockIn, cuti, wfh, libur, shift, hariKerja } =
    input;

  if (clockIn)
    return attendanceStatus(clockIn, shift.start, shift.toleranceMinutes, wfh);
  if (cuti) return statusDariCuti(cuti);
  if (!isHariKerja(tanggal, libur, hariKerja)) return null;
  if (tanggal >= hariIni) return "belum_absen";
  return "tanpa_keterangan";
}

/** Only Cuti Tahunan draws down the balance (PRD §6.2). */
export const deductsBalance = (type: string) => type === "Cuti Tahunan";

/** Cuti bersama days charged to one employee: a day he never works was never his
 *  to take off, and days before he joined are not his to pay for. */
export function collectiveLeaveDays(
  joinedAt: string,
  dates: string[],
  kerja: readonly number[] = HARI_KERJA_DEFAULT,
): number {
  return dates.filter(
    (d) => d >= joinedAt && kerja.includes(new Date(`${d}T00:00:00Z`).getUTCDay()),
  ).length;
}

/** Remaining annual leave. `adjustment` is HR's carry-over/correction (may be
 *  negative); `usedCollective` are the cuti bersama days, which are deducted
 *  without an individual request. The DB side of this lives in lib/leave.ts. */
export function remainingLeave(
  quota: number,
  adjustment: number,
  usedRequests: number,
  usedCollective: number,
): number {
  return quota + adjustment - usedRequests - usedCollective;
}

export function overtimeMinutes(startTime: string, endTime: string): number {
  const m = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return h * 60 + min;
  };
  const diff = m(endTime) - m(startTime);
  return diff >= 0 ? diff : diff + 24 * 60; // crosses midnight
}

/** Late once clock-in passes shift start + tolerance. */
export function attendanceStatus(
  clockIn: string | null,
  shiftStart: string,
  toleranceMinutes: number,
  wfh = false,
): "hadir" | "telat" | "wfh" | "belum_absen" {
  if (!clockIn) return "belum_absen";
  const m = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return h * 60 + min;
  };
  if (wfh) return "wfh";
  return m(clockIn) > m(shiftStart) + toleranceMinutes ? "telat" : "hadir";
}

/**
 * The shift an employee actually works: their division's, falling back per field
 * to the company default in `settings`.
 *
 * Per field, not per row — a division that only wants a stricter tolerance sets
 * that one column and keeps inheriting the hours. `??` and not `||`, because a
 * tolerance of 0 ("be on time") is a real answer and must not read as unset.
 *
 * Pure, so hr.check.ts can assert it and so callers that already hold both rows
 * pay no extra query.
 */
export function resolveShift(
  div: {
    shiftStart: string | null;
    shiftEnd: string | null;
    lateToleranceMinutes: number | null;
  } | null,
  cfg: { shiftStart: string; shiftEnd: string; lateToleranceMinutes: number },
) {
  return {
    // HH:mm — the seconds Postgres' `time` carries are noise to every caller
    start: (div?.shiftStart ?? cfg.shiftStart).slice(0, 5),
    end: (div?.shiftEnd ?? cfg.shiftEnd).slice(0, 5),
    toleranceMinutes: div?.lateToleranceMinutes ?? cfg.lateToleranceMinutes,
  };
}

/** Today in WIB. Using UTC here would roll the date over 7 hours early and
 *  mis-bucket the 00:00–07:00 WIB clock-ins. */
export const todayWib = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
  }).format(new Date());

export const durasi = (minutes: number) =>
  `${Math.floor(minutes / 60)}j ${minutes % 60}m`;

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const DAYS_ID = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

export function tanggalPanjang(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${DAYS_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function tanggalPendek(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()].slice(0, 3)}`;
}

export const namaBulan = (month: number) => MONTHS_ID[month];

/** "03–05 Agu" / "31 Jul" — matches the mockup's range formatting. */
export function rentangTanggal(start: string, end: string) {
  return start === end
    ? tanggalPendek(start)
    : `${new Date(`${start}T00:00:00Z`).getUTCDate()}–${tanggalPendek(end)}`;
}

export const jam = (t: string | null) => (t ? t.slice(0, 5) : "—");

/** "30 Jul 2026" — the year matters for a hire date, unlike an attendance row, and
 *  three pages had spelled it out by hand. Null since the employment columns
 *  became optional: no start date on file reads as "—", never "Invalid Date". */
export const tanggalTahun = (iso: string | null | undefined) =>
  iso ? `${tanggalPendek(iso)} ${iso.slice(0, 4)}` : "—";

export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * The password rule, in one place.
 *
 * /api/me/password, the HR reset generator and the forgot-password route all call
 * this, so no path can end up weaker than another — and the web forms import it
 * directly, so the message a user reads before submitting is the same string the
 * server would have answered with.
 *
 * Returns the first complaint, or null when acceptable.
 */
export function cekSandi(v: string): string | null {
  if (v.length < 8) return "Kata sandi minimal 8 karakter";
  // bcrypt silently truncates past 72 *bytes*, so two long passwords that share a
  // prefix would hash identically. Measured with TextEncoder rather than Buffer:
  // this file is imported by client components, and Next no longer polyfills
  // Buffer into the browser bundle.
  if (new TextEncoder().encode(v).length > 72)
    return "Kata sandi terlalu panjang";
  if (!/[A-Z]/.test(v)) return "Kata sandi harus memuat huruf kapital";
  if (!/[0-9]/.test(v)) return "Kata sandi harus memuat angka";
  // "not a letter or digit" rather than a list of allowed symbols: a whitelist
  // rejects é, £ and every non-US keyboard for no gain in strength
  if (!/[^A-Za-z0-9]/.test(v))
    return "Kata sandi harus memuat simbol, misalnya ! @ # ?";
  return null;
}

/**
 * Attempt throttle, in process.
 *
 * ponytail: a Map, so it resets on deploy and counts per instance. That still
 * stops a scripted guessing run, which is the whole threat for an endpoint that
 * already costs ~100 ms of bcrypt per try. Move to a `rate_limits` table or
 * Upstash the day this runs on more than one node.
 */
const hits = new Map<string, number[]>();
export function tooMany(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  // crude ceiling so a flood of distinct keys cannot grow this without bound
  if (hits.size > 5_000) hits.clear();
  hits.set(key, recent);
  return recent.length > max;
}

/**
 * "0858-8182-0410" — grouped for reading aloud, which is the only thing anyone
 * does with an emergency number. Stored digits-only, so the grouping is a display
 * concern; anything that isn't a digit is dropped rather than trusted, because the
 * source data mixes "0858 8182 0410" with "085881820410".
 */
export function telepon(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  if (!d) return "—";
  return d.match(/.{1,4}/g)!.join("-");
}

/** Whole years, WIB-agnostic (a birthday is a date, not an instant). */
export function umur(birthDate: string | null | undefined, today = todayWib()) {
  if (!birthDate || !isIsoDate(birthDate)) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  let years = t.getUTCFullYear() - b.getUTCFullYear();
  // not yet had this year's birthday
  const md = (d: Date) => (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (md(t) < md(b)) years--;
  return years;
}

/* ── File helpers ─────────────────────────────────────────────────────────────
   These live here, not in lib/r2.ts, because client components need them and
   r2.ts pulls in aws4fetch and process.env. */

/** "1,4 MB" / "320 KB" — comma decimal separator, like the rest of the UI. */
export const ukuranFile = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.round(bytes / 1024)} KB`;

/** Lowercase extension without the dot, "" when there is none. Mirrors extOf()
 *  in lib/r2.ts, which cannot be imported from the client. */
export const ekstensi = (filename: string) => {
  const base = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

const MIME_GROUP: Record<string, string> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  pdf: "application",
  csv: "text",
};

/**
 * Does this filename satisfy an `accept` attribute? Drag & drop bypasses the
 * browser's own filtering, so the dropzone has to redo it. Understands both
 * ".pdf,.jpg" lists and "image/*" wildcards; anything without an extension is
 * rejected rather than guessed at.
 */
export function acceptsFile(filename: string, accept: string): boolean {
  const ext = ekstensi(filename);
  if (!ext) return false;
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token === "*" || token === "*/*") return true;
      if (token.startsWith(".")) return token.slice(1) === ext;
      if (token.endsWith("/*")) return MIME_GROUP[ext] === token.slice(0, -2);
      return token === `${MIME_GROUP[ext]}/${ext}`;
    });
}

/* ── Geo ──────────────────────────────────────────────────────────────────── */

/**
 * Distance in metres between two points. Haversine on a sphere: attendance
 * distances are tens to thousands of metres, where the ellipsoid correction is
 * far below the accuracy of a phone's GPS fix.
 */
export function jarakMeter(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Kecepatan tersirat antara dua fix, km/jam. Nol kalau selisih waktunya nol atau
 * mundur — dua fix pada detik yang sama tidak menyiratkan kecepatan apa pun, dan
 * membaginya dengan nol akan menghasilkan Infinity yang menuduh semua orang.
 */
export function kecepatanKmJam(
  a: { lat: number; lng: number; at: Date },
  b: { lat: number; lng: number; at: Date },
): number {
  const jam = (b.at.getTime() - a.at.getTime()) / 3_600_000;
  if (jam <= 0) return 0;
  return jarakMeter(a.lat, a.lng, b.lat, b.lng) / 1000 / jam;
}

/**
 * Di atas ini, perpindahannya tidak mungkin dilakukan orang yang sedang bekerja.
 *
 * 250 km/jam: di atas kendaraan darat mana pun di Indonesia, dan cukup longgar
 * untuk fix GPS yang meleset ratusan meter (meleset 1 km pun hanya menyiratkan
 * 0,4 km/jam pada jeda 2,5 jam). Yang di atasnya praktis hanya pesawat — dan
 * karena itulah ambang ini hanya MENANDAI, tidak pernah menolak: karyawan WFH
 * yang naik pesawat itu jarang, tapi ada.
 */
export const KECEPATAN_MUSTAHIL = 250;

/** "24 m" / "1,2 km" — comma decimal, like every other number in the UI. */
export const formatJarak = (meter: number) =>
  meter >= 1000
    ? `${(meter / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(meter)} m`;

const KIND_LABEL_ID = {
  masuk: "Absen masuk",
  keluar: "Absen keluar",
  catatan: "Catatan",
  lokasi: "Ping lokasi",
} as const;

/** WIB, matching every other time in the app. */
export const jamWib = (at: Date) =>
  at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

/**
 * Attendance events as map markers, in chronological order.
 *
 * Both day views — HR's modal and the employee's own page — draw the identical
 * trail, and the tone rule (a ping outside the fence is a warning, one inside is
 * just context) is a judgement about the data, not about either screen. Events
 * with no coordinate are dropped rather than pinned at (0,0), which is in the
 * Atlantic.
 */
export function jejakAbsen(
  events: {
    kind: keyof typeof KIND_LABEL_ID;
    at: Date;
    lat: string | null;
    lng: string | null;
  }[],
  office: { lat: number; lng: number; radius: number } | null,
) {
  return events.flatMap((e) => {
    if (!e.lat || !e.lng) return [];
    const lat = Number(e.lat);
    const lng = Number(e.lng);
    const jarak = office ? jarakMeter(office.lat, office.lng, lat, lng) : null;
    const luar = jarak !== null && jarak > office!.radius;
    return [
      {
        lat,
        lng,
        tone: (e.kind === "masuk"
          ? "masuk"
          : e.kind === "keluar"
            ? "keluar"
            : luar
              ? "peringatan"
              : "ping") as "masuk" | "keluar" | "ping" | "peringatan",
        label: `${KIND_LABEL_ID[e.kind]} ${jamWib(e.at)}${
          jarak !== null ? ` · ${formatJarak(jarak)} dari kantor` : ""
        }`,
      },
    ];
  });
}

/** What the preview dialog can render in-page. SVG and HTML are deliberately
 *  absent: they execute, and previewing them would run untrusted markup. */
export function previewKind(ext: string): "image" | "pdf" | null {
  const e = ext.toLowerCase();
  if (e === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(e)) return "image";
  return null;
}
