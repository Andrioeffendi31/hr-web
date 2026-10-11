"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock3,
  ClockAlert,
  Folder,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Timer,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { att } from "../_lib/status";
import { jam, menitDari, salam, tanggalSedang } from "../_lib/format";
import { sedangBekerja, useJamBerjalan, useMenitSejak, useMe } from "../_lib/hooks";
import type { Bootstrap } from "../_lib/api";
import { kirimLokasi } from "../_lib/ping";
import { aktifkanPush, usePushState } from "../_lib/push";
import { Avatar, Card, ErrorNote, SectionTitle, Skeleton } from "../_lib/ui";

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

      {/* Ringkasan singkat — Status dan Sisa cuti, seperti di desain */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex items-center gap-2.5 rounded-[22px] p-3">
          <span
            className={cn(
              "flex size-[38px] shrink-0 items-center justify-center rounded-[10px]",
              t.clockIn ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
            )}
          >
            {t.clockIn ? <CircleCheck className="size-5" aria-hidden /> : <ClockAlert className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="truncate text-[15px] font-semibold">{status.label}</p>
            <p className="text-xs text-muted-foreground">Hari ini</p>
          </div>
        </Card>
        <Link href="/ios/pengajuan" className="block">
          <Card className="flex h-full items-center gap-2.5 rounded-[22px] p-3">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-primary-subtle text-primary">
              <CalendarDays className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Sisa cuti</p>
              <p className="text-[15px] font-semibold tabular-nums">{me.leave.remaining} hari</p>
              <p className="text-xs text-muted-foreground">Tahun {t.date.slice(0, 4)}</p>
            </div>
          </Card>
        </Link>
      </div>

      <AjakanNotifikasi />

      {/* Kehadiran hari ini */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Kehadiran hari ini</h2>
          <span className="rounded-[10px] bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
            {tanggalSedang(t.date)}
          </span>
        </div>

        <div className="flex items-center gap-4 rounded-xl bg-muted/60 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              <Clock3 className="size-3.5" aria-hidden />
              Shift {me.shift.start}–{me.shift.end}
            </span>
            <JamBesar />
            <p className="text-[13px] leading-snug text-muted-foreground text-pretty">
              {!t.clockIn
                ? "Anda belum absen masuk hari ini"
                : t.clockOut
                  ? `Masuk ${jam(t.clockIn)} · Keluar ${jam(t.clockOut)}`
                  : `Masuk ${jam(t.clockIn)} · sedang bekerja`}
            </p>
          </div>
          <CincinJamKerja masuk={t.clockIn} keluar={t.clockOut} shift={me.shift} />
        </div>

        {selesai ? (
          <p className="rounded-xl bg-success-subtle px-4 py-3 text-center text-sm font-medium text-success">
            Absensi hari ini sudah lengkap.
          </p>
        ) : (
          <Link
            href="/ios/absen"
            className="flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            {t.clockIn ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
            {t.clockIn ? "Absen keluar" : "Absen masuk sekarang"}
          </Link>
        )}

        {sedangBekerja(me) ? (
          <KirimLokasi />
        ) : (
          <p className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {lokasiKerja(me)}
          </p>
        )}
      </Card>

      {/* Aksi cepat */}
      <nav aria-label="Aksi cepat" className="grid grid-cols-4 gap-3">
        {[
          { href: "/ios/pengajuan", label: "Cuti", icon: CalendarDays },
          { href: "/ios/pengajuan?jenis=lembur", label: "Lembur", icon: Timer },
          { href: "/ios/kehadiran", label: "Absen", icon: CircleCheck },
          { href: "/ios/berkas", label: "Berkas", icon: Folder },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-2.5 rounded-[20px] border border-border bg-card pt-3.5 pb-3 shadow-sm transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
              <Icon className="size-[22px]" aria-hidden />
            </span>
            <span className="text-[13px] font-medium">{label}</span>
          </Link>
        ))}
      </nav>

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

/** Jam WIB besar yang berdetak, seperti di kartu desain. */
function JamBesar() {
  const waktu = useJamBerjalan();
  return (
    <p className="font-heading text-[38px] leading-none font-bold tracking-tight tabular-nums" aria-live="off">
      {waktu}
    </p>
  );
}

/** Titik absen yang paling mungkin dipakai hari ini, untuk baris lokasi di kartu. */
function lokasiKerja(me: Bootstrap) {
  const o = me.offices.find((x) => x.id === (me.today.officeId ?? me.defaultOfficeId)) ?? me.offices[0];
  return o ? `${o.name} · radius absen ${o.radiusM} m` : "Belum ada titik absen yang aktif";
}

/**
 * Cincin jam kerja: berapa dari durasi shift yang sudah dijalani. Berhenti di
 * jam keluar; sebelum absen masuk tetap 0%.
 */
function CincinJamKerja({
  masuk,
  keluar,
  shift,
}: {
  masuk: string | null;
  keluar: string | null;
  shift: { start: string; end: string };
}) {
  const berjalan = useMenitSejak(keluar ? null : masuk);
  const menit = keluar && masuk ? Math.max(0, Math.round((+new Date(keluar) - +new Date(masuk)) / 60_000)) : berjalan;
  const total = Math.max(1, menitDari(shift.end) - menitDari(shift.start));
  const persen = Math.min(100, Math.round((menit / total) * 100));
  const R = 38;
  const keliling = 2 * Math.PI * R;
  const jamMenit = (m: number) => `${Math.floor(m / 60)}j ${m % 60}m`;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative size-[88px]">
        <svg viewBox="0 0 88 88" className="size-full -rotate-90" aria-hidden>
          <circle cx="44" cy="44" r={R} fill="none" strokeWidth="7" className="stroke-muted" />
          <circle
            cx="44"
            cy="44"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={keliling}
            strokeDashoffset={keliling * (1 - persen / 100)}
            className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[17px] font-semibold tabular-nums">
          {persen}%
        </span>
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold tabular-nums">
          {jamMenit(menit)} <span className="font-normal text-muted-foreground">/ {Math.round(total / 60)}j</span>
        </p>
        <p className="text-xs text-muted-foreground">Jam kerja</p>
      </div>
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
