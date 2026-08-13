"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Empty, PageHead, Panel, ReqBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { durasi, ukuranFile } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { RequestDialog } from "./request-dialog";

export type RequestItem = {
  id: number;
  kind: "cuti" | "lembur";
  title: string;
  detail: string;
  note: string;
  status: "menunggu" | "revisi" | "disetujui" | "ditolak" | "dibatalkan";
  days?: number;
  type?: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus";
  startDate?: string;
  endDate?: string;
  reason?: string;
  delegateId?: number | null;
  delegateName?: string | null;
  attachment?: { key: string; name: string | null; size: number | null } | null;
  minutes?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
};

export type Requests = {
  balance: { quota: number; used: number; remaining: number } | null;
  delegates: { id: number; name: string }[];
  cuti: RequestItem[];
  lembur: RequestItem[];
};

type Tab = "cuti" | "lembur";

export function Pengajuan() {
  const [tab, setTab] = useState<Tab>("cuti");
  /** null = closed, "new" = blank form, otherwise the row being viewed/revised */
  const [open, setOpen] = useState<RequestItem | "new" | null>(null);

  const q = useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const res = await fetch("/api/me/requests");
      if (!res.ok) throw new Error("Gagal memuat pengajuan");
      return (await res.json()) as Requests;
    },
  });

  const items = (tab === "cuti" ? q.data?.cuti : q.data?.lembur) ?? [];
  const bal = q.data?.balance;
  const lemburMenit = (q.data?.lembur ?? [])
    .filter((r) => r.status === "disetujui")
    .reduce((s, r) => s + (r.minutes ?? 0), 0);

  return (
    <>
      <PageHead
        title="Pengajuan"
        desc="Ajukan cuti atau lembur dan pantau statusnya."
      >
        <Button onClick={() => setOpen("new")}>
          <Plus className="size-3.5" aria-hidden />
          {tab === "cuti" ? "Ajukan cuti" : "Ajukan lembur"}
        </Button>
      </PageHead>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="cuti">Cuti</TabsTrigger>
          <TabsTrigger value="lembur">Lembur</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "cuti" && bal && (
        <Panel title="Saldo cuti tahunan" className="mb-4">
          <div className="p-4">
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-medium">
                <span className="tnum text-[17px] font-semibold">
                  {bal.remaining}
                </span>{" "}
                hari tersisa
              </span>
              <span className="text-subtle tnum text-[12px]">
                {bal.used} / {bal.quota} terpakai
              </span>
            </div>
            <Progress value={bal.quota ? (bal.used / bal.quota) * 100 : 0} />
            <p className="text-subtle mt-2 text-[11.5px]">
              Durasi dihitung dalam hari kerja — akhir pekan dan hari libur
              nasional tidak dipotong.
            </p>
          </div>
        </Panel>
      )}

      {tab === "lembur" && (
        <Panel title="Lembur disetujui" className="mb-4">
          <p className="p-4 text-[13px]">
            <span className="tnum text-[17px] font-semibold">
              {durasi(lemburMenit)}
            </span>{" "}
            <span className="text-subtle text-[12px]">
              total dari pengajuan yang sudah disetujui
            </span>
          </p>
        </Panel>
      )}

      <Panel title="Riwayat pengajuan">
        {q.isPending ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-[13px]">
            Memuat…
          </p>
        ) : items.length === 0 ? (
          <Empty>Belum ada pengajuan {tab}.</Empty>
        ) : (
          <ul className="divide-y">
            {items.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  className="hover:bg-accent flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {r.title}
                    </span>
                    <span className="text-subtle block truncate text-[11.5px]">
                      {r.detail}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-[11.5px]",
                        r.status === "revisi"
                          ? "text-primary font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.status === "revisi" ? `HR: ${r.note}` : r.note}
                    </span>
                    {r.attachment && (
                      <span className="text-subtle mt-0.5 block truncate text-[11px]">
                        Lampiran: {r.attachment.name}
                        {r.attachment.size
                          ? ` · ${ukuranFile(r.attachment.size)}`
                          : ""}
                      </span>
                    )}
                  </span>
                  <ReqBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {open && (
        <RequestDialog
          kind={tab}
          request={open === "new" ? null : open}
          delegates={q.data?.delegates ?? []}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
