"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api, type Leaderboard, type LeaderboardRow } from "../../_lib/api";
import { Avatar, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "../../_lib/ui";

const PERIODE = [
  ["week", "Mingguan", "minggu ini"],
  ["month", "Bulanan", "bulan ini"],
  ["all", "Semua", "sepanjang waktu"],
] as const;
type Periode = (typeof PERIODE)[number][0];

const MEDALI = { 1: "medal-gold", 2: "medal-silver", 3: "medal-bronze" } as const;
const ANGKA_MEDALI = { 1: "text-[#5a3d00]", 2: "text-[#3a3f48]", 3: "text-[#4a2410]" } as const;

const poinTeks = (n: number) => new Intl.NumberFormat("id-ID").format(n).replace("-", "−");

export default function PeringkatPage() {
  const [periode, setPeriode] = useState<Periode>("week");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "leaderboard", periode],
    queryFn: () => api<Leaderboard>(`/api/me/leaderboard?period=${periode}`),
  });
  const label = PERIODE.find((p) => p[0] === periode)![2];

  const top = data?.leaders.slice(0, 3) ?? [];
  const sisa = data?.leaders.slice(3) ?? [];
  // urutan podium: 2 – 1 – 3
  const podium = [top[1], top[0], top[2]].filter(Boolean) as LeaderboardRow[];

  return (
    <div className="space-y-6">
      <PageHeader title="Peringkat tim" subtitle={`Lihat pencapaian terbaik ${label}`} />

      <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
        {PERIODE.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={periode === k}
            onClick={() => setPeriode(k)}
            className={cn(
              "h-10 flex-1 rounded-xl text-sm font-medium",
              periode === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-72" />
      ) : error || !data ? (
        <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
      ) : (
        <>
          <Card className="grid grid-cols-4 gap-2 p-4 text-center">
            {[
              ["Hadir", data.hariIni.hadir, "bg-success"],
              ["Terlambat", data.hariIni.telat, "bg-warning"],
              ["Izin", data.hariIni.izin, "bg-primary"],
              ["Belum", data.hariIni.belum, "bg-muted-foreground"],
            ].map(([l, v, dot]) => (
              <div key={l as string} className="space-y-0.5">
                <p className="text-xl font-bold tabular-nums">{v}</p>
                <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
                  {l}
                </p>
              </div>
            ))}
            <p className="col-span-4 pt-1 text-xs text-muted-foreground">Ringkasan tim hari ini</p>
          </Card>

          {podium.length ? (
            <div className="flex items-end gap-2 pt-2">
              {podium.map((r) => {
                const juara = r.rank === 1;
                const size = juara ? 92 : 70;
                const medal = MEDALI[r.rank as 1 | 2 | 3];
                return (
                  <div key={r.id} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    {juara ? (
                      <>
                        {/* Di DEPAN avatar (z-20), seperti di desain: kilaunya menimpa
                            sudut kartu juara, bukan bersembunyi di belakangnya. */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- aset statis kecil */}
                        <img
                          src="/ios/leaderboard/sprinkles.png"
                          alt=""
                          className="pointer-events-none absolute top-[46px] z-20 w-[150px] max-w-none"
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/ios/leaderboard/crown.png" alt="Mahkota peringkat pertama" className="h-10 w-[60px] object-contain" />
                      </>
                    ) : null}
                    <div className="relative" style={{ width: size, height: size + 20 }}>
                      <Avatar
                        photoKey={r.photoKey}
                        initials={r.initials}
                        name={r.name}
                        zoom
                        size={size}
                        className={cn("rounded-[30%]", juara && "ring-2 ring-[#e8b54a]/70")}
                      />
                      {medal ? (
                        <span className="pointer-events-none absolute left-1/2 flex h-[46px] w-[42px] -translate-x-1/2 justify-center" style={{ top: size - 22 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/ios/leaderboard/${medal}.png`} alt="" className="absolute inset-0 size-full object-contain" />
                          <span className={cn("relative pt-[9px] font-mono text-sm font-bold", ANGKA_MEDALI[r.rank as 1 | 2 | 3])}>
                            {r.rank}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 w-full pt-1 text-center text-[13px] leading-tight font-semibold text-balance">
                      {r.name}
                    </p>
                    <p className="text-sm">
                      <span className="text-lg font-bold text-primary tabular-nums">{poinTeks(r.poin)}</span>{" "}
                      <span className="text-muted-foreground">poin</span>
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card>
              <p className="text-center text-sm text-muted-foreground">Belum ada data peringkat untuk periode ini.</p>
            </Card>
          )}

          {sisa.length ? (
            <div className="space-y-3">
              <SectionTitle aside={`${data.peringkatDari} karyawan`}>Peringkat lainnya</SectionTitle>
              <Card className="divide-y divide-border p-0">
                {sisa.map((r) => (
                  <Baris key={r.id} r={r} />
                ))}
              </Card>
            </div>
          ) : null}

          {data.me ? (
            /*
             * Melayang tepat di atas tab bar (tinggi 64 + jarak 10 + safe area)
             * selama daftar digulir, lalu berhenti di posisi aslinya di ujung
             * daftar — sticky, bukan fixed, jadi ia tidak pernah menutupi
             * baris terakhir.
             */
            <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+86px)] z-30 pt-2">
              <Card className="border-primary/40 bg-card/95 p-0 shadow-lg backdrop-blur-xl">
                <p className="px-4 pt-3 text-[13px] font-semibold text-primary">Peringkat kamu</p>
                <Baris r={data.me} saya />
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Baris({ r, saya }: { r: LeaderboardRow; saya?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-7 shrink-0 text-base font-semibold text-muted-foreground tabular-nums">{r.rank}</span>
      <Avatar photoKey={r.photoKey} initials={r.initials} name={r.name} size={44} zoom className="rounded-[30%]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{r.name}</p>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {r.tepatWaktu} hari tepat waktu{r.telat ? ` · ${r.telat} terlambat` : ""}
        </p>
      </div>
      <p className="shrink-0 text-sm">
        <span className={cn("text-base font-bold tabular-nums", r.poin < 0 && "text-danger")}>{poinTeks(r.poin)}</span>{" "}
        <span className="text-muted-foreground">poin</span>
      </p>
    </div>
  );
}
