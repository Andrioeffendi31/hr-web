/** Self-check for the quota/date/attendance logic. Run: npm run check */
import assert from "node:assert/strict";
import {
  attendanceStatus,
  collectiveLeaveDays,
  isIsoDate,
  leaveQuota,
  overtimeMinutes,
  remainingLeave,
  rentangTanggal,
  statusGroup,
  workingDays,
} from "./hr";

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

console.log("hr.ts self-check OK");
