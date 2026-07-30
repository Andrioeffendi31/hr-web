import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { PageHead, Panel } from "@/components/bits";
import { namaBulan, todayWib } from "@/lib/hr";
import { cn } from "@/lib/utils";

const REPORTS = [
  { key: "kehadiran", label: "Rekap kehadiran", desc: "Masuk, keluar, dan status harian per karyawan" },
  { key: "keterlambatan", label: "Rekap keterlambatan", desc: "Jumlah dan menit keterlambatan per karyawan" },
  { key: "cuti", label: "Rekap cuti & izin", desc: "Pengajuan, durasi, dan saldo terpakai" },
  { key: "lembur", label: "Rekap lembur", desc: "Jam lembur dan estimasi biaya per karyawan" },
  { key: "divisi", label: "Absensi per divisi", desc: "Tingkat kehadiran agregat tiap divisi" },
  { key: "karyawan", label: "Daftar karyawan aktif", desc: "Data kepegawaian siap audit" },
] as const;

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayWib();
  const from = sp.from ?? `${today.slice(0, 7)}-01`;
  const to = sp.to ?? today;

  const byDivision = await db
    .select({
      division: employees.division,
      hadir: sql<number>`count(*) filter (where ${attendance.status} in ('hadir','wfh'))`.mapWith(Number),
      telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
      cuti: sql<number>`count(*) filter (where ${attendance.status} in ('cuti','izin','sakit'))`.mapWith(Number),
      absen: sql<number>`count(*) filter (where ${attendance.status} = 'belum_absen')`.mapWith(Number),
      hari: sql<number>`count(${attendance.id})`.mapWith(Number),
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(
        eq(attendance.employeeId, employees.id),
        gte(attendance.date, from),
        lte(attendance.date, to),
      ),
    )
    .where(eq(employees.active, true))
    .groupBy(employees.division)
    .orderBy(asc(employees.division));

  const periodLabel = `${namaBulan(Number(from.slice(5, 7)) - 1)} ${from.slice(0, 4)}`;
  const q = `from=${from}&to=${to}`;

  return (
    <>
      <PageHead title="Laporan" desc={`Periode ${periodLabel} · ${from} s/d ${to}`}>
        <form className="flex items-end gap-2">
          <div>
            <label
              htmlFor="from"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Dari
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={from}
              className="bg-card border-border-strong tnum h-9 rounded-[9px] border px-2.5 text-[13px]"
            />
          </div>
          <div>
            <label
              htmlFor="to"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Sampai
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={to}
              className="bg-card border-border-strong tnum h-9 rounded-[9px] border px-2.5 text-[13px]"
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-[9px] px-3.5 text-[13px] font-medium transition-colors"
          >
            Terapkan
          </button>
        </form>
      </PageHead>

      <Panel title="Tingkat kehadiran per divisi" className="mb-4">
        <div className="p-4">
          {/* Horizontal stacked bars — a table is the accessible fallback below. */}
          <ul className="flex flex-col gap-3">
            {byDivision.map((d) => {
              const total = d.hari || 1;
              const pct = (n: number) => (n / total) * 100;
              return (
                <li key={d.division}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-medium">{d.division}</span>
                    <span className="tnum text-muted-foreground text-[11.5px]">
                      {Math.round(pct(d.hadir + d.telat))}% hadir
                    </span>
                  </div>
                  {/* Four segments, not three — cuti/izin/sakit is its own bucket so
                      the red segment means "tidak absen" and nothing else. */}
                  <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                    <div className="bg-success h-full" style={{ width: `${pct(d.hadir)}%` }} />
                    <div className="bg-warning h-full" style={{ width: `${pct(d.telat)}%` }} />
                    <div className="bg-subtle h-full" style={{ width: `${pct(d.cuti)}%` }} />
                    <div className="bg-danger h-full" style={{ width: `${pct(d.absen)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="text-muted-foreground mt-4 flex flex-wrap gap-4 text-[11.5px]">
            {[
              ["bg-success", "Hadir & WFH"],
              ["bg-warning", "Terlambat"],
              ["bg-subtle", "Cuti / izin / sakit"],
              ["bg-danger", "Tidak absen"],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", cls)} aria-hidden />
                {label}
              </span>
            ))}
          </div>

          <table className="mt-5 w-full text-left">
            <caption className="text-subtle mb-2 text-left text-[11.5px]">
              Data yang sama dalam bentuk tabel.
            </caption>
            <thead>
              <tr className="text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                <th className="py-2 font-semibold">Divisi</th>
                <th className="py-2 font-semibold">Hadir</th>
                <th className="py-2 font-semibold">Telat</th>
                <th className="py-2 font-semibold">Cuti/izin</th>
                <th className="py-2 font-semibold">Absen</th>
              </tr>
            </thead>
            <tbody>
              {byDivision.map((d) => (
                <tr key={d.division} className="border-b last:border-0">
                  <td className="py-2 text-[12.5px]">{d.division}</td>
                  <td className="tnum text-success py-2 text-[12.5px]">{d.hadir}</td>
                  <td className="tnum text-warning py-2 text-[12.5px]">{d.telat}</td>
                  <td className="tnum text-muted-foreground py-2 text-[12.5px]">{d.cuti}</td>
                  <td className="tnum text-danger py-2 text-[12.5px]">{d.absen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.key} className="bg-card rounded-xl border p-4 shadow-sm">
            <h3 className="text-[13.5px] font-semibold">{r.label}</h3>
            <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
              {r.desc}
            </p>
            <Link
              href={`/api/export/${r.key}?${q}`}
              className="bg-surface-2 border-border-strong hover:bg-accent mt-3 inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-medium transition-colors"
            >
              <FileSpreadsheet className="size-4" aria-hidden />
              Unduh CSV
            </Link>
          </div>
        ))}
      </div>

      <p className="text-subtle mt-4 text-[11.5px]">
        Ekspor dalam format CSV (UTF-8 BOM) — terbuka langsung di Excel dan Google
        Sheets. Ekspor PDF menyusul pada fase berikutnya.
      </p>
    </>
  );
}
