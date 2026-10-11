"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, ChevronRight, Clock3, LogIn, LogOut, MapPin, Megaphone, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { att } from "../_lib/status";
import { jam, salam, tanggalPanjang } from "../_lib/format";
import { sedangBekerja, useMe } from "../_lib/hooks";
import { kirimLokasi } from "../_lib/ping";
import { aktifkanPush, usePushState } from "../_lib/push";
import { Avatar, Badge, Card, ErrorNote, SectionTitle, Skeleton } from "../_lib/ui";

export default function Beranda() {
  const { data: me, isPending, error, refetch } = useMe();

  if (isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
        <Skeleton className="h-24" />
      </div>
    );
  if (error || !me) return <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />;

  const t = me.today;
  const status = att(t.clockIn ? t.status : "belum_absen");
  const selesai = !!t.clockOut;

  return (
    <div className="space-y-4">
      {/* Sapaan */}
      <Card className="flex items-center gap-4 p-5">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[15px] text-muted-foreground">{salam()},</p>
          <p className="truncate font-heading text-2xl font-bold tracking-tight">{me.profile.name}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {me.profile.nik}
            </span>
            <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {me.profile.division || "Tanpa divisi"}
            </span>
          </div>
        </div>
        <Link href="/ios/profil" aria-label="Buka profil">
          <Avatar photoKey={me.profile.photoKey} initials={me.profile.initials} size={64} />
        </Link>
      </Card>

      <AjakanNotifikasi />

      {/* Kehadiran hari ini */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Kehadiran hari ini</h2>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {tanggalPanjang(t.date)}
          </span>
        </div>

        <div className="space-y-4 rounded-2xl bg-muted/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden />
              Shift {me.shift.start}–{me.shift.end}
            </span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Absen masuk", value: jam(t.clockIn), icon: LogIn },
              { label: "Absen keluar", value: jam(t.clockOut), icon: LogOut },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="space-y-1 rounded-xl bg-card p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </p>
                <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {selesai ? (
          <p className="rounded-xl bg-success-subtle px-4 py-3 text-center text-sm font-medium text-success">
            Absensi hari ini sudah lengkap.
          </p>
        ) : (
          <Link
            href="/ios/absen"
            className="flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          >
            {t.clockIn ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
            {t.clockIn ? "Absen keluar" : "Absen masuk sekarang"}
          </Link>
        )}

        {sedangBekerja(me) ? <KirimLokasi /> : null}
      </Card>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/ios/pengajuan" className="block">
          <Card className="h-full space-y-1">
            <p className="text-xs text-muted-foreground">Sisa cuti</p>
            <p className="text-xl font-bold tabular-nums">{me.leave.remaining} hari</p>
            <p className="text-xs text-muted-foreground">dari {me.leave.quota} hari kuota</p>
          </Card>
        </Link>
        <Link href="/ios/pengajuan" className="block">
          <Card className="h-full space-y-1">
            <p className="text-xs text-muted-foreground">Pengajuan</p>
            <p className="text-xl font-bold tabular-nums">{me.pendingRequests} menunggu</p>
            <p className="text-xs text-muted-foreground">cuti & lembur</p>
          </Card>
        </Link>
      </div>

      {/* Rekan */}
      <Card className="space-y-3">
        <SectionTitle
          aside={
            <Link
              href="/ios/tim"
              className="inline-flex items-center gap-0.5 rounded-lg bg-primary-subtle py-1.5 pr-2 pl-3 text-[13px] font-semibold text-primary"
            >
              Lihat tim
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          }
        >
          Rekan hadir hari ini
        </SectionTitle>
        <div className="flex items-center gap-3">
          {me.team.avatars.length ? (
            <span className="flex -space-x-2">
              {me.team.avatars.slice(0, 5).map((a) => (
                <Avatar key={a.id} photoKey={a.photoKey} initials={a.initials} size={32} className="ring-2 ring-card" />
              ))}
            </span>
          ) : (
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Users className="size-5" aria-hidden />
            </span>
          )}
          <p className="flex-1 text-right text-sm text-muted-foreground">
            <span className="text-xl font-bold text-foreground tabular-nums">{me.team.present}</span> dari{" "}
            {me.team.total} rekan sudah hadir
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${me.team.total ? (me.team.present / me.team.total) * 100 : 0}%` }}
          />
        </div>
      </Card>

      {/* Pengumuman */}
      <Card className="space-y-3">
        <SectionTitle>Pengumuman</SectionTitle>
        {me.announcements.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
            <Bell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold">Belum ada pengumuman</p>
              <p className="text-sm text-muted-foreground">Pengumuman dari perusahaan akan muncul di sini.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {me.announcements.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Megaphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-pretty">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.category} · {a.date}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function KirimLokasi() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function kirim() {
    setBusy(true);
    const h = await kirimLokasi();
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["ios"] });
    if (h.kind === "ok") toast.success(h.outside ? "Lokasi terkirim. Anda tercatat di luar area kantor." : "Lokasi terkirim.");
    else if (h.kind === "sudah") toast.success("Lokasi Anda sudah tercatat baru-baru ini.");
    else toast.error(h.message);
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
      <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="flex-1 text-xs text-muted-foreground text-pretty">
        Lokasi dikirim saat aplikasi dibuka dan lewat pengingat tiap 2 jam.
      </p>
      <button
        type="button"
        onClick={kirim}
        disabled={busy}
        className="shrink-0 rounded-lg bg-primary-subtle px-3 py-2 text-xs font-semibold text-primary disabled:opacity-60"
      >
        {busy ? "Mengirim…" : "Kirim sekarang"}
      </button>
    </div>
  );
}

/** Ajakan menyalakan notifikasi — hanya selama izinnya belum pernah ditanyakan. */
function AjakanNotifikasi() {
  const state = usePushState();
  if (state !== "default") return null;
  return (
    <Card className="flex items-center gap-3 border-primary/30">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
        <BellRing className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Nyalakan notifikasi</p>
        <p className="text-xs text-muted-foreground text-pretty">
          Untuk pengingat absen, pengingat lokasi tiap 2 jam, dan kabar pengajuan.
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const s = await aktifkanPush().catch(() => "default" as const);
          if (s === "granted") toast.success("Notifikasi menyala.");
          else if (s === "denied") toast.error("Notifikasi ditolak. Nyalakan lewat Pengaturan iPhone › NanumHR.");
        }}
        className={cn("shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground")}
      >
        Nyalakan
      </button>
    </Card>
  );
}
