import { NAMA_HARI } from "@/lib/hr";
import type { RekapBaris } from "@/lib/kehadiran";

/**
 * Semua angka di /laporan diturunkan dari SATU kueri: rekap per (tanggal × divisi).
 *
 * Empat panel (ringkasan, komposisi, tren harian, per hari dalam seminggu) plus
 * tabel per divisi adalah penjumlahan dari baris yang sama. Satu kueri untuk lima
 * panel, bukan lima kueri yang harus dijelaskan kalau nanti tidak cocok satu sama
 * lain.
 *
 * Penyebut setiap persentase adalah `dinilai()`, bukan kolom `hari` milik
 * `rekapSql` — lihat alasannya di sana.
 *
 * Semuanya murni dan tanpa DB, jadi agregat.check.ts bisa menjaganya.
 */

export type BarisRekap = RekapBaris & { date: string; division: string | null };

export type Total = RekapBaris;

const KOSONG: Total = { hadir: 0, telat: 0, cuti: 0, alpa: 0, hari: 0 };

const tambah = (a: Total, b: RekapBaris): Total => ({
  hadir: a.hadir + b.hadir,
  telat: a.telat + b.telat,
  cuti: a.cuti + b.cuti,
  alpa: a.alpa + b.alpa,
  hari: a.hari + b.hari,
});

/** Persen dari penyebut yang boleh nol — nol hari bukan 0%, tapi tidak ada angka. */
export const persen = (n: number, dari: number) =>
  dari > 0 ? Math.round((n / dari) * 100) : null;

/**
 * Hari yang sudah PUNYA jawaban, dan itulah penyebut setiap persentase di halaman ini.
 *
 * Bukan `hari`: penyebut `rekapSql` memuat juga hari yang belum dinilai — hari ini
 * yang orangnya belum absen (`belum_absen`) dan hari sebelum `tracking_since`
 * (`belum_dicatat`). Keduanya tidak masuk keempat ember, jadi memakai `hari`
 * membuat empat persentase yang tidak pernah menjumlah 100% dan donut dengan
 * irisan hilang — pada rentang yang memuat hari ini, selalu.
 */
export const dinilai = (t: RekapBaris) => t.hadir + t.telat + t.cuti + t.alpa;

/** Tingkat kehadiran: hadir + telat, karena orang yang terlambat tetap datang. */
export const tingkat = (t: RekapBaris) => persen(t.hadir + t.telat, dinilai(t));

export function ringkas(rows: BarisRekap[]): Total {
  return rows.reduce(tambah, KOSONG);
}

/**
 * Selisih poin persen terhadap periode sebelumnya.
 *
 * null kalau salah satu periodenya tidak punya hari kerja sama sekali: periode
 * lalu yang kosong (sistem baru dipasang, atau rentang sebelum `tracking_since`)
 * tidak boleh muncul sebagai "turun 86%".
 */
export function delta(sekarang: number | null, lalu: number | null) {
  if (sekarang === null || lalu === null) return null;
  return sekarang - lalu;
}

/**
 * Satu titik per TANGGAL KALENDER dalam rentang, bukan per baris hasil.
 *
 * Hari yang bukan hari kerja bagi siapa pun tidak punya baris, dan nilainya
 * dibiarkan null: garis yang jatuh ke 0% tiap hari Minggu adalah grafik yang
 * berbohong tentang hari yang tidak pernah dinilai.
 */
export function tren(rows: BarisRekap[], dari: string, sampai: string) {
  const per = new Map<string, Total>();
  for (const r of rows) per.set(r.date, tambah(per.get(r.date) ?? KOSONG, r));

  const titik: {
    date: string;
    hadir: number | null;
    telat: number | null;
    alpa: number | null;
  }[] = [];
  for (const d of tanggalDalamRentang(dari, sampai)) {
    const t = per.get(d);
    titik.push({
      date: d,
      hadir: t ? persen(t.hadir, dinilai(t)) : null,
      telat: t ? persen(t.telat, dinilai(t)) : null,
      alpa: t ? persen(t.alpa, dinilai(t)) : null,
    });
  }
  return titik;
}

/**
 * Tujuh batang Senin…Minggu.
 *
 * Sumbernya `extract(dow)` Postgres (0 = Minggu, sama seperti indeks NAMA_HARI),
 * tapi urutan tampilnya mulai Senin — jadi pemetaannya di sini, bukan di SQL.
 * Hari yang bukan hari kerja bagi divisi mana pun bernilai null, bukan 0%.
 */
export function perHari(rows: BarisRekap[]) {
  const per = new Map<number, Total>();
  for (const r of rows) {
    const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    per.set(dow, tambah(per.get(dow) ?? KOSONG, r));
  }
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
    const t = per.get(dow);
    return {
      dow,
      label: NAMA_HARI[dow].slice(0, 3),
      pct: t ? tingkat(t) : null,
      hari: t?.hari ?? 0,
      dinilai: t ? dinilai(t) : 0,
    };
  });
}

/** Baris tabel Rekap Kehadiran, satu per divisi, diurutkan menurut nama. */
export function perDivisi(rows: BarisRekap[]) {
  const per = new Map<string | null, Total>();
  for (const r of rows)
    per.set(r.division, tambah(per.get(r.division) ?? KOSONG, r));
  return [...per.entries()]
    .map(([division, t]) => ({
      division,
      ...t,
      dinilai: dinilai(t),
      pct: tingkat(t),
    }))
    .sort((a, b) => (a.division ?? "").localeCompare(b.division ?? ""));
}

/** Tanggal kalender dari `dari` sampai `sampai`, inklusif. */
export function tanggalDalamRentang(dari: string, sampai: string) {
  const out: string[] = [];
  const d = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${sampai}T00:00:00Z`);
  while (d <= akhir) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Periode sepanjang periode aktif yang berakhir sehari sebelum `dari`.
 *
 * Panjangnya dihitung dalam HARI KALENDER, bukan hari kerja: "1–26 Agustus"
 * dibandingkan dengan "6–31 Juli", yang jumlah hari kerjanya boleh saja berbeda.
 * Yang dibandingkan adalah persentase, jadi penyebut yang berbeda tidak merusak
 * perbandingannya.
 */
export function periodeLalu(dari: string, sampai: string) {
  const hari = tanggalDalamRentang(dari, sampai).length;
  const geser = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return { dari: geser(dari, -hari), sampai: geser(dari, -1) };
}
