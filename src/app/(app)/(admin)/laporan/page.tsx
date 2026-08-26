import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { attendance, divisions, employees, settings } from "@/db/schema";
import { PageHead, Panel } from "@/components/bits";
import { DateRangeField } from "@/components/date-range-field";
import { labelRentang, namaBulan, todayWib } from "@/lib/hr";
import { mulaiCatat, rekapSql, type RekapBaris } from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
import { cn } from "@/lib/utils";
import {
  type BarisRekap,
  delta,
  dinilai,
  perDivisi,
  perHari,
  periodeLalu,
  persen,
  ringkas,
  tingkat,
  tren,
} from "./agregat";
import { BarPerHari, Donut, TrenGaris, type IrisanDonut } from "./charts";

const REPORTS = [
  {
    key: "kehadiran",
    label: "Rekap Kehadiran",
    desc: "Masuk, keluar, dan status harian per karyawan",
  },
  {
    key: "keterlambatan",
    label: "Rekap Keterlambatan",
    desc: "Jumlah dan menit keterlambatan per karyawan",
  },
  {
    key: "cuti",
    label: "Rekap Cuti & Izin",
    desc: "Pengajuan, durasi, dan saldo terpakai",
  },
  {
    key: "lembur",
    label: "Rekap Lembur",
    desc: "Jam lembur dan tipe hari per karyawan",
  },
  {
    key: "divisi",
    label: "Absensi per Divisi",
    desc: "Tingkat kehadiran agregat tiap divisi",
  },
  {
    key: "karyawan",
    label: "Daftar Karyawan Aktif",
    desc: "Data kepegawaian siap audit",
  },
] as const;

/** Ember durasi keterlambatan, dihitung dari BATAS TOLERANSI — lihat `emberSql`. */
const EMBER = [
  { key: "b1", label: "≤ 15 menit", color: "var(--success)" },
  { key: "b2", label: "16 – 30 menit", color: "var(--warning)" },
  { key: "b3", label: "31 – 60 menit", color: "var(--subtle)" },
  { key: "b4", label: "> 60 menit", color: "var(--danger)" },
] as const;

type Ember = Record<(typeof EMBER)[number]["key"], number>;

/**
 * Distribusi durasi keterlambatan.
 *
 * Tidak lewat `rekapSql`: rekap tahu berapa KALI orang terlambat, bukan berapa
 * lama — tidak ada kolom menit di tabel absensi, jadi menitnya diturunkan saat
 * dibaca dari jam masuk terhadap batas toleransi shift ORANG ITU (shift divisinya,
 * jatuh ke default perusahaan per kolom, sama seperti `resolveShift()` di TS).
 *
 * Diukur dari BATAS TOLERANSI, bukan dari jam shift: dengan toleransi 15 menit,
 * ember "≤ 15 menit" yang diukur dari jam shift akan selalu kosong — barisnya
 * belum berstatus `telat` sama sekali. Yang dijawab panel ini adalah "seberapa
 * jauh melewati batas", dan itu pertanyaan yang punya jawaban.
 *
 * `review_ok is not true` mengikuti ekspor keterlambatan: keterlambatan yang
 * alasannya sudah diterima admin bukan lagi keterlambatan.
 */
