"use client";

import { Megaphone } from "lucide-react";
import { Empty, Panel, Pill, type Tone } from "@/components/bits";
import { FeedFooter } from "@/components/feed-footer";
import { useInfiniteFeed } from "@/components/use-infinite-feed";
import { PinButton } from "./pin-button";

export type Announcement = {
  id: number;
  title: string;
  body: string;
  category: string;
  audience: string;
  pinned: boolean;
  /** serialised over JSON on page 2+, so treat it as a string */
  createdAt: string;
  author: string | null;
  reads: number;
};

const CAT_TONE: Record<string, Tone> = {
  Kebijakan: "primary",
  Libur: "success",
  Administrasi: "info",
  Pelatihan: "warning",
};

const ICON_TONE: Record<Tone, string> = {
  primary: "bg-primary-subtle text-primary",
  success: "bg-success-subtle text-success",
  info: "bg-info-subtle text-info",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  neutral: "bg-muted text-muted-foreground",
};

export function AnnouncementFeed({
  initial,
  initialHasMore,
}: {
  initial: Announcement[];
  initialHasMore: boolean;
}) {
  const { items, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteFeed<Announcement>({
      kind: "pengumuman",
      initial,
      initialHasMore,
    });

  if (items.length === 0) {
    return (
      <Panel>
        <Empty>Belum ada pengumuman.</Empty>
      </Panel>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {items.map((a) => {
          const tone = CAT_TONE[a.category] ?? "neutral";
          return (
            <article
              key={a.id}
              className={`bg-card rounded-[13px] border p-4 shadow-sm ${a.pinned ? "border-primary/45" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ${ICON_TONE[tone]}`}
                >
                  <Megaphone className="size-[17px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14.5px] font-semibold">{a.title}</h2>
                    <Pill tone={tone}>{a.category}</Pill>
                    {a.pinned && <Pill tone="primary">Disematkan</Pill>}
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
                    {a.body}
                  </p>
                  <p className="text-subtle mt-2.5 text-[11.5px]">
                    {a.author ?? "HR"} ·{" "}
                    {new Date(a.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    · {a.audience} · dibaca {a.reads} orang
                  </p>
                </div>
                <PinButton id={a.id} pinned={a.pinned} />
              </div>
            </article>
          );
        })}
      </div>

      <FeedFooter
        sentinelRef={sentinelRef}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        endLabel="Semua pengumuman sudah ditampilkan."
      />
    </>
  );
}
