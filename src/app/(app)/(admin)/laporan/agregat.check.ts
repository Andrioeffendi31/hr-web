/** Self-check untuk matematika panel /laporan. Run: npm run check */
import assert from "node:assert/strict";
import {
  type BarisRekap,
  delta,
  dinilai,
  perDivisi,
  perHari,
  periodeLalu,
  persen,
  ringkas,
  tanggalDalamRentang,
  tingkat,
  tren,
} from "@/app/(app)/(admin)/laporan/agregat";

const b = (
  date: string,
  division: string | null,
  hadir: number,
  telat: number,
  cuti: number,
  alpa: number,
): BarisRekap => ({
  date,
  division,
  hadir,
  telat,
  cuti,
  alpa,
  // seperti rekapSql: penyebutnya hari kerja, dan keempat ember menjumlah ke sana
  hari: hadir + telat + cuti + alpa,
});

// Senin 3 Agu 2026 s/d Rabu 5 Agu 2026, dua divisi. Selasa sengaja hanya diisi
// satu divisi, dan Rabu tidak diisi siapa pun (hari tanpa hari kerja).
const rows: BarisRekap[] = [
  b("2026-08-03", "Engineering", 8, 1, 0, 1),
  b("2026-08-03", "Finance", 4, 0, 1, 0),
  b("2026-08-04", "Engineering", 7, 2, 0, 1),
];

/**
 * Hari yang BELUM dinilai: `rekapSql` memasukkannya ke `hari` tapi tidak ke satu
 * pun ember (hari ini yang belum diabsen, hari sebelum `tracking_since`). Inilah
 * kasus yang membuat penyebut `hari` salah, dan ia terjadi pada setiap rentang
 * yang memuat hari ini.
 */
const adaBelum: BarisRekap[] = [
  {
    date: "2026-08-05",
    division: "Engineering",
    hadir: 8,
    telat: 2,
    cuti: 0,
    alpa: 0,
    hari: 12,
  },
];

// invarian pokok: total = jumlah per divisi = jumlah per hari
{
  const t = ringkas(rows);
  assert.equal(t.hari, 25, "10 + 5 + 10 hari kerja");
  assert.equal(
    t.hadir + t.telat + t.cuti + t.alpa,
    t.hari,
    "empat ember = penyebut",
  );

  const divisi = perDivisi(rows);
  assert.equal(divisi.length, 2);
  assert.equal(
    divisi.reduce((s, d) => s + d.hari, 0),
    t.hari,
    "jumlah per divisi harus sama dengan totalnya",
  );
  assert.deepEqual(
    divisi.map((d) => d.division),
    ["Engineering", "Finance"],
    "diurutkan menurut nama divisi",
  );

  const hari = perHari(rows);
  assert.equal(
    hari.reduce((s, h) => s + h.hari, 0),
    t.hari,
    "jumlah per hari dalam seminggu harus sama dengan totalnya",
  );
}

// penyebut = hari yang sudah dinilai, bukan seluruh hari kerja
{
  const t = ringkas(adaBelum);
  assert.equal(t.hari, 12, "dua hari di dalamnya belum dinilai");
  assert.equal(dinilai(t), 10, "hanya sepuluh yang punya jawaban");
  assert.equal(tingkat(t), 100, "10 dari 10 yang dinilai, bukan 10 dari 12");
  assert.equal(
    persen(t.hadir, dinilai(t))! + persen(t.telat, dinilai(t))!,
    100,
    "keempat persentase harus menjumlah 100% — kalau tidak, donutnya berlubang",
  );
  assert.equal(tren(adaBelum, "2026-08-05", "2026-08-05")[0].hadir, 80);
  assert.equal(perHari(adaBelum)[2].pct, 100, "Rabu 5 Agu");
}

// hari tanpa hari kerja: null, BUKAN 0% — garis 0% tiap Minggu adalah kebohongan
{
  const titik = tren(rows, "2026-08-03", "2026-08-05");
  assert.equal(
    titik.length,
    3,
    "satu titik per tanggal kalender, bukan per baris",
  );
  assert.deepEqual(
    titik.map((p) => p.date),
    ["2026-08-03", "2026-08-04", "2026-08-05"],
  );
  assert.equal(
    titik[2].hadir,
    null,
    "5 Agu tidak punya baris → lubang, bukan nol",
  );
  assert.equal(titik[0].hadir, 80, "12 hadir dari 15 hari dinilai");
  assert.equal(titik[1].alpa, 10, "1 alpa dari 10 hari dinilai");

  const hari = perHari(rows);
  assert.deepEqual(
    hari.map((h) => h.label),
    ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
    "urutan tampil mulai Senin walau sumbernya dow 0=Minggu",
  );
  assert.equal(hari[0].pct, 87, "Senin: (12+1)/15");
  assert.equal(hari[2].pct, null, "Rabu tanpa hari kerja → tanpa angka");
  assert.equal(
    hari[6].pct,
    null,
    "Minggu tidak pernah muncul di baris mana pun",
  );
}

// pembagian nol tidak boleh melahirkan NaN/Infinity di layar
{
  assert.equal(persen(0, 0), null);
  assert.equal(persen(3, 0), null, "tanpa penyebut tidak ada persentase");
  assert.equal(
    tingkat({ hadir: 0, telat: 0, cuti: 0, alpa: 0, hari: 0 }),
    null,
  );
  assert.equal(
    tingkat({ hadir: 0, telat: 0, cuti: 0, alpa: 0, hari: 28 }),
    null,
    "28 hari kerja yang semuanya belum dinilai bukan 0% kehadiran",
  );
  assert.deepEqual(ringkas([]), {
    hadir: 0,
    telat: 0,
    cuti: 0,
    alpa: 0,
    hari: 0,
  });
  assert.deepEqual(perDivisi([]), []);
  assert.equal(
    perHari([]).length,
    7,
    "tujuh batang tetap digambar walau kosong",
  );
  assert.equal(tren([], "2026-08-03", "2026-08-03")[0].hadir, null);
}

// delta: periode lalu yang kosong bukan "turun 86%"
{
  assert.equal(delta(86, 82), 4);
  assert.equal(delta(82, 86), -4);
  assert.equal(
    delta(86, null),
    null,
    "periode lalu tanpa hari kerja → tanpa delta",
  );
  assert.equal(delta(null, 86), null);
  assert.equal(delta(0, 0), 0, "nol bukan 'tidak ada data'");
}

// rentang & periode pembanding
{
  assert.equal(tanggalDalamRentang("2026-08-01", "2026-08-26").length, 26);
  assert.equal(tanggalDalamRentang("2026-08-01", "2026-08-01").length, 1);
  assert.equal(
    tanggalDalamRentang("2026-08-02", "2026-08-01").length,
    0,
    "rentang terbalik → kosong",
  );

  // 26 hari kalender ke belakang, berakhir sehari sebelum periodenya
  assert.deepEqual(periodeLalu("2026-08-01", "2026-08-26"), {
    dari: "2026-07-06",
    sampai: "2026-07-31",
  });
  // melewati batas bulan DAN tahun
  assert.deepEqual(periodeLalu("2026-01-01", "2026-01-31"), {
    dari: "2025-12-01",
    sampai: "2025-12-31",
  });
}

console.log("laporan/agregat.ts self-check OK");
