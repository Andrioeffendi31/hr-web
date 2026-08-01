"use client";

import { useCallback, useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

type Page<T> = { items: T[]; nextPage: number | null };

/**
 * Infinite scroll over /api/feed/<kind>. The first page comes from the server
 * render (`initial`), so the list is complete on first paint and stays
 * crawlable/testable — only page 2 onwards is fetched here.
 */
export function useInfiniteFeed<T>({
  kind,
  params = {},
  initial,
  initialHasMore,
}: {
  kind: string;
  params?: Record<string, string | undefined>;
  initial: T[];
  initialHasMore: boolean;
}) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);

  const q = useInfiniteQuery<Page<T>>({
    queryKey: ["feed", kind, search.toString()],
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams(search);
      p.set("page", String(pageParam));
      const res = await fetch(`/api/feed/${kind}?${p}`);
      if (!res.ok) throw new Error("Gagal memuat data berikutnya");
      return res.json();
    },
    initialData: {
      pages: [{ items: initial, nextPage: initialHasMore ? 2 : null }],
      pageParams: [1],
    },
    // the server already rendered page 1; don't refetch it on mount
    staleTime: 30_000,
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = q;
  const observer = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!node) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        { rootMargin: "200px" },
      );
      observer.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? initial,
    sentinelRef,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
  };
}
