/** Self-check for the quota/date/attendance logic. Run: npm run check */
import assert from "node:assert/strict";
import {
  attendanceStatus,
  collectiveLeaveDays,
  dateFromIso,
  isIsoDate,
  isoFromDate,
  leaveQuota,
  overtimeMinutes,
  remainingLeave,
  rentangTanggal,
  statusGroup,
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

console.log("hr.ts self-check OK");
