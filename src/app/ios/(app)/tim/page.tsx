"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Team } from "../../_lib/api";
import { tanggalPanjang } from "../../_lib/format";
import { att } from "../../_lib/status";
import { Avatar, Badge, BackHeader, Card, ErrorNote, Skeleton } from "../../_lib/ui";

/** Filter dikelompokkan seperti yang orang tanyakan, bukan per status mentah. */
const FILTER = [
  ["semua", "Semua", () => true],
  ["hadir", "Hadir", (s: string) => s === "hadir" || s === "telat" || s === "wfh"],
  ["belum", "Belum absen", (s: string) => s === "belum_absen" || s === "tanpa_keterangan"],
  ["izin", "Cuti / izin", (s: string) => s === "cuti" || s === "izin" || s === "sakit"],
] as const;

export default function TimPage() {
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTER)[number][0]>("semua");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "team"],
    queryFn: () => api<Team>("/api/me/team"),
  });

  // seluruh perusahaan hanya belasan baris; disaring di perangkat, seperti di app Android
  const rows = useMemo(() => {
    if (!data) return [];
    const cocok = FILTER.find((x) => x[0] === f)![2];
    const kata = q.trim().toLowerCase();
    return data.members.filter(
      (m) =>
        cocok(m.status) &&
        (!kata || `${m.name} ${m.division} ${m.position}`.toLowerCase().includes(kata)),
    );
  }, [data, f, q]);

  const hadir = data?.members.filter((m) => FILTER[1][2](m.status)).length ?? 0;

  return (
    <div className="space-y-5">
      <BackHeader href="/ios" title="Kehadiran tim" />

      {data ? (
        <p className="text-sm text-muted-foreground">
          {tanggalPanjang(data.date)} ·{" "}
          <span className="font-semibold text-foreground tabular-nums">{hadir}</span> dari {data.members.length} hadir
        </p>
      ) : null}

      <label className="relative block">
        <span className="sr-only">Cari rekan</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, divisi, atau jabatan"
          className="h-12 w-full rounded-xl border border-input bg-card pr-3.5 pl-11 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist">
        {FILTER.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={f === k}
            onClick={() => setF(k)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-medium",
              f === k ? "border-primary bg-primary-subtle text-primary" : "border-border bg-card text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-80" />
      ) : error || !data ? (
        <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-muted-foreground">
            {q ? `Tidak ada rekan yang cocok dengan “${q}”.` : "Tidak ada rekan pada filter ini."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((m) => {
            const s = att(m.status);
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar photoKey={m.photoKey} initials={m.initials} name={m.name} size={40} zoom />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.detail}</p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
