import { count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db";
import { employees, leaveRequests, settings } from "@/db/schema";
import { PageHead } from "@/components/bits";
import { BalancePanel } from "./balance-panel";
import { LeaveQueue, type LeaveRow } from "./queue";
import { todayWib } from "@/lib/hr";
import { leaveBalances, withRemaining } from "@/lib/leave";
import { FEED_PAGE } from "@/lib/paging";
import { cn } from "@/lib/utils";

const TABS = [
  { v: "menunggu", label: "Menunggu" },
  /** waiting on the employee, not on HR — visible so a revision cannot be
   *  forgotten by both sides at once */
  { v: "revisi", label: "Perlu revisi" },
  { v: "disetujui", label: "Disetujui" },
  { v: "ditolak", label: "Ditolak" },
] as const;

export default async function CutiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.v === sp.tab)?.v ?? "menunggu") as
    | "menunggu"
    | "revisi"
    | "disetujui"
    | "ditolak";
  const today = todayWib();
  const year = Number(today.slice(0, 4));

  const [cfg] = await db.select().from(settings).limit(1);

  // page 1 of both feeds is rendered here; LeaveQueue/BalancePanel take over after
  const [rows, tabCounts, balances, [activeStaff]] = await Promise.all([
    fetchLeavePage(tab, year),
    db
      .select({ status: leaveRequests.status, n: count() })
      .from(leaveRequests)
      .groupBy(leaveRequests.status),
    leaveBalances(year, undefined, { limit: FEED_PAGE, offset: 0 }),
    db.select({ n: count() }).from(employees).where(eq(employees.active, true)),
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

          {/* key resets the feed when the status tab changes */}
          <LeaveQueue
            key={tab}
            status={tab}
            initial={rows}
            initialHasMore={countOf(tab) > rows.length}
          />
        </div>

        <BalancePanel
          year={year}
          initial={balances}
          initialHasMore={activeStaff.n > balances.length}
        />
      </div>
    </>
  );
}

async function fetchLeavePage(status: string, year: number): Promise<LeaveRow[]> {
  const delegate = alias(employees, "delegate");
  const rows = await db
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
      attachmentKey: leaveRequests.attachmentKey,
      attachmentName: leaveRequests.attachmentName,
      attachmentSize: leaveRequests.attachmentSize,
      name: employees.name,
      division: employees.division,
      employeeId: employees.id,
      delegateName: delegate.name,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
    .where(eq(leaveRequests.status, status as "menunggu"))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(FEED_PAGE);

  return withRemaining(
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    year,
  );
}
