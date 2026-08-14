/** Self-check for the quota/date/attendance logic. Run: npm run check */
import assert from "node:assert/strict";
import {
  acceptsFile,
  attendanceStatus,
  cekSandi,
  collectiveLeaveDays,
  dateFromIso,
  ekstensi,
  formatJarak,
  isHariKerja,
  isIsoDate,
  isoFromDate,
  jarakMeter,
  jedaJejak,
  jejakAbsen,
  KECEPATAN_MUSTAHIL,
  kecepatanKmJam,
  leaveQuota,
  overtimeMinutes,
  previewKind,
  remainingLeave,
  rentangTanggal,
  resolveShift,
  statusDariCuti,
  statusGroup,
  statusHarian,
  telepon,
  tooMany,
  ukuranFile,
  umur,
  workingDays,
} from "./hr";
import {
  pageHref,
  parsePaging,
  parseSort,
  rangeLabel,
  totalPages,
} from "./paging";

// working days: 3 Aug 2026 (Mon) – 5 Aug 2026 (Wed) = 3
assert.equal(workingDays("2026-08-03", "2026-08-05"), 3);
// spans a weekend: Fri 31 Jul – Mon 3 Aug = Fri + Mon = 2
assert.equal(workingDays("2026-07-31", "2026-08-03"), 2);
// holidays are excluded too (17–18 Aug libur bersama)
assert.equal(
  workingDays(
    "2026-08-17",
    "2026-08-21",
    new Set(["2026-08-17", "2026-08-18"]),
  ),
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
assert.equal(
  isoFromDate(new Date(2026, 11, 31, 23, 59)),
  "2026-12-31",
  "late 31 Dec",
);
assert.equal(dateFromIso("2026-08-17").getDate(), 17, "no off-by-one");

// quota: 12 base + 1 per completed 2 years
assert.equal(leaveQuota("2021-02-01", "2026-07-30"), 14, "5y tenure → +2");
assert.equal(leaveQuota("2025-06-02", "2026-07-30"), 12, "1y tenure → +0");
assert.equal(
  leaveQuota("2024-08-19", "2026-07-30"),
  12,
  "anniversary not yet passed",
);
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
assert.equal(
  attendanceStatus("08:15", "08:00:00", 15),
  "hadir",
  "tolerance edge",
);
assert.equal(attendanceStatus("08:26", "08:00:00", 15), "telat");
assert.equal(attendanceStatus(null, "08:00:00", 15), "belum_absen");
assert.equal(attendanceStatus("09:00", "08:00:00", 15, true), "wfh");

// per-division shift resolution, against the company default
const defaultShift = {
  shiftStart: "08:00:00",
  shiftEnd: "17:00:00",
  lateToleranceMinutes: 15,
};
assert.deepEqual(
  resolveShift(null, defaultShift),
  { start: "08:00", end: "17:00", toleranceMinutes: 15 },
  "no division row → company default",
);
assert.deepEqual(
  resolveShift(
    {
      shiftStart: "09:30:00",
      shiftEnd: "18:30:00",
      lateToleranceMinutes: null,
    },
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
assert.equal(
  attendanceStatus("09:30", strict.start, strict.toleranceMinutes),
  "hadir",
);
assert.equal(
  attendanceStatus("09:31", strict.start, strict.toleranceMinutes),
  "telat",
);

// stat-card buckets
assert.equal(statusGroup("wfh"), "hadir");
assert.equal(statusGroup("sakit"), "cuti");
assert.equal(statusGroup("belum_absen"), "belum");

assert.equal(rentangTanggal("2026-08-03", "2026-08-05"), "3–5 Agu");
assert.equal(rentangTanggal("2026-07-31", "2026-07-31"), "31 Jul");

// paging: hostile query strings must degrade, never crash or reach SQL
assert.deepEqual(parsePaging({}), { page: 1, perPage: 20, offset: 0 });
assert.deepEqual(parsePaging({ page: "3" }), {
  page: 3,
  perPage: 20,
  offset: 40,
});
assert.equal(parsePaging({ page: "-5" }).page, 1, "negative page");
assert.equal(parsePaging({ page: "abc" }).page, 1, "non-numeric page");
assert.equal(parsePaging({ page: "2.7" }).page, 2, "fractional page floors");
assert.equal(parsePaging({ perPage: "99999" }).perPage, 100, "perPage capped");
assert.equal(parsePaging({ perPage: "1" }).perPage, 5, "perPage floored");

const COLS = { nama: "employees.name", divisi: "employees.division" };
assert.equal(parseSort({ sort: "divisi" }, COLS).column, "employees.division");
assert.equal(parseSort({ sort: "nama", dir: "desc" }, COLS).dir, "desc");
assert.equal(
  parseSort({ dir: "sideways" }, COLS).dir,
  "asc",
  "unknown dir → asc",
);
assert.equal(
  parseSort({ sort: "name;drop table" }, COLS).column,
  undefined,
  "not whitelisted",
);
assert.equal(
  parseSort({ sort: "toString" }, COLS).column,
  undefined,
  "prototype key",
);
assert.equal(
  parseSort({ sort: "zzz" }, COLS, "nama").key,
  "nama",
  "falls back",
);

assert.equal(
  pageHref("/karyawan", { div: "Engineering" }, { page: "2" }),
  "/karyawan?div=Engineering&page=2",
);
assert.equal(
  pageHref("/karyawan", { div: "Engineering", page: "5" }, { sort: "nama" }),
  "/karyawan?div=Engineering&sort=nama",
  "sorting resets page",
);
assert.equal(
  pageHref("/karyawan", { page: "5" }, { page: "1" }),
  "/karyawan",
  "page 1 is implicit",
);
assert.equal(pageHref("/karyawan", {}, {}), "/karyawan");

assert.equal(totalPages(0, 20), 1, "empty still has one page");
assert.equal(totalPages(41, 20), 3);
assert.equal(rangeLabel(2, 20, 137), "21–40 dari 137");
assert.equal(rangeLabel(7, 20, 137), "121–137 dari 137", "last page clamps");
assert.equal(rangeLabel(1, 20, 0), "0 dari 0");
assert.equal(rangeLabel(9, 20, 137), "0 dari 137", "page past the end");

// drag & drop bypasses the browser's own accept filtering, so acceptsFile has
// to redo it — a hole here means an .exe reaches the upload endpoint
assert.equal(
  acceptsFile("Kontrak.PDF", ".pdf,.jpg"),
  true,
  "extension is case-insensitive",
);
assert.equal(acceptsFile("virus.exe", ".pdf,.jpg"), false);
assert.equal(
  acceptsFile("laporan.2026.xlsx", ".xlsx"),
  true,
  "dots in the stem are fine",
);
assert.equal(
  acceptsFile("tanpa-ekstensi", ".pdf"),
  false,
  "no extension, no guess",
);
assert.equal(
  acceptsFile("shell.php.pdf", ".pdf"),
  true,
  "only the last segment counts",
);
assert.equal(acceptsFile("foto.png", "image/*"), true, "mime wildcard");
assert.equal(acceptsFile("kontrak.pdf", "image/*"), false);
assert.equal(
  acceptsFile("foto.png", "  .PNG , .jpg "),
  true,
  "padded, upper-case list",
);
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

// kecepatan tersirat: penanda GPS palsu yang tidak bergantung pada bendera perangkat
{
  const t = (jam: number) => new Date(Date.UTC(2026, 7, 20, jam));
  // Jakarta → Surabaya (±660 km) dalam 4 menit: tidak ada yang bisa
  const lompat = kecepatanKmJam(
    { lat: -6.1754, lng: 106.8272, at: new Date(Date.UTC(2026, 7, 20, 9, 0)) },
    { lat: -7.2575, lng: 112.7521, at: new Date(Date.UTC(2026, 7, 20, 9, 4)) },
  );
  assert.ok(lompat > KECEPATAN_MUSTAHIL, `lompatan lintas pulau, got ${lompat}`);

  // menyeberang Jakarta dalam 2,5 jam: hari kerja yang biasa saja
  const wajar = kecepatanKmJam(
    { lat: -6.1754, lng: 106.8272, at: t(9) },
    { lat: -6.2607, lng: 106.7816, at: t(11.5) },
  );
  assert.ok(wajar < KECEPATAN_MUSTAHIL, `menyeberang kota, got ${wajar}`);

  // fix GPS yang meleset 1 km pada jeda ping normal tidak boleh menuduh siapa pun
  const meleset = kecepatanKmJam(
    { lat: -6.1754, lng: 106.8272, at: t(9) },
    { lat: -6.1844, lng: 106.8272, at: t(11.5) },
  );
  assert.ok(meleset < 1, `GPS meleset 1 km, got ${meleset}`);

  // dua fix pada detik yang sama tidak menyiratkan kecepatan — bukan Infinity
  const kembar = kecepatanKmJam(
    { lat: -6.1754, lng: 106.8272, at: t(9) },
    { lat: -7.2575, lng: 112.7521, at: t(9) },
  );
  assert.equal(kembar, 0, "pembagian nol tidak boleh menuduh");
}

// jeda jejak lokasi: lubang yang cukup panjang untuk berarti aplikasinya mati
{
  const t = (jam: number, menit = 0) =>
    new Date(Date.UTC(2026, 7, 14, jam - 7, menit)); // WIB → UTC
  // absen masuk 08:00, ping 11:00 dan 14:00, absen keluar 17:00 — hari yang normal
  const rapat = [t(8), t(11), t(14)];
  assert.deepEqual(jedaJejak(rapat, t(17)), [], "interval 3 jam bukan jeda");

  // absen masuk 02:05, ping 02:05, lalu diam sampai 11:35 — kasus di tangkapan layar
  const bolong = [t(2, 5), t(2, 5), t(11, 35)];
  const jeda = jedaJejak(bolong, t(17));
  assert.equal(jeda.length, 2, "satu lubang pagi, satu lubang sore");
  assert.equal(jeda[0].menit, 570, "02:05 → 11:35 = 9 jam 30 menit");
  assert.equal(jeda[1].menit, 325, "11:35 → 17:00 = 5 jam 25 menit");

  // hari yang masih berjalan tanpa batas kanan: jeda terakhirnya tidak dinilai
  assert.equal(
    jedaJejak([t(8), t(11)], null).length,
    0,
    "tanpa akhir, jeda ekor tidak dihitung",
  );

  // urutan masuk tidak harus terurut — yang dinilai adalah garis waktunya
  assert.deepEqual(jedaJejak([t(14), t(8)], t(14)), jedaJejak([t(8), t(14)], t(14)));
  assert.equal(jedaJejak([t(8), t(14)], t(14))[0].menit, 360);

  // satu titik saja, dan harinya sudah ditutup: jarak ke penutupnya tetap terbaca
  assert.equal(jedaJejak([t(8)], t(17))[0].menit, 540);
}

// file helpers behind the dropzone and the preview dialog
assert.equal(ekstensi("Kontrak Kerja.PDF"), "pdf");
assert.equal(ekstensi("tanpa-ekstensi"), "");
assert.equal(ekstensi("arsip.tar.gz"), "gz");
assert.equal(acceptsFile("foto.JPG", ".jpg,.png"), true, "case-insensitive");
assert.equal(acceptsFile("virus.exe", ".jpg,.png"), false);
assert.equal(
  acceptsFile("tanpa-ekstensi", ".jpg"),
  false,
  "no extension, no guess",
);
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
  assert.equal(
    t.length,
    3,
    "an event without coordinates is dropped, not pinned at 0,0",
  );
  assert.equal(t[0].tone, "masuk");
  assert.equal(t[1].tone, "ping", "11 m away is inside a 150 m fence");
  assert.equal(t[2].tone, "peringatan", "5,5 km away is outside it");
  assert.match(
    t[0].label,
    /^Absen masuk 08\.00 · 0 m dari kantor$/,
    "WIB, not UTC",
  );
  // WFH: no fence, so nothing can be outside one
  assert.equal(
    jejakAbsen([{ kind: "lokasi", at, lat: "-6.25", lng: "106.8" }], null)[0]
      .tone,
    "ping",
  );
}

// telepon / umur — the two formatters the employee record added
{
  assert.equal(
    telepon("0858 8182 0410"),
    "0858-8182-0410",
    "spacing in the source data is ignored",
  );
  assert.equal(
    telepon("085881820410"),
    "0858-8182-0410",
    "same number, same output",
  );
  assert.equal(
    telepon("08123456789"),
    "0812-3456-789",
    "a short last group is not padded",
  );
  assert.equal(telepon(null), "—", "no number is not an empty string");
  assert.equal(telepon(""), "—");

  assert.equal(
    umur("1991-10-04", "2026-08-13"),
    34,
    "birthday not yet reached this year",
  );
  assert.equal(
    umur("1991-08-13", "2026-08-13"),
    35,
    "the birthday itself counts",
  );
  assert.equal(umur("1991-08-14", "2026-08-13"), 34, "one day short");
  assert.equal(umur(null), null, "no birth date is null, not 0 or NaN");
  assert.equal(umur("bukan-tanggal"), null);
}

// cekSandi — every rule fails on its own, and the shared import password fails
{
  assert.equal(cekSandi("Rahasia1!"), null, "meets every rule");
  assert.match(cekSandi("Rhs1!")!, /8 karakter/);
  assert.match(cekSandi("rahasia1!")!, /kapital/);
  assert.match(cekSandi("Rahasiaa!")!, /angka/);
  assert.match(cekSandi("Rahasia12")!, /simbol/);
  // the whole point of the flag on 26 accounts: the shared password cannot be kept
  assert.match(
    cekSandi("nanum2026")!,
    /kapital/,
    "the import password is rejected",
  );
  assert.equal(
    cekSandi("Rahasia1é"),
    null,
    "a non-ASCII character counts as a symbol",
  );
  assert.equal(cekSandi("A1!" + "a".repeat(69)), null, "72 bytes is allowed");
  assert.match(cekSandi("A1!" + "a".repeat(70))!, /panjang/, "73 is not");
  // é is two bytes, so 71 characters can still be over the byte limit
  assert.match(
    cekSandi("A1!" + "é".repeat(35))!,
    /panjang/,
    "measured in bytes, not characters",
  );
}

// tooMany — the window slides rather than resetting on a fixed boundary
{
  for (let i = 0; i < 5; i++)
    assert.equal(
      tooMany("uji", 5, 1000, 1_000),
      false,
      `attempt ${i + 1} of 5`,
    );
  assert.equal(
    tooMany("uji", 5, 1000, 1_000),
    true,
    "the sixth in-window attempt",
  );
  assert.equal(tooMany("uji", 5, 1000, 3_000), false, "and the window slides");
  assert.equal(tooMany("lain", 5, 1000, 1_000), false, "keys are independent");
}

// statusHarian — urutan keputusannya yang diuji, bukan sekadar tiap cabang
{
  const shift = { start: "08:00", toleranceMinutes: 15 };
  const libur = new Set(["2026-08-17"]);          // 17 Agustus, Senin
  const hariIni = "2026-08-20";                    // Kamis
  const dasar = { hariIni, clockIn: null, libur, shift };

  // 1. sudah absen menang atas segalanya
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-18", clockIn: "07:55" }),
    "hadir",
  );
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-18", clockIn: "08:30" }),
    "telat",
  );

  // 2. cuti disetujui SELALU menang atas tuduhan — inti fitur ini
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-18", cuti: "Cuti Tahunan" }),
    "cuti",
    "hari kerja lampau tanpa absen, tapi cutinya disetujui",
  );
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-18", cuti: "Cuti Sakit" }), "sakit");
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-18", cuti: "Izin Khusus" }), "izin");

  // 3. akhir pekan dan hari libur nasional tidak pernah dihitung
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-15" }), null, "Sabtu");
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-16" }), null, "Minggu");
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-17" }), null, "libur nasional");

  // 4. hari ini dan besok tidak pernah dituduh
  assert.equal(statusHarian({ ...dasar, tanggal: hariIni }), "belum_absen", "hari ini");
  assert.equal(statusHarian({ ...dasar, tanggal: "2026-08-21" }), "belum_absen", "besok");

  // 5. baru yang tersisa
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-18" }),
    "tanpa_keterangan",
    "hari kerja lampau, tanpa absen, tanpa izin",
  );
}

