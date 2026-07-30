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

export function overtimeMinutes(startTime: string, endTime: string): number {
  const m = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return h * 60 + min;
  };
  const diff = m(endTime) - m(startTime);
  return diff >= 0 ? diff : diff + 24 * 60; // crosses midnight
}

export function overtimeCost(
  minutes: number,
  ratePerHour: number,
  kind: "Hari kerja" | "Hari libur",
  holidayMultiplier = 1.5,
): number {
  const base = (minutes / 60) * ratePerHour;
  return Math.round(base * (kind === "Hari libur" ? holidayMultiplier : 1));
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

export const rupiah = (n: number) =>
  "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });

export const rupiahShort = (n: number) =>
  n >= 1_000_000_000
    ? `Rp ${(n / 1_000_000_000).toFixed(1).replace(".", ",")}m`
    : n >= 1_000_000
      ? `Rp ${(n / 1_000_000).toFixed(1).replace(".", ",")}jt`
      : rupiah(n);

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
