import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, overtimeRequests, settings } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, ReqBadge, Stat } from "@/components/bits";
import { DecideButtons } from "@/components/decide-buttons";
import {
  durasi,
  initials,
  jam,
  rupiah,
  rupiahShort,
  tanggalPendek,
  todayWib,
} from "@/lib/hr";

export default async function LemburPage() {
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [cfg] = await db.select().from(settings).limit(1);

  const [rows, pending, month] = await Promise.all([
    db
      .select({
        id: overtimeRequests.id,
        date: overtimeRequests.date,
        startTime: overtimeRequests.startTime,
        endTime: overtimeRequests.endTime,
        minutes: overtimeRequests.minutes,
        kind: overtimeRequests.kind,
        estimatedCost: overtimeRequests.estimatedCost,
        reason: overtimeRequests.reason,
        status: overtimeRequests.status,
        decisionNote: overtimeRequests.decisionNote,
        name: employees.name,
        employeeId: employees.id,
        division: employees.division,
      })
      .from(overtimeRequests)
      .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
      .orderBy(desc(overtimeRequests.date)),

    db
      .select({ n: count() })
      .from(overtimeRequests)
      .where(eq(overtimeRequests.status, "menunggu")),

    db
      .select({
        minutes: sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(Number),
        cost: sql<number>`coalesce(sum(${overtimeRequests.estimatedCost}), 0)`.mapWith(Number),
        people: sql<number>`count(distinct ${overtimeRequests.employeeId})`.mapWith(Number),
      })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.status, "disetujui"),
          gte(overtimeRequests.date, monthStart),
        ),
      ),
  ]);

  const hours = Math.round(month[0].minutes / 60);
  const budgetPct = cfg.monthlyOvertimeBudget
    ? Math.round((month[0].cost / cfg.monthlyOvertimeBudget) * 100)
    : 0;

  return (
    <>
      <PageHead
        title="Lembur"
        desc={`Tarif ${rupiah(cfg.overtimeRatePerHour)}/jam · hari libur ×${cfg.overtimeHolidayMultiplier} · batas ${cfg.weeklyOvertimeCapHours} jam/minggu`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Menunggu persetujuan"
          value={pending[0].n}
          sub="pengajuan"
          tone="warning"
        />
        <Stat
          label="Jam lembur bulan ini"
          value={hours}
          sub={`jam · ${month[0].people} karyawan`}
        />
        <Stat
          label="Estimasi biaya"
          value={rupiahShort(month[0].cost)}
          sub={`${budgetPct}% dari anggaran`}
          tone={budgetPct > 80 ? "danger" : "neutral"}
        />
      </div>

      <Panel title="Semua pengajuan lembur">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                <th className="px-4 py-2.5 font-semibold">Karyawan</th>
                <th className="px-3 py-2.5 font-semibold">Tanggal</th>
                <th className="px-3 py-2.5 font-semibold">Jam</th>
                <th className="px-3 py-2.5 font-semibold">Durasi</th>
                <th className="px-3 py-2.5 font-semibold">Tipe</th>
                <th className="px-3 py-2.5 font-semibold">Estimasi biaya</th>
                <th className="px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 border-b align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {r.name}
                        </span>
                        <span className="text-subtle block text-[11px]">
                          {r.division}
                        </span>
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1.5 max-w-[220px] text-[11.5px] leading-snug">
                      {r.reason}
                    </p>
                    {r.decisionNote && (
                      <p className="text-danger mt-1 max-w-[220px] text-[11.5px]">
                        {r.decisionNote}
                      </p>
                    )}
                  </td>
                  <td className="tnum px-3 py-3 text-[12.5px]">
                    {tanggalPendek(r.date)}
                  </td>
                  <td className="tnum px-3 py-3 text-[12.5px]">
                    {jam(r.startTime)}–{jam(r.endTime)}
                  </td>
                  <td className="tnum px-3 py-3 text-[12.5px] font-medium">
                    {durasi(r.minutes)}
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={r.kind === "Hari libur" ? "info" : "neutral"}>
                      {r.kind}
                    </Pill>
                  </td>
                  <td className="tnum px-3 py-3 text-[12.5px] font-medium">
                    {rupiah(r.estimatedCost)}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "menunggu" ? (
                      <DecideButtons kind="lembur" id={r.id} name={r.name} />
                    ) : (
                      <ReqBadge status={r.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Belum ada pengajuan lembur.</Empty>}
        </div>
      </Panel>
    </>
  );
}
