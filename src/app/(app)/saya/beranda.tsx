"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, FolderClosed, MapPin, Timer } from "lucide-react";
import { Panel, Stat } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { durasi, jam, tanggalPanjang } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { ClockDialog } from "./clock-dialog";

/** Mirrors mobile/src/api.ts Bootstrap — the same endpoint feeds both. */
export type Bootstrap = {
  profile: { id: number; nik: string; name: string; initials: string; division: string };
  today: {
    date: string;
    clockIn: string | null;
    clockOut: string | null;
    status: string;
    location: string | null;
    officeId: number | null;
  };
  shift: { start: string; end: string; toleranceMinutes: number };
  offices: { id: number; name: string; lat: number; lng: number; radiusM: number }[];
  defaultOfficeId: number | null;
  leave: { remaining: number; quota: number; used: number; expiresAt: string };
  overtime: { minutes: number; capHours: number };
  announcements: { id: number; title: string; category: string; date: string }[];
  team: { total: number; present: number; avatars: { id: number; initials: string }[] };
};

const QUICK = [
  { href: "/saya/pengajuan?tab=cuti", label: "Ajukan cuti", icon: CalendarDays },
  { href: "/saya/pengajuan?tab=lembur", label: "Ajukan lembur", icon: Timer },
  { href: "/saya/kehadiran", label: "Riwayat absen", icon: Clock },
  { href: "/saya/berkas", label: "Berkas saya", icon: FolderClosed },
] as const;

/** WIB, like every other clock in this app. */
const jamWib = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

/**
 * The wall clock as an external store rather than state-in-an-effect.
 *
 * Time genuinely is an external system, which is what useSyncExternalStore is
 * for: it gives the server a fixed placeholder so hydration cannot mismatch, and
 * the snapshot is cached in `now` because getSnapshot must return a stable value
 * within a render — calling `jamWib()` there would hand React a different string
 * whenever the second happened to roll over mid-render.
 */
let now = "--:--:--";
const subscribeClock = (onChange: () => void) => {
  now = jamWib();
  const t = setInterval(() => {
    now = jamWib();
    onChange();
  }, 1000);
  return () => clearInterval(t);
};

export function Beranda() {
  const [open, setOpen] = useState(false);
  const clock = useSyncExternalStore(
    subscribeClock,
    () => now,
    () => "--:--:--",
  );

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Gagal memuat data Anda");
      return (await res.json()) as Bootstrap;
    },
  });

  if (me.isPending) {
    return <div className="text-muted-foreground p-6 text-[13px]">Memuat…</div>;
  }
  if (me.isError || !me.data) {
    return (
      <Panel>
        <p className="text-muted-foreground p-6 text-[13px]">
          {(me.error as Error)?.message ?? "Gagal memuat data Anda."}
        </p>
      </Panel>
    );
  }

  const d = me.data;
  const clockedIn = Boolean(d.today.clockIn && !d.today.clockOut);
  const done = Boolean(d.today.clockOut);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Status hari ini"
          value={done ? "Selesai" : clockedIn ? "Sudah absen" : "Belum absen"}
          sub={tanggalPanjang(d.today.date)}
          tone={done ? "neutral" : clockedIn ? "success" : "warning"}
        />
        <Stat label="Sisa cuti" value={d.leave.remaining} sub={`dari ${d.leave.quota} hari`} />
        <Stat
          label="Lembur bulan ini"
          value={durasi(d.overtime.minutes)}
          sub={`batas ${d.overtime.capHours} jam/minggu`}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Panel title="Absensi" className="min-w-0 flex-1 basis-[380px]">
          <div className="flex flex-col items-center px-5 py-6">
            <p className="text-subtle text-[12px]">
              Shift {d.shift.start}–{d.shift.end} · toleransi {d.shift.toleranceMinutes} menit
            </p>
            <p className="tnum my-1.5 text-[34px] leading-none font-semibold">{clock}</p>

            <p
              className={cn(
                "mb-5 text-center text-[12.5px]",
                clockedIn ? "text-success font-medium" : "text-muted-foreground",
              )}
            >
              {done
                ? `Absen ${jam(d.today.clockIn)} – ${jam(d.today.clockOut)} · selesai hari ini`
                : clockedIn
                  ? `Absen masuk ${jam(d.today.clockIn)} · ${d.today.location ?? "lokasi tidak dicatat"}`
                  : "Belum absen masuk hari ini"}
            </p>

            {done ? (
              <Button className="w-full" size="lg" disabled>
                Absen hari ini selesai
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                variant={clockedIn ? "destructive" : "default"}
                onClick={() => setOpen(true)}
              >
                {clockedIn ? "Absen keluar" : "Absen masuk sekarang"}
              </Button>
            )}

            <p className="text-subtle mt-3 flex items-center gap-1.5 text-[11.5px]">
              <MapPin className="size-3.5" aria-hidden />
              {d.offices.length === 0
                ? "Belum ada titik absen · absen harus ditandai WFH"
                : d.offices.length === 1
                  ? `${d.offices[0].name} · radius ${d.offices[0].radiusM} m`
                  : `${d.offices.length} titik absen tersedia`}
            </p>
          </div>
        </Panel>

        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
          <Panel title="Aksi cepat">
            <div className="grid grid-cols-2 gap-2 p-3">
              {QUICK.map((q) => (
                <Link
                  key={q.href}
                  href={q.href}
                  className="bg-surface-2 hover:bg-accent flex min-h-[64px] flex-col justify-center gap-1.5 rounded-[11px] border px-3 py-2.5 text-[12.5px] font-medium transition-colors"
                >
                  <q.icon className="text-primary size-4" aria-hidden />
                  {q.label}
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title={`Rekan hadir hari ini (${d.team.present}/${d.team.total})`}>
            <div className="flex flex-wrap gap-1.5 p-4">
              {d.team.avatars.length === 0 ? (
                <p className="text-muted-foreground text-[12.5px]">
                  Belum ada yang absen masuk.
                </p>
              ) : (
                d.team.avatars.map((a) => (
                  <span
                    key={a.id}
                    className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-[11px] font-semibold"
                  >
                    {a.initials}
                  </span>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {d.announcements.length > 0 && (
        <Panel title="Pengumuman terbaru" className="mt-4">
          <ul className="divide-y">
            {d.announcements.slice(0, 3).map((a) => (
              <li key={a.id} className="px-4 py-2.5">
                <div className="text-[13px] font-medium">{a.title}</div>
                <div className="text-subtle text-[11.5px]">
                  {a.category} · {a.date}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t px-4 py-2.5">
            <Link
              href="/saya/pengumuman"
              className="text-primary text-[12.5px] font-medium hover:underline"
            >
              Lihat semua pengumuman ↗
            </Link>
          </div>
        </Panel>
      )}

      {open && <ClockDialog data={d} onClose={() => setOpen(false)} />}
    </>
  );
}
