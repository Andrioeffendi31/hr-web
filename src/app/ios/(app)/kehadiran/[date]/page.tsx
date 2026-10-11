"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, LogIn, LogOut, MapPin, MessageSquareText, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, fileUrl, type AttendanceDay } from "../../../_lib/api";
import { formatJarak, jam, tanggalPanjang } from "../../../_lib/format";
import { att } from "../../../_lib/status";
import { BackHeader, Badge, Card, ErrorNote, SectionTitle, Skeleton } from "../../../_lib/ui";

const IKON = {
  masuk: { icon: LogIn, cls: "bg-success-subtle text-success" },
  keluar: { icon: LogOut, cls: "bg-primary-subtle text-primary" },
  lokasi: { icon: MapPin, cls: "bg-muted text-muted-foreground" },
  catatan: { icon: MessageSquareText, cls: "bg-muted text-muted-foreground" },
} as const;

const JUDUL = { masuk: "Absen masuk", keluar: "Absen keluar", lokasi: "Ping lokasi", catatan: "Catatan" } as const;

export default function DetailHariPage() {
  const { date } = useParams<{ date: string }>();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "attendance-day", date],
    queryFn: () => api<AttendanceDay>(`/api/me/attendance/${date}`),
  });

  return (
    <div className="space-y-5">
      <BackHeader href="/ios/kehadiran" title="Detail kehadiran" />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : error || !data ? (
        <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
      ) : (
        <Isi d={data} />
      )}
    </div>
  );
}

function Isi({ d }: { d: AttendanceDay }) {
  const s = att(d.status);
  const foto = d.events.filter((e) => e.photoKey);
  const alasan = [
    d.lateReason ? { label: "Alasan terlambat", teks: d.lateReason } : null,
    d.earlyReason ? { label: "Alasan pulang lebih awal", teks: d.earlyReason } : null,
  ].filter(Boolean) as { label: string; teks: string }[];

  return (
    <>
      <div className="space-y-3">
        <h2 className="font-heading text-2xl font-bold tracking-tight">{tanggalPanjang(d.date)}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Shift {d.shift.start}–{d.shift.end}
          </span>
          {d.izin ? (
            <span className="rounded-lg bg-info-subtle px-2 py-0.5 text-xs font-semibold text-info">
              Izin {d.izin.start}–{d.izin.end}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["Absen masuk", d.in, LogIn, "bg-success-subtle text-success"],
          ["Absen keluar", d.out, LogOut, "bg-primary-subtle text-primary"],
        ].map(([l, v, Icon, cls]) => {
          const I = Icon as typeof LogIn;
          return (
            <Card key={l as string} className="space-y-2.5">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className={cn("flex size-7 items-center justify-center rounded-lg", cls as string)}>
                  <I className="size-4" aria-hidden />
                </span>
                {l as string}
              </p>
              <p className="text-[28px] leading-none font-bold tabular-nums">{(v as string) || "—"}</p>
            </Card>
          );
        })}
      </div>

      <Card className="divide-y divide-border p-0">
        <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Titik absen</span>
          <span className="text-right font-medium">{d.office ?? "Tanpa titik kantor (WFH)"}</span>
        </div>
        {d.location ? (
          <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Lokasi tercatat</span>
            <span className="text-right font-medium">{d.location}</span>
          </div>
        ) : null}
        {d.note ? (
          <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Catatan</span>
            <span className="text-right font-medium">{d.note}</span>
          </div>
        ) : null}
      </Card>

      {d.ditolak ? (
        <Card className="space-y-1 border-danger/30 bg-danger-subtle">
          <p className="text-[15px] font-semibold text-danger">{d.ditolak.type} ditolak</p>
          <p className="text-sm text-muted-foreground">{d.ditolak.note ?? "Pengajuan untuk hari ini tidak disetujui."}</p>
        </Card>
      ) : null}

      {alasan.map((a) => (
        <Card key={a.label} className="space-y-2 border-warning/40 bg-warning-subtle/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-warning">{a.label}</p>
            {d.review ? (
              <Badge tone={d.review.ok ? "success" : "danger"}>{d.review.ok ? "Diterima" : "Tidak diterima"}</Badge>
            ) : (
              <Badge tone="warning">Menunggu tinjauan</Badge>
            )}
          </div>
          <p className="text-sm text-foreground/80">{a.teks}</p>
          {d.review?.note ? <p className="text-xs text-muted-foreground">Catatan admin: {d.review.note}</p> : null}
        </Card>
      ))}

      {foto.length ? (
        <div className="space-y-3">
          <SectionTitle>Foto absen</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {foto.map((e) => (
              <a
                key={e.id}
                href={fileUrl(e.photoKey!)}
                target="_blank"
                rel="noreferrer"
                className="relative block overflow-hidden rounded-2xl outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- dilayani /api/files dengan sesi */}
                <img src={fileUrl(e.photoKey!)} alt={`Selfie ${JUDUL[e.kind].toLowerCase()}`} className="aspect-[3/4] w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-lg bg-black/65 px-2 py-1 text-xs font-semibold text-white">
                  {e.kind === "masuk" ? "Masuk" : "Keluar"} · {jam(e.at)}
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <SectionTitle aside={`${d.events.length} aktivitas`}>Riwayat hari ini</SectionTitle>
        {d.events.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-muted-foreground">Tidak ada aktivitas tercatat pada hari ini.</p>
          </Card>
        ) : (
          <Card className="px-4 pt-4 pb-1">
            <ol>
              {d.events.map((e, i) => {
                const k = IKON[e.kind];
                const terakhir = i === d.events.length - 1;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4">
                    {!terakhir ? <span aria-hidden className="absolute top-8 bottom-1 left-[13px] w-0.5 rounded-full bg-border" /> : null}
                    <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", k.cls)}>
                      <k.icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-sm", e.kind === "lokasi" || e.kind === "catatan" ? "font-medium" : "font-semibold")}>
                          {JUDUL[e.kind]}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{jam(e.at)}</p>
                      </div>
                      {e.location ? <p className="text-[13px] text-muted-foreground">{e.location}</p> : null}
                      {e.distanceM !== null && e.kind !== "catatan" ? (
                        <p className="text-xs text-muted-foreground">{formatJarak(e.distanceM)} dari titik absen</p>
                      ) : null}
                      {e.note ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
                      {e.suspect ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-danger">
                          <AlertTriangle className="size-3.5" aria-hidden />
                          {e.suspect}
                        </p>
                      ) : null}
                      {e.lat !== null && e.lng !== null ? (
                        <a
                          href={`https://maps.apple.com/?ll=${e.lat},${e.lng}&q=${encodeURIComponent(JUDUL[e.kind])}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-xs font-semibold text-primary"
                        >
                          Buka di Peta
                        </a>
                      ) : null}
                      {e.jedaSesudah ? (
                        <p className="flex items-center gap-1 pt-1 text-xs text-warning">
                          <WifiOff className="size-3.5" aria-hidden />
                          Jeda {Math.floor(e.jedaSesudah.menit / 60)} j {e.jedaSesudah.menit % 60} m
                          {e.jedaSesudah.tertunda ? " · sinyal hilang" : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
