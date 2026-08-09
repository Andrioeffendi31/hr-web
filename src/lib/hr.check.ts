/** Self-check for the quota/date/attendance logic. Run: npm run check */
import assert from "node:assert/strict";
import {
  acceptsFile,
  attendanceStatus,
  collectiveLeaveDays,
  dateFromIso,
  ekstensi,
  formatJarak,
  isIsoDate,
  isoFromDate,
  jarakMeter,
  jejakAbsen,
  leaveQuota,
  overtimeMinutes,
  previewKind,
  remainingLeave,
  rentangTanggal,
  resolveShift,
  statusGroup,
  ukuranFile,
  workingDays,
} from "./hr";
import { pageHref, parsePaging, parseSort, rangeLabel, totalPages } from "./paging";

// working days: 3 Aug 2026 (Mon) – 5 Aug 2026 (Wed) = 3
assert.equal(workingDays("2026-08-03", "2026-08-05"), 3);
// spans a weekend: Fri 31 Jul – Mon 3 Aug = Fri + Mon = 2
assert.equal(workingDays("2026-07-31", "2026-08-03"), 2);
// holidays are excluded too (17–18 Aug libur bersama)
assert.equal(
  workingDays("2026-08-17", "2026-08-21", new Set(["2026-08-17", "2026-08-18"])),
  3,
);
assert.equal(workingDays("2026-08-05", "2026-08-03"), 0, "reversed range");
assert.equal(workingDays("2026-08-03", "2026-08-03"), 1, "single day");
assert.equal(workingDays("2026-08-08", "2026-08-09"), 0, "weekend only");

// date validation guards the CSV import and holiday routes
assert.equal(isIsoDate("2026-08-17"), true);
assert.equal(isIsoDate("2026-13-40"), false, "month/day out of range");
assert.equal(isIsoDate("2026-02-30"), false, "february overflow rolls over");
assert.equal(isIsoDate("17-08-2026"), false, "wrong order");
assert.equal(isIsoDate(""), false);

// calendar <-> ISO round-trip must never drift a day in WIB (UTC+7)
for (const iso of ["2026-01-01", "2026-08-17", "2026-12-31", "2026-02-28"]) {
  assert.equal(isoFromDate(dateFromIso(iso)), iso, `round-trip ${iso}`);
}
assert.equal(isoFromDate(new Date(2026, 0, 1)), "2026-01-01", "midnight 1 Jan");
assert.equal(isoFromDate(new Date(2026, 11, 31, 23, 59)), "2026-12-31", "late 31 Dec");
assert.equal(dateFromIso("2026-08-17").getDate(), 17, "no off-by-one");

// quota: 12 base + 1 per completed 2 years
assert.equal(leaveQuota("2021-02-01", "2026-07-30"), 14, "5y tenure → +2");
assert.equal(leaveQuota("2025-06-02", "2026-07-30"), 12, "1y tenure → +0");
assert.equal(leaveQuota("2024-08-19", "2026-07-30"), 12, "anniversary not yet passed");
assert.equal(leaveQuota("2024-07-19", "2026-07-30"), 13, "2y just passed");

// balance: quota + carry-over − pengajuan − cuti bersama
assert.equal(remainingLeave(12, 0, 0, 0), 12, "fresh year");
assert.equal(remainingLeave(12, 3, 4, 2), 9, "carry-over and both deductions");
assert.equal(remainingLeave(12, -2, 0, 0), 10, "negative correction");

// cuti bersama: 17 Aug 2026 is a Monday, 22 Aug a Saturday
const CB = ["2026-08-17", "2026-08-18", "2026-08-22"];
assert.equal(collectiveLeaveDays("2020-01-01", CB), 2, "weekend one is free");
assert.equal(collectiveLeaveDays("2026-08-18", CB), 1, "joined mid-holiday");
assert.equal(collectiveLeaveDays("2026-09-01", CB), 0, "joined after");

// overtime
assert.equal(overtimeMinutes("17:30", "20:30"), 180);
assert.equal(overtimeMinutes("22:00", "01:00"), 180, "crosses midnight");

// attendance status vs 08:00 shift + 15m tolerance
assert.equal(attendanceStatus("07:52", "08:00:00", 15), "hadir");
assert.equal(attendanceStatus("08:15", "08:00:00", 15), "hadir", "tolerance edge");
assert.equal(attendanceStatus("08:26", "08:00:00", 15), "telat");
assert.equal(attendanceStatus(null, "08:00:00", 15), "belum_absen");
assert.equal(attendanceStatus("09:00", "08:00:00", 15, true), "wfh");

