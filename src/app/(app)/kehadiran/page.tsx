import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { attendance, employees, settings } from "@/db/schema";
import { AttBadge, Empty, PageHead, Panel, Stat } from "@/components/bits";
import { RemindButton } from "./remind-button";
import {
  type AttStatus,
  initials,
  jam,
  statusGroup,
  tanggalPanjang,
  todayWib,
} from "@/lib/hr";
import { cn } from "@/lib/utils";

type Search = {
  date?: string;
  tab?: "today" | "recap";
  div?: string;
  status?: string;
};

// Status filtering is driven by the stat cards above the table — they double as
// the filter control, so there's no separate status <select>.
function href(base: Search, patch: Search) {
  const p = new URLSearchParams();
  const merged = { ...base, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
  return `/kehadiran${p.size ? `?${p}` : ""}`;
}

export default async function KehadiranPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? todayWib();
  const tab = sp.tab === "recap" ? "recap" : "today";
  const divFilter = sp.div ?? "all";
  const statusFilter = sp.status ?? "all";
  const monthStart = `${date.slice(0, 7)}-01`;

  const [cfg] = await db.select().from(settings).limit(1);

  const divisions = await db
    .selectDistinct({ division: employees.division })
    .from(employees)
    .orderBy(asc(employees.division));

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      nik: employees.nik,
      division: employees.division,
      status: attendance.status,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      location: attendance.location,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
    )
    .where(
      and(
        eq(employees.active, true),
        divFilter === "all" ? undefined : eq(employees.division, divFilter),
      ),
    )
    .orderBy(asc(employees.name));

  const all = rows.map((r) => ({
    ...r,
    status: (r.status ?? "belum_absen") as AttStatus,
  }));

  const counts = {
    total: all.length,
    hadir: all.filter((r) => statusGroup(r.status) === "hadir").length,
    telat: all.filter((r) => statusGroup(r.status) === "telat").length,
    cuti: all.filter((r) => statusGroup(r.status) === "cuti").length,
    belum: all.filter((r) => statusGroup(r.status) === "belum").length,
  };

  const visible =
    statusFilter === "all"
      ? all
      : all.filter((r) => statusGroup(r.status) === statusFilter);

  const absentees = all.filter((r) => r.status === "belum_absen");
  const onLeave = all.filter((r) => statusGroup(r.status) === "cuti");

  // Monthly recap — aggregated in SQL so the page stays fast at scale (PRD §9)
  const recap =
    tab === "recap"
      ? await db
          .select({
            id: employees.id,
            name: employees.name,
            division: employees.division,
            hadir: sql<number>`count(*) filter (where ${attendance.status} in ('hadir','wfh'))`.mapWith(Number),
            telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
            cuti: sql<number>`count(*) filter (where ${attendance.status} in ('cuti','izin','sakit'))`.mapWith(Number),
            absen: sql<number>`count(*) filter (where ${attendance.status} = 'belum_absen')`.mapWith(Number),
            hari: sql<number>`count(*)`.mapWith(Number),
          })
          .from(employees)
          .leftJoin(
            attendance,
            and(
              eq(attendance.employeeId, employees.id),
              gte(attendance.date, monthStart),
              lte(attendance.date, date),
            ),
          )
          .where(
            and(
              eq(employees.active, true),
              divFilter === "all" ? undefined : eq(employees.division, divFilter),
            ),
          )
          .groupBy(employees.id, employees.name, employees.division)
          .orderBy(asc(employees.name))
      : [];

  const base: Search = { date, tab, div: divFilter, status: statusFilter };

  return (
    <>
      <PageHead
        title="Kehadiran Karyawan"
        desc={`${tanggalPanjang(date)} · shift ${jam(cfg.shiftStart)}–${jam(cfg.shiftEnd)} · toleransi ${cfg.lateToleranceMinutes} menit`}
      >
        <form className="flex items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          {divFilter !== "all" && <input type="hidden" name="div" value={divFilter} />}
          <div>
            <label
              htmlFor="tanggal"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Tanggal
            </label>
            <input
              id="tanggal"
              type="date"
              name="date"
              defaultValue={date}
              className="bg-card border-border-strong tnum h-9 rounded-[9px] border px-2.5 text-[13px]"
            />
          </div>
          <button
            type="submit"
            className="bg-card border-border-strong hover:bg-accent h-9 rounded-[9px] border px-3.5 text-[13px] font-medium transition-colors"
          >
            Terapkan
          </button>
          <a
            href={`/api/export/kehadiran?date=${date}&div=${divFilter}`}
            className="bg-card border-border-strong hover:bg-accent flex h-9 items-center rounded-[9px] border px-3.5 text-[13px] font-medium transition-colors"
          >
            Ekspor
          </a>
        </form>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Total karyawan"
          value={counts.total}
          sub="aktif"
          href={href(base, { status: "all" })}
          active={statusFilter === "all"}
        />
        <Stat
          label="Hadir"
          value={counts.hadir}
          sub="termasuk WFH"
          tone="success"
          href={href(base, { status: "hadir" })}
          active={statusFilter === "hadir"}
        />
        <Stat
          label="Terlambat"
          value={counts.telat}
          sub="lewat toleransi"
          tone="warning"
          href={href(base, { status: "telat" })}
          active={statusFilter === "telat"}
        />
        <Stat
          label="Cuti / izin / sakit"
          value={counts.cuti}
          sub="disetujui"
          href={href(base, { status: "cuti" })}
          active={statusFilter === "cuti"}
        />
        <Stat
          label="Belum absen"
          value={counts.belum}
          sub="perlu diingatkan"
          tone="danger"
          href={href(base, { status: "belum" })}
          active={statusFilter === "belum"}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Panel className="min-w-0 flex-1 basis-[560px]">
          <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
            <div className="bg-muted flex gap-0.5 rounded-[9px] p-[3px]">
              {(
                [
                  ["today", "Papan hari ini"],
                  ["recap", "Rekap bulanan"],
                ] as const
              ).map(([v, label]) => (
                <Link
                  key={v}
                  href={href(base, { tab: v })}
                  className={cn(
                    "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    tab === v
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form className="ml-auto flex items-center gap-2">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="status" value={statusFilter} />
              <label htmlFor="div" className="sr-only">
                Filter divisi
              </label>
              <select
                id="div"
                name="div"
                defaultValue={divFilter}
                className="bg-surface-2 h-8 rounded-lg border px-2 text-[12.5px]"
              >
                <option value="all">Semua divisi</option>
                {divisions.map((d) => (
                  <option key={d.division} value={d.division}>
                    {d.division}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-surface-2 hover:bg-accent h-8 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors"
              >
                Filter
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            {tab === "today" ? (
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                    <th className="px-4 py-2.5 font-semibold">Karyawan</th>
                    <th className="px-3 py-2.5 font-semibold">Divisi</th>
                    <th className="px-3 py-2.5 font-semibold">Masuk</th>
                    <th className="px-3 py-2.5 font-semibold">Keluar</th>
                    <th className="px-3 py-2.5 font-semibold">Lokasi</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2 border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/karyawan?open=${r.id}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
                            {initials(r.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">
                              {r.name}
                            </span>
                            <span className="text-subtle tnum block text-[11px]">
                              {r.nik}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-3 py-2.5 text-[12.5px]">
                        {r.division}
                      </td>
                      <td className="tnum px-3 py-2.5 text-[12.5px]">{jam(r.clockIn)}</td>
                      <td className="tnum px-3 py-2.5 text-[12.5px]">{jam(r.clockOut)}</td>
                      <td className="text-muted-foreground px-3 py-2.5 text-[12.5px]">
                        {r.location ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{r.location}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <AttBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                    <th className="px-4 py-2.5 font-semibold">Karyawan</th>
                    <th className="px-3 py-2.5 font-semibold">Hadir</th>
                    <th className="px-3 py-2.5 font-semibold">Telat</th>
                    <th className="px-3 py-2.5 font-semibold">Cuti</th>
                    <th className="px-3 py-2.5 font-semibold">Absen</th>
                    <th className="px-4 py-2.5 font-semibold">Tingkat kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.map((r) => {
                    const pct = r.hari
                      ? Math.round(((r.hadir + r.telat) / r.hari) * 100)
                      : 0;
                    return (
                      <tr key={r.id} className="hover:bg-surface-2 border-b last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="block text-[13px] font-medium">{r.name}</span>
                          <span className="text-subtle block text-[11px]">
                            {r.division}
                          </span>
                        </td>
                        <td className="tnum text-success px-3 py-2.5 text-[13px]">
                          {r.hadir}
                        </td>
                        <td className="tnum text-warning px-3 py-2.5 text-[13px]">
                          {r.telat}
                        </td>
                        <td className="tnum text-muted-foreground px-3 py-2.5 text-[13px]">
                          {r.cuti}
                        </td>
                        <td className="tnum text-danger px-3 py-2.5 text-[13px]">
                          {r.absen}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="bg-muted h-1.5 w-full max-w-[120px] overflow-hidden rounded-full"
                              role="img"
                              aria-label={`Tingkat kehadiran ${pct} persen`}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  pct >= 95
                                    ? "bg-success"
                                    : pct >= 85
                                      ? "bg-warning"
                                      : "bg-danger",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="tnum text-[12.5px] font-semibold">
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {(tab === "today" ? visible : recap).length === 0 && (
              <Empty>Tidak ada data untuk filter ini.</Empty>
            )}
          </div>
        </Panel>

        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[290px]">
          <Panel
            title={`Belum absen masuk (${absentees.length})`}
            action={
              absentees.length > 0 && (
                <RemindButton
                  ids={absentees.map((a) => a.id)}
                  date={date}
                  label="Ingatkan semua"
                />
              )
            }
          >
            {absentees.length === 0 ? (
              <Empty>Semua karyawan sudah absen masuk.</Empty>
            ) : (
              <ul className="divide-y">
                {absentees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="bg-danger-subtle text-danger flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
                      {initials(a.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {a.name}
                      </span>
                      <span className="text-subtle block text-[11px]">{a.division}</span>
                    </span>
                    <RemindButton ids={[a.id]} date={date} label="Ingatkan" compact />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Sedang cuti / izin (${onLeave.length})`}>
            {onLeave.length === 0 ? (
              <Empty>Tidak ada yang cuti hari ini.</Empty>
            ) : (
              <ul className="divide-y">
                {onLeave.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {a.name}
                      </span>
                      <span className="text-subtle block truncate text-[11px]">
                        {a.location ?? a.division}
                      </span>
                    </span>
                    <AttBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

