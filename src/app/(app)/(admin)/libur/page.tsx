import { and, asc, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, Stat } from "@/components/bits";
import { HolidayTools, DeleteHoliday } from "./libur-form";
import { tanggalPanjang, todayWib } from "@/lib/hr";
import { cn } from "@/lib/utils";

const isWeekend = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

export default async function LiburPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const thisYear = Number(todayWib().slice(0, 4));
  const parsed = Number(sp.year);
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : thisYear;

  const rows = await db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)))
    .orderBy(asc(holidays.date));

  // Weekend holidays cost nothing — they were not working days to begin with.
  const weekdays = rows.filter((r) => !isWeekend(r.date));
  const collective = weekdays.filter((r) => r.collective);

  return (
    <>
      <PageHead
        title="Hari Libur & Cuti Bersama"
        desc={`Dasar perhitungan hari kerja cuti. Cuti bersama memotong saldo cuti tahunan.`}
      >
        <div className="flex items-end gap-2">
          {[year - 1, year, year + 1].map((y) => (
            <Link
              key={y}
              href={`/libur?year=${y}`}
              className={cn(
                "tnum h-9 rounded-[9px] border px-3 text-[13px] font-medium leading-9 transition-colors",
                y === year
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card border-border-strong hover:bg-accent",
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      </PageHead>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={`Hari libur ${year}`} value={rows.length} sub="tanggal" />
        <Stat
          label="Jatuh di hari kerja"
          value={weekdays.length}
          sub="hari kerja hilang"
          tone="info"
        />
        <Stat
          label="Cuti bersama"
          value={collective.length}
          sub="hari dipotong dari saldo"
          tone={collective.length > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Panel title={`Kalender ${year}`} className="min-w-0 flex-1 basis-[520px]">
          {rows.length === 0 ? (
            <Empty>Belum ada hari libur untuk {year}. Tambah manual atau import CSV.</Empty>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.date} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.name}</span>
                    <span className="text-subtle text-[11.5px]">
                      {tanggalPanjang(r.date)}
                      {isWeekend(r.date) && " · akhir pekan"}
                    </span>
                  </span>
                  <Pill tone={r.collective ? "warning" : "neutral"}>
                    {r.collective ? "Cuti bersama" : "Libur nasional"}
                  </Pill>
                  <DeleteHoliday date={r.date} name={r.name} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <HolidayTools year={year} />
      </div>
    </>
  );
}
