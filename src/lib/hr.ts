/** HR business rules. Single source of truth — web and mobile both compute
 *  through here on the server so the two clients can never drift (PRD §10). */

export const ATT_LABEL = {
  hadir: "Hadir",
  telat: "Terlambat",
  wfh: "WFH",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  belum_absen: "Belum absen",
} as const;

export type AttStatus = keyof typeof ATT_LABEL;

/** Groups the 7 raw statuses into the 4 buckets the stat cards filter by. */
export function statusGroup(s: AttStatus) {
  if (s === "hadir" || s === "wfh") return "hadir";
  if (s === "telat") return "telat";
  if (s === "belum_absen") return "belum";
  return "cuti"; // cuti / izin / sakit
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
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

/** Working days in an inclusive range, excluding weekends and national holidays. */
export function workingDays(
  start: string,
  end: string,
  holidays: Set<string> = new Set(),
): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isWeekend(d) && !holidays.has(iso(d))) n++;
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

/** Only Cuti Tahunan draws down the balance (PRD §6.2). */
export const deductsBalance = (type: string) => type === "Cuti Tahunan";

/** Cuti bersama days charged to one employee: weekends were never working days,
 *  and days before he joined are not his to pay for. */
export function collectiveLeaveDays(joinedAt: string, dates: string[]): number {
  return dates.filter(
    (d) => d >= joinedAt && !isWeekend(new Date(`${d}T00:00:00Z`)),
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
): AttStatus {
  if (!clockIn) return "belum_absen";
  const m = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return h * 60 + min;
  };
  if (wfh) return "wfh";
  return m(clockIn) > m(shiftStart) + toleranceMinutes ? "telat" : "hadir";
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
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

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

export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

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

/** What the preview dialog can render in-page. SVG and HTML are deliberately
 *  absent: they execute, and previewing them would run untrusted markup. */
export function previewKind(ext: string): "image" | "pdf" | null {
  const e = ext.toLowerCase();
  if (e === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(e)) return "image";
  return null;
}