// per-division shift resolution, against the company default
const defaultShift = { shiftStart: "08:00:00", shiftEnd: "17:00:00", lateToleranceMinutes: 15 };
assert.deepEqual(
  resolveShift(null, defaultShift),
  { start: "08:00", end: "17:00", toleranceMinutes: 15 },
  "no division row → company default",
);
assert.deepEqual(
  resolveShift(
    { shiftStart: "09:30:00", shiftEnd: "18:30:00", lateToleranceMinutes: null },
    defaultShift,
  ),
  { start: "09:30", end: "18:30", toleranceMinutes: 15 },
  "inherit is per field, not per row",
);
// tolerance 0 is "be on time", not "unset" — this is why resolveShift uses ?? over ||
const strict = resolveShift(
  { shiftStart: "09:30:00", shiftEnd: null, lateToleranceMinutes: 0 },
  defaultShift,
);
assert.equal(strict.toleranceMinutes, 0);
assert.equal(strict.end, "17:00");
assert.equal(attendanceStatus("09:30", strict.start, strict.toleranceMinutes), "hadir");
assert.equal(attendanceStatus("09:31", strict.start, strict.toleranceMinutes), "telat");

// stat-card buckets
assert.equal(statusGroup("wfh"), "hadir");
assert.equal(statusGroup("sakit"), "cuti");
assert.equal(statusGroup("belum_absen"), "belum");

assert.equal(rentangTanggal("2026-08-03", "2026-08-05"), "3–5 Agu");
assert.equal(rentangTanggal("2026-07-31", "2026-07-31"), "31 Jul");

// paging: hostile query strings must degrade, never crash or reach SQL
assert.deepEqual(parsePaging({}), { page: 1, perPage: 20, offset: 0 });
assert.deepEqual(parsePaging({ page: "3" }), { page: 3, perPage: 20, offset: 40 });
assert.equal(parsePaging({ page: "-5" }).page, 1, "negative page");
assert.equal(parsePaging({ page: "abc" }).page, 1, "non-numeric page");
assert.equal(parsePaging({ page: "2.7" }).page, 2, "fractional page floors");
assert.equal(parsePaging({ perPage: "99999" }).perPage, 100, "perPage capped");
assert.equal(parsePaging({ perPage: "1" }).perPage, 5, "perPage floored");

const COLS = { nama: "employees.name", divisi: "employees.division" };
assert.equal(parseSort({ sort: "divisi" }, COLS).column, "employees.division");
assert.equal(parseSort({ sort: "nama", dir: "desc" }, COLS).dir, "desc");
assert.equal(parseSort({ dir: "sideways" }, COLS).dir, "asc", "unknown dir → asc");
assert.equal(parseSort({ sort: "name;drop table" }, COLS).column, undefined, "not whitelisted");
assert.equal(parseSort({ sort: "toString" }, COLS).column, undefined, "prototype key");
assert.equal(parseSort({ sort: "zzz" }, COLS, "nama").key, "nama", "falls back");

assert.equal(pageHref("/karyawan", { div: "Engineering" }, { page: "2" }), "/karyawan?div=Engineering&page=2");
assert.equal(pageHref("/karyawan", { div: "Engineering", page: "5" }, { sort: "nama" }), "/karyawan?div=Engineering&sort=nama", "sorting resets page");
assert.equal(pageHref("/karyawan", { page: "5" }, { page: "1" }), "/karyawan", "page 1 is implicit");
assert.equal(pageHref("/karyawan", {}, {}), "/karyawan");

assert.equal(totalPages(0, 20), 1, "empty still has one page");
assert.equal(totalPages(41, 20), 3);
assert.equal(rangeLabel(2, 20, 137), "21–40 dari 137");
assert.equal(rangeLabel(7, 20, 137), "121–137 dari 137", "last page clamps");
assert.equal(rangeLabel(1, 20, 0), "0 dari 0");
assert.equal(rangeLabel(9, 20, 137), "0 dari 137", "page past the end");

// drag & drop bypasses the browser's own accept filtering, so acceptsFile has
// to redo it — a hole here means an .exe reaches the upload endpoint
assert.equal(acceptsFile("Kontrak.PDF", ".pdf,.jpg"), true, "extension is case-insensitive");
assert.equal(acceptsFile("virus.exe", ".pdf,.jpg"), false);
assert.equal(acceptsFile("laporan.2026.xlsx", ".xlsx"), true, "dots in the stem are fine");
assert.equal(acceptsFile("tanpa-ekstensi", ".pdf"), false, "no extension, no guess");
assert.equal(acceptsFile("shell.php.pdf", ".pdf"), true, "only the last segment counts");
assert.equal(acceptsFile("foto.png", "image/*"), true, "mime wildcard");
assert.equal(acceptsFile("kontrak.pdf", "image/*"), false);
assert.equal(acceptsFile("foto.png", "  .PNG , .jpg "), true, "padded, upper-case list");
assert.equal(acceptsFile("data.csv", ".csv,text/csv"), true);

