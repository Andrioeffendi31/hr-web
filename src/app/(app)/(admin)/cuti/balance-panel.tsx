"use client";

import { Panel } from "@/components/bits";
import { FeedFooter } from "@/components/feed-footer";
import { useInfiniteFeed } from "@/components/use-infinite-feed";
import { AdjustBalance } from "./adjust-balance";
import { cn } from "@/lib/utils";

export type Balance = {
  id: number;
  name: string;
  quota: number;
  adjustment: number;
  usedRequests: number;
  usedCollective: number;
  used: number;
  remaining: number;
};

export function BalancePanel({
  year,
  initial,
  initialHasMore,
}: {
  year: number;
  initial: Balance[];
  initialHasMore: boolean;
}) {
  const { items, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteFeed<Balance>({
      kind: "saldo",
      params: { year: String(year) },
      initial,
      initialHasMore,
    });

  return (
    <Panel
      title={`Saldo cuti tahunan ${year}`}
      className="w-full shrink-0 lg:w-[320px]"
    >
      <ul className="divide-y">
        {items.map((b) => {
          const quota = b.quota + b.adjustment;
          const pct = Math.min(
            100,
            Math.round((b.used / Math.max(quota, 1)) * 100),
          );
          return (
            <li key={b.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium">
                  {b.name}
                </span>
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
                    pct >= 90
                      ? "bg-danger"
                      : pct >= 60
                        ? "bg-warning"
                        : "bg-primary",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-subtle mt-1 text-[10.5px]">
                kuota {b.quota}
                {b.adjustment !== 0 &&
                  ` ${b.adjustment > 0 ? "+" : "−"} koreksi ${Math.abs(b.adjustment)}`}{" "}
                · pengajuan {b.usedRequests}
                {b.usedCollective > 0 &&
                  ` · cuti bersama ${b.usedCollective}`}{" "}
                · sisa {b.remaining}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="px-4">
        <FeedFooter
          sentinelRef={sentinelRef}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
          endLabel="Semua karyawan ditampilkan."
        />
      </div>
    </Panel>
  );
}
