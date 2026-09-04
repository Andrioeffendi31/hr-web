import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { awalMinggu, initials, skorKehadiran, todayWib } from "@/lib/hr";
import {
  grupSql,
  mulaiCatat,
  rekapSql,
  statusHariSql,
  type RekapBaris,
} from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
import { withMe } from "@/lib/me";

/**
 * Papan peringkat kehadiran untuk tab Peringkat di ponsel.
 *
 * Angkanya WAJIB sama dengan Rekap Kehadiran: keduanya memanggil `rekapSql()`
 * yang sama, bukan dua kueri yang kebetulan mirip. Papan peringkat yang
 * angkanya berbeda dari laporan resmi lebih buruk daripada tidak ada papan
 * peringkat — orang akan memperdebatkan peringkatnya, bukan kehadirannya.
 *
 * Poin dihitung di SERVER lewat `skorKehadiran()`, bukan di ponsel: bobotnya
 * kebijakan perusahaan, dan aplikasi yang sudah terpasang tidak boleh menjadi
 * tempat aturan itu tersimpan.
 */

const PERIODS = ["week", "month", "all"] as const;
type Period = (typeof PERIODS)[number];

/** Pimpinan tidak diperingkat. */
const DIPERINGKAT = and(eq(employees.active, true), ne(employees.role, "pimpinan"))!;

export const GET = withMe(async (me, req) => {
  const hariIni = todayWib();
  const q = new URL(req.url).searchParams.get("period");
  const period: Period = (PERIODS as readonly string[]).includes(q ?? "")
    ? (q as Period)
    : "week";

  /**
   * Batas awal periode "Semua".
   *
   * `tracking_since` lebih dulu — itu definisi resmi "sejak kapan aplikasi ini
   * mencatat", dan hari sebelumnya memang tidak dinilai oleh rekapSql. Kalau
   * belum diisi, absensi paling awal yang ada. Kalau tabelnya masih kosong,
   * hari ini: rentang kosong harus menghasilkan daftar kosong, bukan galat.
   */
  const awalSemua = async () => {
    const sejak = await mulaiCatat();
    if (sejak) return sejak;
    const [row] = await db
      .select({ d: sql<string | null>`min(${attendance.date})` })
      .from(attendance);
    return row?.d ?? hariIni;
  };

  const dari =
    period === "week"
      ? awalMinggu(hariIni)
      : period === "month"
        ? `${hariIni.slice(0, 7)}-01`
        : await awalSemua();

  const tahun = [
    ...new Set([Number(dari.slice(0, 4)), Number(hariIni.slice(0, 4))]),
  ];
  const [libur, sejak] = await Promise.all([
    Promise.all(tahun.map(holidaySet)).then(
      (s) => new Set(s.flatMap((x) => [...x])),
    ),
    mulaiCatat(),
  ]);

  const [rekap, [hariIniAgg]] = await Promise.all([
    db.execute(
      rekapSql({
        sejak,
        dari,
        sampai: hariIni,
        hariIni,
        libur,
        pilih: sql`${employees.id} as id, ${employees.name} as name, ${employees.division} as division, ${employees.photoUrl} as "photoKey"`,
        groupBy: sql`${employees.id}, ${employees.name}, ${employees.division}, ${employees.photoUrl}`,
        where: DIPERINGKAT,
      }),
    ),

    /**
     * Indikator "tim hari ini" — empat angka yang menggantikan papan kehadiran
     * tim yang dulu menempati tab ini. Yang dipertahankan adalah "berapa
     * banyak", bukan "siapa".
     *
     * Sengaja TIDAK mengecualikan pimpinan: ini pertanyaan tentang tim yang
     * hadir hari ini, dan seorang pimpinan yang masuk kerja tetap orang yang
     * hadir. Pengecualian di atas hanya soal siapa yang diperingkat.
     */
    (() => {
      const st = statusHariSql(hariIni);
      const g = grupSql(st);
      return db
        .select({
          hadir: sql<number>`count(*) filter (where ${g.hadir})`.mapWith(Number),
          telat: sql<number>`count(*) filter (where ${g.telat})`.mapWith(Number),
          izin: sql<number>`count(*) filter (where ${g.cuti})`.mapWith(Number),
          belum: sql<number>`count(*) filter (where ${g.belum})`.mapWith(Number),
        })
        .from(employees)
        .leftJoin(
          attendance,
          and(
            eq(attendance.employeeId, employees.id),
            eq(attendance.date, hariIni),
          ),
        )
        .where(eq(employees.active, true));
    })(),
  ]);

  type Baris = RekapBaris & {
    id: number;
    name: string;
    division: string | null;
    photoKey: string | null;
  };

  /**
   * Urutannya di JS, bukan di SQL: poinnya turunan dari empat ember dan tidak
   * ada sebagai kolom. Barisnya sejumlah karyawan aktif — belasan, bukan ribuan.
   *
   * Pemecah serinya berlapis dan deterministik (hari tepat waktu, lalu nama):
   * peringkat yang berubah-ubah tiap kali disegarkan untuk angka yang sama akan
   * dibaca sebagai bug, dan Postgres tidak menjanjikan urutan untuk baris yang
   * nilai kuncinya sama.
   */
  const papan = (rekap.rows as unknown as Baris[])
    .map((r) => ({
      id: r.id,
      name: r.name,
      division: r.division,
      photoKey: r.photoKey,
      initials: initials(r.name),
      poin: skorKehadiran(r),
      tepatWaktu: r.hadir,
      telat: r.telat,
      alpa: r.alpa,
      hari: r.hari,
    }))
    .sort(
      (a, b) =>
        b.poin - a.poin ||
        b.tepatWaktu - a.tepatWaktu ||
        a.name.localeCompare(b.name, "id"),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const aku = papan.find((r) => r.id === me.id) ?? null;

  return Response.json({
    period,
    dari,
    sampai: hariIni,
    /** hari kerja pada periode ini; nol berarti tidak ada yang bisa dinilai */
    hariKerja: papan[0]?.hari ?? 0,
    hariIni: hariIniAgg ?? { hadir: 0, telat: 0, izin: 0, belum: 0 },
    /** null kalau pemanggil tidak diperingkat (pimpinan) */
    me: aku,
    peringkatDari: papan.length,
    leaders: papan,
  });
});
