"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api, type AttendanceMonth } from "../../_lib/api";
import { bulanTahun, hariIniWib } from "../../_lib/format";
import { att } from "../../_lib/status";
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "../../_lib/ui";

const geser = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const hariPendek = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

export default function KehadiranPage() {
  const ini = hariIniWib().slice(0, 7);
  const [bulan, setBulan] = useState(ini);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "attendance", bulan],
    queryFn: () => api<AttendanceMonth>(`/api/me/attendance?month=${bulan}`),
  });

  // penyebutnya jumlah keempat statistik di bawahnya, bukan jumlah baris harian:
  // dengan begitu "x dari y" tidak pernah bertentangan dengan angka di kartu yang
  // sama, dan hari libur memang tidak termasuk di keempatnya
  const hariKerja = data
    ? data.stats.hadir + data.stats.telat + data.stats.cuti + data.stats.tanpaKeterangan
    : 0;

  const stats = data
    ? [
        { label: "Hadir", value: data.stats.hadir, dot: "bg-success" },
        { label: "Terlambat", value: data.stats.telat, dot: "bg-warning" },
        { label: "Cuti / izin", value: data.stats.cuti, dot: "bg-primary" },
        { label: "Tanpa keterangan", value: data.stats.tanpaKeterangan, dot: "bg-danger" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Kehadiran saya" subtitle="Ringkasan dan catatan aktivitas kerja" />

      <div className="space-y-3">
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setBulan((b) => geser(b, -1))}
            aria-label="Bulan sebelumnya"
            className="flex size-11 items-center justify-center rounded-xl bg-muted"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-subtle text-[15px] font-semibold text-primary">
            <CalendarDays className="size-4" aria-hidden />
            {bulanTahun(bulan)}
          </p>
          <button
            type="button"
            onClick={() => setBulan((b) => geser(b, 1))}
            disabled={bulan >= ini}
            aria-label="Bulan berikutnya"
            className="flex size-11 items-center justify-center rounded-xl bg-muted disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {isPending ? (
          <Skeleton className="h-40" />
        ) : error || !data ? (
          <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
        ) : (
          <Card className="space-y-5 p-5">
            <div className="space-y-1.5">
              <p className="text-[13px] font-semibold text-muted-foreground">Hari hadir · {bulanTahun(bulan)}</p>
              <p className="flex items-end gap-2">
                <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">
                  {data.stats.hadir + data.stats.telat}
                </span>
                <span className="pb-1 text-[15px] text-muted-foreground">dari {hariKerja} hari kerja</span>
              </p>
            </div>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              {stats.map((s) => (
                <div key={s.label} className="space-y-1">
                  <p className="text-[22px] leading-tight font-bold tabular-nums">{s.value}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {data ? (
        <div className="space-y-3">
          <SectionTitle aside={`${data.days.length} hari`}>Catatan harian</SectionTitle>
          {data.days.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-muted-foreground">Belum ada catatan pada bulan ini.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {data.days.map((d) => {
                const s = att(d.status);
                return (
                  <Link key={d.date} href={`/ios/kehadiran/${d.date}`} className="flex items-center gap-3.5 px-4 py-3">
                    <div className="flex h-13 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted">
                      <span className="text-[11px] font-semibold text-muted-foreground">{hariPendek(d.date)}</span>
                      <span className="text-lg leading-tight font-bold tabular-nums">{d.date.slice(8)}</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <p className="truncate text-[13px] text-muted-foreground tabular-nums">
                        Masuk {d.in || "—"} · Keluar {d.out || "—"}
                        {d.note ? ` · ${d.note}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
