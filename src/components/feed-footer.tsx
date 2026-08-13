"use client";

import { Button } from "@/components/ui/button";

/** Sentinel + manual fallback shared by every infinite feed. */
export function FeedFooter({
  sentinelRef,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  endLabel = "Semua data sudah ditampilkan.",
}: {
  sentinelRef: (node: HTMLElement | null) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  endLabel?: string;
}) {
  if (!hasNextPage) {
    return (
      <p className="text-subtle py-3 text-center text-[11.5px]">{endLabel}</p>
    );
  }
  return (
    <div ref={sentinelRef} className="flex justify-center py-3">
      {isFetchingNextPage ? (
        <span className="text-subtle text-[12px]">Memuat…</span>
      ) : (
        // fallback for when IntersectionObserver never fires (short viewport,
        // reduced-motion scroll containers, tests)
        <Button variant="outline" onClick={onLoadMore}>
          Muat lebih banyak
        </Button>
      )}
    </div>
  );
}