const emberSql = (dari: string, sampai: string) => sql`
  select
    count(*) filter (where m <= 15)::int              as b1,
    count(*) filter (where m > 15 and m <= 30)::int   as b2,
    count(*) filter (where m > 30 and m <= 60)::int   as b3,
    count(*) filter (where m > 60)::int               as b4
  from (
    select extract(epoch from (
      ${attendance.clockIn} - (
        coalesce(${divisions.shiftStart}, s.shift_start)
        + coalesce(${divisions.lateToleranceMinutes}, s.late_tolerance_minutes)
          * interval '1 minute'
      )
    )) / 60 as m
    from ${attendance}
    join ${employees} on ${employees.id} = ${attendance.employeeId}
    left join ${divisions} on ${divisions.name} = ${employees.division}
    -- satu baris, tapi tetap dibatasi: cross join ke tabel yang kelak punya dua
    -- baris akan menghitung tiap keterlambatan dua kali tanpa suara
    cross join (select * from ${settings} limit 1) s
    where ${and(
      gte(attendance.date, dari),
      lte(attendance.date, sampai),
      eq(attendance.status, "telat"),
      eq(employees.active, true),
    )}
      and ${attendance.reviewOk} is not true
      and ${attendance.clockIn} is not null
  ) x
`;

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayWib();
  const from = sp.from ?? `${today.slice(0, 7)}-01`;
  const to = sp.to ?? today;
  // hari yang belum tiba bukan hari yang bisa dibolos
  const sampai = to < today ? to : today;
  const lalu = periodeLalu(from, to);

  /**
   * Hari libur untuk SETIAP tahun yang disentuh — periode aktif maupun
   * pembandingnya. Sebelumnya hanya tahun `from` yang dimuat, jadi rentang
   * Desember–Januari kehilangan libur Januari dan Januari tampak penuh hari
   * tanpa keterangan.
   */
  const tahun = [
    ...new Set(
      [from, to, lalu.dari, lalu.sampai].map((d) => Number(d.slice(0, 4))),
    ),
  ];

  const [libur, sejak, ember] = await Promise.all([
    Promise.all(tahun.map(holidaySet)).then(
      (s) => new Set(s.flatMap((x) => [...x])),
    ),
    mulaiCatat(),
    db
      .execute(emberSql(from, sampai))
      .then((r) => r.rows[0] as unknown as Ember),
  ]);

  /**
   * SATU kueri untuk lima panel.
   *
   * Rekap per (tanggal × divisi) adalah butiran terkecil yang dibutuhkan halaman
   * ini; ringkasan, komposisi, tren harian, per hari dalam seminggu, dan tabel per
   * divisi semuanya penjumlahan dari baris yang sama (lihat agregat.ts). Lima
   * kueri terpisah akan lebih mahal DAN bisa saling tidak cocok.
   */
  const [barisRaw, lalunya] = await Promise.all([
    db.execute(
      rekapSql({
        sejak,
        dari: from,
        sampai,
        hariIni: today,
        libur,
        pilih: sql`hk.d::text as date, ${employees.division} as division`,
        groupBy: sql`hk.d, ${employees.division}`,
        where: eq(employees.active, true),
        orderBy: sql`hk.d asc`,
      }),
    ),
    db.execute(
      rekapSql({
        sejak,
        dari: lalu.dari,
        sampai: lalu.sampai < today ? lalu.sampai : today,
        hariIni: today,
        libur,
        pilih: sql`1 as satu`,
        groupBy: sql`1`,
        where: eq(employees.active, true),
      }),
    ),
  ]);

  const baris = barisRaw.rows as unknown as BarisRekap[];
  const total = ringkas(baris);
  const sebelumnya = (lalunya.rows[0] as unknown as RekapBaris | undefined) ?? {
    hadir: 0,
    telat: 0,
    cuti: 0,
    alpa: 0,
    hari: 0,
  };
  // penyebut persentase: hari yang sudah dinilai, bukan seluruh hari kerja — hari
  // ini yang belum diabsen belum jadi jawaban apa pun
  const nilaiTotal = dinilai(total);
  const nilaiLalu = dinilai(sebelumnya);
  const rekapDivisi = perDivisi(baris);
  const titikTren = tren(baris, from, sampai);
  const batang = perHari(baris);

  const KOMPOSISI: IrisanDonut[] = [
    {
      key: "hadir",
      label: "Hadir & WFH",
      value: total.hadir,
      color: "var(--success)",
    },
    {
      key: "telat",
      label: "Terlambat",
      value: total.telat,
      color: "var(--warning)",
    },
    {
      key: "cuti",
      label: "Cuti / Izin / Sakit",
      value: total.cuti,
      color: "var(--subtle)",
    },
    {
      key: "alpa",
      label: "Tanpa Keterangan",
      value: total.alpa,
      color: "var(--danger)",
    },
  ];

  const RINGKAS = [
    {
      label: "Hadir",
      pct: persen(total.hadir, nilaiTotal),
      lalu: persen(sebelumnya.hadir, nilaiLalu),
      tone: "success",
    },
    {
      label: "Terlambat",
      pct: persen(total.telat, nilaiTotal),
      lalu: persen(sebelumnya.telat, nilaiLalu),
      tone: "warning",
    },
    {
      label: "Cuti / Izin / Sakit",
      pct: persen(total.cuti, nilaiTotal),
      lalu: persen(sebelumnya.cuti, nilaiLalu),
      tone: "neutral",
    },
    {
      label: "Tanpa Keterangan",
      pct: persen(total.alpa, nilaiTotal),
      lalu: persen(sebelumnya.alpa, nilaiLalu),
      tone: "danger",
    },
  ] as const;

  const totalTelat = EMBER.reduce((s, e) => s + (ember?.[e.key] ?? 0), 0);
  const irisanEmber: IrisanDonut[] = EMBER.map((e) => ({
    key: e.key,
    label: e.label,
    value: ember?.[e.key] ?? 0,
    color: e.color,
  }));

  const periodLabel = `${namaBulan(Number(from.slice(5, 7)) - 1)} ${from.slice(0, 4)}`;
  const q = `from=${from}&to=${to}`;
  const nihil = "—";

  return (
    <>
      <PageHead
        title="Laporan"
        desc={`Periode ${periodLabel} · ${labelRentang(from, to)}`}
      >
        <form className="flex items-end gap-2">
          <div>
            <label
              htmlFor="periode"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Periode
            </label>
            {/* satu kontrol, bukan dua: "Dari" dan "Sampai" yang terpisah membuat
                rentang bulan lalu jadi empat ketukan dan dua kali muat halaman */}
            <DateRangeField id="periode" from={from} to={to} today={today} />
          </div>
        </form>
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ringkasan Kehadiran">
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {RINGKAS.map((k) => (
              <KartuRingkas key={k.label} {...k} />
            ))}
          </div>
        </Panel>

        <Panel title="Tingkat Kehadiran per Divisi">
          <div className="flex flex-wrap items-center gap-5 p-4 sm:flex-nowrap">
            <div className="w-[188px] shrink-0">
              <Donut
                data={KOMPOSISI}
                pusat={tingkat(total) === null ? nihil : `${tingkat(total)}%`}
                pusatLabel="Tingkat Kehadiran"
              />
            </div>
            {/* tabel, bukan daftar: tiga kolom sejajar yang dibaca ke bawah adalah
                tabel, dan pembaca layar berhak tahu itu */}
            <table className="min-w-[210px] flex-1 text-left">
              <thead>
                <tr className="text-subtle text-[11px]">
                  <th className="pb-1.5 font-medium" />
                  <th className="pb-1.5 text-right font-medium">Persentase</th>
                  <th className="pb-1.5 text-right font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {KOMPOSISI.map((k) => (
                  <tr key={k.key}>
                    <td className="py-[5px] text-[12.5px]">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: k.color }}
                          aria-hidden
                        />
                        {k.label}
                      </span>
                    </td>
                    <td className="tnum py-[5px] text-right text-[12.5px] font-medium">
                      {persen(k.value, nilaiTotal) ?? nihil}
                      {persen(k.value, nilaiTotal) === null ? "" : "%"}
                    </td>
                    <td className="tnum text-muted-foreground py-[5px] text-right text-[12.5px]">
                      {k.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Tren Kehadiran">
          <div className="p-4">
            <div className="text-muted-foreground mb-2 flex flex-wrap gap-4 text-[11.5px]">
              {[
                ["var(--success)", "Hadir"],
                ["var(--warning)", "Terlambat"],
                ["var(--danger)", "Tanpa Keterangan"],
              ].map(([warna, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: warna }}
                    aria-hidden
                  />
                  {label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <TrenGaris data={titikTren} />
              </div>
              {/* rata-rata periode, bukan rata-rata titik: penyebutnya seluruh
                  hari kerja, jadi angkanya sama dengan kartu ringkasan di atas */}
              <dl className="w-full shrink-0 rounded-[11px] border p-3 sm:w-[168px]">
                <dt className="text-subtle mb-2 text-[11.5px]">
                  Rata-rata periode ini
                </dt>
                {[
                  ["Hadir", persen(total.hadir, nilaiTotal), "text-success"],
                  [
                    "Terlambat",
                    persen(total.telat, nilaiTotal),
                    "text-warning",
                  ],
                  [
                    "Tanpa Keterangan",
                    persen(total.alpa, nilaiTotal),
                    "text-danger",
                  ],
                ].map(([label, nilai, warna]) => (
                  <dd
                    key={String(label)}
                    className="mb-1.5 flex items-baseline gap-1.5 last:mb-0"
                  >
                    <span
                      className={cn(
                        "tnum text-[15px] font-bold",
                        warna as string,
                      )}
                    >
                      {nilai === null ? nihil : `${nilai}%`}
                    </span>
                    <span className="text-muted-foreground text-[11.5px]">
                      {label}
                    </span>
                  </dd>
                ))}
              </dl>
            </div>
          </div>
        </Panel>

        <Panel title="Kehadiran per Hari dalam Seminggu">
          <div className="p-4">
            <BarPerHari data={batang} />
            {batang.some((b) => b.pct === null) && (
              <p className="text-subtle mt-1 text-[11px]">
                Hari tanpa batang bukan hari kerja divisi mana pun pada periode
                ini.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Rekap Kehadiran">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="text-subtle bg-surface-2 border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                  <th className="px-4 py-2.5 font-semibold">Divisi</th>
                  <th className="px-3 py-2.5 font-semibold">Hadir</th>
                  <th className="px-3 py-2.5 font-semibold">Terlambat</th>
                  <th className="px-3 py-2.5 font-semibold">Cuti/Izin/Sakit</th>
                  <th className="px-3 py-2.5 font-semibold">
                    Tanpa Keterangan
                  </th>
                  <th className="px-4 py-2.5 font-semibold">
                    Tingkat Kehadiran
                  </th>
                </tr>
              </thead>
              <tbody>
                {rekapDivisi.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted-foreground px-4 py-10 text-center text-[13px]"
                    >
                      Belum ada data kehadiran pada periode ini.
                    </td>
                  </tr>
                )}
                {rekapDivisi.map((d) => (
                  <tr
                    key={d.division ?? "-"}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-2.5 text-[12.5px] font-medium">
                      {d.division ?? "Tanpa divisi"}
                    </td>
                    <SelKira
                      nilai={d.hadir}
                      dari={d.dinilai}
                      className="text-success"
                    />
                    <SelKira
                      nilai={d.telat}
                      dari={d.dinilai}
                      className="text-warning"
                    />
                    <SelKira
                      nilai={d.cuti}
                      dari={d.dinilai}
                      className="text-muted-foreground"
                    />
                    <SelKira
                      nilai={d.alpa}
                      dari={d.dinilai}
                      className="text-danger"
                    />
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        {/* pola bar in-table yang sama dengan papan /kehadiran */}
                        <span
                          className="bg-muted h-1.5 w-full max-w-[110px] overflow-hidden rounded-full"
                          role="img"
                          aria-label={`Tingkat kehadiran ${d.pct ?? 0}%`}
                        >
                          <span
                            className="bg-success block h-full rounded-full"
                            style={{ width: `${d.pct ?? 0}%` }}
                          />
                        </span>
                        <span className="tnum text-[12.5px] font-medium">
                          {d.pct === null ? nihil : `${d.pct}%`}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Distribusi Keterlambatan">
          <div className="p-4">
            <p className="text-muted-foreground -mt-1 mb-3 text-[11.5px]">
              Jumlah keterlambatan berdasarkan durasi melewati batas toleransi
            </p>
            <div className="flex flex-wrap items-center gap-5 sm:flex-nowrap">
              <div className="w-[172px] shrink-0">
                <Donut
                  data={irisanEmber}
                  pusat={String(totalTelat)}
                  pusatLabel="Total"
                />
              </div>
              <ul className="min-w-[176px] flex-1">
                {irisanEmber.map((e) => (
                  <li
                    key={e.key}
                    className="flex items-center justify-between gap-3 py-[5px] text-[12.5px]"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: e.color }}
                        aria-hidden
                      />
                      {e.label}
                    </span>
                    <span className="tnum shrink-0 font-medium">
                      {e.value}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        ({persen(e.value, totalTelat) ?? 0}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Laporan Siap Unduh" className="mt-4">
        <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {REPORTS.map((r) => (
            <div key={r.key}>
              <h3 className="text-[13px] font-semibold">{r.label}</h3>
              <p className="text-muted-foreground mt-1 mb-3 text-[11.5px] leading-relaxed">
                {r.desc}
              </p>
              <Link
                href={`/api/export/${r.key}?${q}`}
                className="bg-surface-2 border-border-strong hover:bg-accent inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-medium transition-colors"
              >
                <Download className="size-3.5" aria-hidden />
                Unduh CSV
              </Link>
            </div>
          ))}
        </div>
        <p className="text-subtle border-t px-4 py-3 text-[11.5px]">
          Ekspor dalam format CSV (UTF-8 BOM) — terbuka langsung di Excel dan
          Google Sheets. Ekspor PDF menyusul pada fase berikutnya.
        </p>
      </Panel>
    </>
  );
}

/** Sel "48 (88%)" — jumlah dulu, persennya konteks. */
function SelKira({
  nilai,
  dari,
  className,
}: {
  nilai: number;
  dari: number;
  className?: string;
}) {
  const p = persen(nilai, dari);
  return (
    <td className={cn("tnum px-3 py-2.5 text-[12.5px]", className)}>
      {nilai}
      <span className="text-subtle font-normal"> ({p ?? 0}%)</span>
    </td>
  );
}

const TONA = {
  success: { kotak: "bg-success-subtle", angka: "text-success" },
  warning: { kotak: "bg-warning-subtle", angka: "text-warning" },
  neutral: { kotak: "bg-muted", angka: "text-foreground" },
  danger: { kotak: "bg-danger-subtle", angka: "text-danger" },
} as const;

/**
 * Kartu KPI bertona dengan baris "dari periode lalu".
 *
 * Bukan `Stat` dari bits.tsx: yang itu kartu putih bertitik dengan `sub` berupa
 * teks statis, dan tujuh belas pemakainya tidak butuh delta. Satu pemakai, jadi
 * tinggal di sini.
 *
 * Warna deltanya mengikuti tona kartunya, bukan baik/buruk: "terlambat turun 1%"
 * hijau di sebelah "hadir naik 4%" hijau membuat dua hal berbeda terlihat sama.
 */
function KartuRingkas({
  label,
  pct,
  lalu,
  tone,
}: {
  label: string;
  pct: number | null;
  lalu: number | null;
  tone: keyof typeof TONA;
}) {
  const t = TONA[tone];
  const d = delta(pct, lalu);
  const Arah = d !== null && d < 0 ? ArrowDown : ArrowUp;

  return (
    <div className={cn("rounded-[11px] p-3.5", t.kotak)}>
      <p
        className={cn(
          "tnum text-[24px] leading-none font-bold tracking-tight",
          t.angka,
        )}
      >
        {pct === null ? "—" : `${pct}%`}
      </p>
      <p className="text-muted-foreground mt-1.5 text-[12px] font-medium">
        {label}
      </p>
      <p className="text-muted-foreground mt-2 flex items-center gap-1 text-[11px]">
        {d === null || d === 0 ? (
          // periode lalu tanpa hari kerja tidak boleh terbaca "turun 86%"
          <span>
            {d === 0 ? "sama dengan periode lalu" : "tanpa pembanding"}
          </span>
        ) : (
          <>
            <Arah className={cn("size-3 shrink-0", t.angka)} aria-hidden />
            <span className={cn("tnum font-medium", t.angka)}>
              {Math.abs(d)}%
            </span>
            dari periode lalu
          </>
        )}
      </p>
    </div>
  );
}
