import { count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db";
import { employees, leaveRequests, settings } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, ReqBadge } from "@/components/bits";
import { DecideButtons } from "@/components/decide-buttons";
import { AdjustBalance } from "./adjust-balance";
import { deductsBalance, initials, rentangTanggal, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";
import { cn } from "@/lib/utils";

const TABS = [
  { v: "menunggu", label: "Menunggu" },
  { v: "disetujui", label: "Disetujui" },
  { v: "ditolak", label: "Ditolak" },
] as const;

const TYPE_TONE = {
  "Cuti Tahunan": "primary",
  "Cuti Sakit": "info",
  "Izin Khusus": "warning",
} as const;

export default async function CutiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.v === sp.tab)?.v ?? "menunggu") as
    | "menunggu"
    | "disetujui"
    | "ditolak";
  const today = todayWib();
  const year = Number(today.slice(0, 4));

  const [cfg] = await db.select().from(settings).limit(1);
  const delegate = alias(employees, "delegate");

  const [rows, tabCounts, balances] = await Promise.all([
    db
      .select({
        id: leaveRequests.id,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        decisionNote: leaveRequests.decisionNote,
        createdAt: leaveRequests.createdAt,
        name: employees.name,
        division: employees.division,
        joinedAt: employees.joinedAt,
        employeeId: employees.id,
        delegateName: delegate.name,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
      .where(eq(leaveRequests.status, tab))
      .orderBy(desc(leaveRequests.createdAt)),

    db
      .select({ status: leaveRequests.status, n: count() })
      .from(leaveRequests)
      .groupBy(leaveRequests.status),

    leaveBalances(year),
  ]);

  const countOf = (s: string) => tabCounts.find((c) => c.status === s)?.n ?? 0;

  return (
    <>
      <PageHead
        title="Cuti & Izin"
        desc={`Kuota dasar ${cfg.baseLeaveQuota} hari/tahun + 1 hari tiap 2 tahun masa kerja`}
      />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-[560px]">
          <div className="bg-muted mb-3 inline-flex gap-0.5 rounded-[9px] p-[3px]">
            {TABS.map((t) => (
              <Link
                key={t.v}
                href={t.v === "menunggu" ? "/cuti" : `/cuti?tab=${t.v}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  tab === t.v
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="tnum text-subtle text-[11px]">{countOf(t.v)}</span>
              </Link>
            ))}
          </div>

          {rows.length === 0 ? (
            <Panel>
              <Empty>Tidak ada pengajuan pada status ini.</Empty>
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((r) => {
                const remaining = balances.find((b) => b.id === r.employeeId)?.remaining;
                return (
                  <article
                    key={r.id}
                    className="bg-card rounded-[13px] border p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold">
                        {initials(r.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/karyawan?open=${r.employeeId}`}
                            className="text-[14px] font-semibold hover:underline"
                          >
                            {r.name}
                          </Link>
                          <Pill tone={TYPE_TONE[r.type]}>{r.type}</Pill>
                          <ReqBadge status={r.status} />
                        </div>
                        <p className="text-subtle mt-0.5 text-[11.5px]">
                          {r.division} · diajukan{" "}
                          {r.createdAt.toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            timeZone: "Asia/Jakarta",
                          })}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                      <div>
                        <dt className="text-subtle text-[11px]">Tanggal</dt>
                        <dd className="tnum text-[12.5px] font-medium">
                          {rentangTanggal(r.startDate, r.endDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-subtle text-[11px]">Durasi</dt>
                        <dd className="tnum text-[12.5px] font-medium">
                          {r.days} hari kerja
                        </dd>
                      </div>
                      <div>
                        <dt className="text-subtle text-[11px]">Sisa saldo</dt>
                        <dd className="tnum text-[12.5px] font-medium">
                          {deductsBalance(r.type)
                            ? `${remaining ?? "—"} hari`
                            : "tidak dipotong"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-subtle text-[11px]">Pengganti</dt>
                        <dd className="truncate text-[12.5px] font-medium">
                          {r.delegateName ?? "—"}
                        </dd>
                      </div>
                    </dl>

                    <p className="text-muted-foreground bg-surface-2 mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed">
                      {r.reason}
                    </p>

                    {r.decisionNote && (
                      <p className="text-danger bg-danger-subtle mt-2 rounded-lg px-3 py-2 text-[12.5px]">
                        Catatan HR: {r.decisionNote}
                      </p>
                    )}

                    {r.status === "menunggu" && (
                      <div className="mt-3">
                        <DecideButtons kind="cuti" id={r.id} name={r.name} allowRevision />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <Panel
          title={`Saldo cuti tahunan ${year}`}
          className="w-full shrink-0 lg:w-[320px]"
        >
          <ul className="divide-y">
            {balances.map((b) => {
              const quota = b.quota + b.adjustment;
              const pct = Math.min(100, Math.round((b.used / Math.max(quota, 1)) * 100));
              return (
                <li key={b.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium">{b.name}</span>
                    <span className="tnum text-subtle text-[11.5px]">
                      {b.used}/{quota}
                    </span>
                    <AdjustBalance
                      employeeId={b.id}
                      name={b.name}
                      year={year}
                      days={b.adjustment}
                    />
                  </div>
                  <div
                    className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
                    role="img"
                    aria-label={`${b.used} dari ${quota} hari terpakai`}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-subtle mt-1 text-[10.5px]">
                    kuota {b.quota}
                    {b.adjustment !== 0 &&
                      ` ${b.adjustment > 0 ? "+" : "−"} koreksi ${Math.abs(b.adjustment)}`}{" "}
                    · pengajuan {b.usedRequests}
                    {b.usedCollective > 0 && ` · cuti bersama ${b.usedCollective}`} · sisa{" "}
                    {b.remaining}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}