// what the preview dialog may render in-page
assert.equal(previewKind("pdf"), "pdf");
assert.equal(previewKind("JPG"), "image");
assert.equal(previewKind("webp"), "image");
assert.equal(previewKind("svg"), null, "svg executes — never inline it");
assert.equal(previewKind("html"), null, "html executes — never inline it");
assert.equal(previewKind("xlsx"), null);
assert.equal(previewKind(""), null);

// size labels use the Indonesian decimal comma like the rest of the UI
assert.equal(ukuranFile(1024 * 1024), "1,0 MB");
assert.equal(ukuranFile(1_500_000), "1,4 MB");
assert.equal(ukuranFile(320 * 1024), "320 KB");
assert.equal(ukuranFile(0), "0 KB");

// distance: the geofence verdict in the attendance detail rides on this
assert.equal(jarakMeter(-6.2249, 106.8092, -6.2249, 106.8092), 0, "same point");
// Monas → Kota Tua is ~4.3 km; allow 150 m for the spherical model
const monasKota = jarakMeter(-6.1754, 106.8272, -6.1352, 106.8133);
assert.ok(
  Math.abs(monasKota - 4750) < 250,
  `Monas–Kota should be ~4,75 km, got ${monasKota} m`,
);
assert.equal(
  jarakMeter(-6.1754, 106.8272, -6.1352, 106.8133),
  jarakMeter(-6.1352, 106.8133, -6.1754, 106.8272),
  "symmetric",
);
// a 30 m step must not round away — that is the difference between inside and
// outside a 150 m geofence
assert.ok(jarakMeter(-6.2249, 106.8092, -6.22463, 106.8092) > 25);
assert.equal(formatJarak(24), "24 m");
assert.equal(formatJarak(999), "999 m");
assert.equal(formatJarak(1000), "1,0 km");
assert.equal(formatJarak(4750), "4,8 km");

// file helpers behind the dropzone and the preview dialog
assert.equal(ekstensi("Kontrak Kerja.PDF"), "pdf");
assert.equal(ekstensi("tanpa-ekstensi"), "");
assert.equal(ekstensi("arsip.tar.gz"), "gz");
assert.equal(acceptsFile("foto.JPG", ".jpg,.png"), true, "case-insensitive");
assert.equal(acceptsFile("virus.exe", ".jpg,.png"), false);
assert.equal(acceptsFile("tanpa-ekstensi", ".jpg"), false, "no extension, no guess");
assert.equal(acceptsFile("laporan.2026.xlsx", ".xlsx"), true, "double dots");
assert.equal(acceptsFile("foto.webp", "image/*"), true, "mime wildcard");
assert.equal(acceptsFile("kontrak.pdf", "image/*"), false);
assert.equal(previewKind("PDF"), "pdf");
assert.equal(previewKind("jpeg"), "image");
assert.equal(previewKind("svg"), null, "svg executes, never preview it");
assert.equal(previewKind("html"), null);
assert.equal(previewKind("xlsx"), null);
assert.equal(ukuranFile(320 * 1024), "320 KB");
assert.equal(ukuranFile(1.5 * 1024 * 1024), "1,5 MB");

// jejakAbsen: the tone rule is the whole point — a ping outside the fence has to
// read as a warning, one inside must not, and a punch keeps its own colour
{
  const kantor = { lat: -6.2, lng: 106.8, radius: 150 };
  const at = new Date("2026-08-09T01:00:00Z");
  const t = jejakAbsen(
    [
      { kind: "masuk", at, lat: "-6.2", lng: "106.8" },
      { kind: "lokasi", at, lat: "-6.2001", lng: "106.8" },
      { kind: "lokasi", at, lat: "-6.25", lng: "106.8" },
      { kind: "lokasi", at, lat: null, lng: null },
    ],
    kantor,
  );
  assert.equal(t.length, 3, "an event without coordinates is dropped, not pinned at 0,0");
  assert.equal(t[0].tone, "masuk");
  assert.equal(t[1].tone, "ping", "11 m away is inside a 150 m fence");
  assert.equal(t[2].tone, "peringatan", "5,5 km away is outside it");
  assert.match(t[0].label, /^Absen masuk 08\.00 · 0 m dari kantor$/, "WIB, not UTC");
  // WFH: no fence, so nothing can be outside one
  assert.equal(
    jejakAbsen([{ kind: "lokasi", at, lat: "-6.25", lng: "106.8" }], null)[0].tone,
    "ping",
  );
}

console.log("hr.ts self-check OK");
