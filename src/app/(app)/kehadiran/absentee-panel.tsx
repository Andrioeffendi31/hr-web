"use client";

import { Empty, Panel } from "@/components/bits";
import { FeedFooter } from "@/components/feed-footer";
import { useInfiniteFeed } from "@/components/use-infinite-feed";
import { RemindButton } from "./remind-button";
import { initials } from "@/lib/hr";

export type Absentee = { id: number; name: string; division: string };

export function AbsenteePanel({
  date,
  div,
  initial,
  total,
}: {
  date: string;
  div: string;
  initial: Absentee[];
  total: number;
}) {
  const { items, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteFeed<Absentee>({
      kind: "belum-absen",
      params: { date, div },
      initial,
      initialHasMore: total > initial.length,
    });

  return (
    <Panel
      title={`Belum absen masuk (${total})`}
      action={
        total > 0 && (
          // reminds everyone loaded so far; scroll further to cover the rest
          <RemindButton
            ids={items.map((a) => a.id)}
            date={date}
            label="Ingatkan semua"
          />
        )
      }
    >
      {items.length === 0 ? (
        <Empty>Semua karyawan sudah absen masuk.</Empty>
      ) : (
        <>
          <ul className="divide-y">
            {items.map((a) => (
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
          <div className="px-4">
            <FeedFooter
              sentinelRef={sentinelRef}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              endLabel="Semua yang belum absen ditampilkan."
            />
          </div>
        </>
      )}
    </Panel>
  );
}
