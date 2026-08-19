"use client";

import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Empty, Panel, Pill, ReqBadge } from "@/components/bits";
import { DecideButtons } from "@/components/decide-buttons";
import { FeedFooter } from "@/components/feed-footer";
import { useInfiniteFeed } from "@/components/use-infinite-feed";
import { deductsBalance, initials, rentangTanggal, ukuranFile } from "@/lib/hr";

/** Nilai `request_status`, disebut satu kali di sisi klien. */
export type StatusPengajuan =
  | "menunggu"
  | "revisi"
  | "menunggu_pimpinan"
  | "disetujui"
  | "ditolak"
  | "dibatalkan";

export type LeaveRow = {
  id: number;
  type: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus";
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: StatusPengajuan;
  decisionNote: string | null;
  createdAt: string;
  name: string;
  division: string | null;
  employeeId: number;
  delegateName: string | null;
  remaining: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
};

const TYPE_TONE = {
  "Cuti Tahunan": "primary",
  "Cuti Sakit": "info",
  "Izin Khusus": "warning",
} as const;

export function LeaveQueue({
  status,
  initial,
  initialHasMore,
  pimpinan,
}: {
  status: string;
  initial: LeaveRow[];
  initialHasMore: boolean;
  /** true kalau yang membuka halaman ini Pimpinan — penentu tombol mana yang muncul */
  pimpinan: boolean;
}) {
  const { items, sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteFeed<LeaveRow>({
      kind: "cuti",
      params: { status },
      initial,
      initialHasMore,
    });

  if (items.length === 0) {
    return (
      <Panel>
        <Empty>Tidak ada pengajuan pada status ini.</Empty>
      </Panel>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {items.map((r) => (
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
                  {r.division ?? "Tanpa divisi"} · diajukan{" "}
                  {new Date(r.createdAt).toLocaleDateString("id-ID", {
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
                    ? `${r.remaining ?? "—"} hari`
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

            {r.attachmentName && r.attachmentKey && (
              <a
                href={`/api/files/${r.attachmentKey}`}
                className="border-border hover:border-primary hover:text-primary mt-2 flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium"
              >
                <Paperclip className="size-3.5" />
                {r.attachmentName}
                <span className="text-subtle font-normal">
                  {ukuranFile(r.attachmentSize ?? 0)}
                </span>
              </a>
            )}

            {r.decisionNote && (
              <p className="text-danger bg-danger-subtle mt-2 rounded-lg px-3 py-2 text-[12.5px]">
                Catatan HR: {r.decisionNote}
              </p>
            )}

            {/* Siapa yang melihat menentukan tombolnya, bukan hanya statusnya:
                admin memutus tingkat pertama, Pimpinan menutup yang kedua. Baris
                yang menunggu Pimpinan tidak memberi admin tombol apa pun — kalau
                tidak, ia akan menekan lalu mendapat 409 tanpa tahu sebabnya.

                Revisi menunggu karyawan, tapi admin tetap boleh memutus yang asli
                sebagaimana adanya — catatannya permintaan, bukan kunci. */}
            {(pimpinan
              ? r.status === "menunggu" || r.status === "menunggu_pimpinan"
              : r.status === "menunggu" || r.status === "revisi") && (
              <div className="mt-3">
                <DecideButtons
                  kind="cuti"
                  id={r.id}
                  name={r.name}
                  // Pimpinan selalu menutup; admin pada `menunggu` hanya meneruskan
                  tahap={pimpinan ? "final" : "teruskan"}
                  // Minta revisi hanya masuk akal sebelum ada tanda tangan sama
                  // sekali — dan server menolaknya sesudah itu. Menampilkan tombol
                  // yang pasti dijawab 409 adalah cara terburuk menyampaikan aturan.
                  allowRevision={r.status === "menunggu"}
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <FeedFooter
        sentinelRef={sentinelRef}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        endLabel="Semua pengajuan sudah ditampilkan."
      />
    </>
  );
}