// isHariKerja / statusDariCuti
{
  const libur = new Set(["2026-08-17"]);
  assert.equal(isHariKerja("2026-08-18", libur), true);
  assert.equal(isHariKerja("2026-08-15", libur), false, "Sabtu");
  assert.equal(isHariKerja("2026-08-17", libur), false, "libur nasional");
  assert.equal(isHariKerja("2026-08-17"), true, "tanpa daftar libur, hanya akhir pekan");
  assert.equal(statusDariCuti("Cuti Tahunan"), "cuti");
}

// hari kerja per divisi: yang liburnya Jumat tidak boleh dituduh setiap Jumat
{
  const libur = new Set<string>();
  const jumatSabtu = [0, 1, 2, 3, 4] as const; // Minggu–Kamis masuk, Jumat & Sabtu libur
  assert.equal(isHariKerja("2026-08-21", libur, jumatSabtu), false, "Jumat, hari liburnya");
  assert.equal(isHariKerja("2026-08-16", libur, jumatSabtu), true, "Minggu, hari kerjanya");
  assert.equal(isHariKerja("2026-08-16", libur), false, "divisi lain: Minggu tetap libur");

  // dan hari libur nasional tetap libur bagi siapa pun
  assert.equal(isHariKerja("2026-08-17", new Set(["2026-08-17"]), jumatSabtu), false);

  const shift = { start: "08:00", toleranceMinutes: 15 };
  const dasar = { hariIni: "2026-08-24", clockIn: null, libur, shift };
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-21", hariKerja: jumatSabtu }),
    null,
    "Jumat: hari libur divisinya, jadi tidak dihitung sama sekali",
  );
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-21" }),
    "tanpa_keterangan",
    "Jumat yang sama, divisi dengan jadwal default",
  );
  assert.equal(
    statusHarian({ ...dasar, tanggal: "2026-08-16", hariKerja: jumatSabtu }),
    "tanpa_keterangan",
    "Minggu: hari kerjanya, jadi bolos tetap bolos",
  );

  // dan penghitung hari cuti ikut jadwal itu, bukan Senin–Jumat
  assert.equal(workingDays("2026-08-17", "2026-08-23", new Set(), jumatSabtu), 5);
  assert.equal(workingDays("2026-08-17", "2026-08-23"), 5, "default: Senin–Jumat");
  assert.equal(
    workingDays("2026-08-21", "2026-08-22", new Set(), jumatSabtu),
    0,
    "Jumat–Sabtu: akhir pekan divisinya",
  );
}

// statusGroup: nilai baru TIDAK boleh jatuh ke ember cuti lewat fallthrough
{
  assert.equal(statusGroup("tanpa_keterangan"), "alpa", "bukan 'cuti' — itu kebalikannya");
  assert.equal(statusGroup("libur"), "libur", "hari libur bukan kehadiran dan bukan tuduhan");
  assert.equal(statusGroup("belum_absen"), "belum");
  assert.equal(statusGroup("hadir"), "hadir");
  assert.equal(statusGroup("telat"), "telat");
  assert.equal(statusGroup("izin"), "cuti");
}

console.log("hr.ts self-check OK");
