"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Clock,
  FolderClosed,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Sun,
  Timer,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SearchDialog } from "@/components/search-dialog";
import { initials } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";

export type NavBadges = {
  belumAbsen: number;
  cutiPending: number;
  lemburPending: number;
};

const GROUPS = [
  {
    label: "Operasional Harian",
    items: [
      { href: "/kehadiran", label: "Kehadiran", icon: Clock, badge: "belumAbsen" },
      { href: "/cuti", label: "Cuti", icon: CalendarDays, badge: "cutiPending" },
      { href: "/lembur", label: "Lembur", icon: Timer, badge: "lemburPending" },
    ],
  },
  {
    label: "Data & Informasi",
    items: [
      { href: "/karyawan", label: "Karyawan", icon: Users },
      { href: "/pengumuman", label: "Pengumuman", icon: Megaphone },
      { href: "/berkas", label: "Berkas", icon: FolderClosed },
      { href: "/laporan", label: "Laporan", icon: BarChart3 },
    ],
  },
] as const;

const TITLES: Record<string, [string, string]> = {
  "/kehadiran": ["Kehadiran", "papan absensi harian & rekap bulanan"],
  "/cuti": ["Cuti & Izin", "antrian persetujuan dan saldo cuti"],
  "/lembur": ["Lembur", "pengajuan, durasi, dan estimasi biaya"],
  "/karyawan": ["Karyawan", "data kepegawaian & riwayat kehadiran"],
  "/pengumuman": ["Pengumuman", "informasi internal untuk karyawan"],
  "/berkas": ["Berkas", "dokumen pribadi & perusahaan"],
  "/laporan": ["Laporan", "rekap siap audit, unduh sebagai CSV"],
};

function NavList({
  badges,
  liveLabel,
  onNavigate,
}: {
  badges: NavBadges;
  liveLabel: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="text-subtle px-2.5 pt-3.5 pb-1 text-[10px] font-semibold tracking-[0.09em] uppercase">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = pathname === item.href;
            const count =
              "badge" in item ? badges[item.badge as keyof NavBadges] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors md:min-h-0",
                  active
                    ? "bg-primary-subtle text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-[17px] shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {count > 0 && (
                  <span className="bg-danger-subtle text-danger tnum rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-2.5 pt-3.5">
        <div className="bg-card flex items-start gap-2 rounded-[11px] border p-3">
          <span
            className="bg-success mt-1.5 size-[7px] shrink-0 animate-pulsedot rounded-full"
            aria-hidden
          />
          <span className="text-muted-foreground text-[11.5px] leading-snug">
            {liveLabel}
          </span>
        </div>
      </div>
    </>
  );
}

export function Shell({
  children,
  badges,
  liveLabel,
  companyName,
  user,
}: {
  children: React.ReactNode;
  badges: NavBadges;
  liveLabel: string;
  companyName: string;
  user: { name: string; position: string };
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useUi();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [title, sub] = TITLES[pathname] ?? ["Ruang HR", ""];

  const brand = (
    <div className="flex items-center gap-2.5 px-2 pt-1 pb-4">
      <div className="bg-primary shadow-sm flex size-[30px] shrink-0 items-center justify-center rounded-lg">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4H13a5 5 0 0 1 1.4 9.8L19 20h-3.4l-4-6H8v6H5Z"
            fill="#fff"
          />
        </svg>
      </div>
      <div className="min-w-0 leading-tight">
        <div className="font-heading text-[14.5px] font-bold tracking-tight">
          Ruang<span className="text-subtle font-semibold"> HR</span>
        </div>
        <div className="text-subtle truncate font-mono text-[10px]">
          {companyName}
        </div>
      </div>
    </div>
  );

  const userBlock = (
    <div className="flex items-center gap-2.5 border-t px-2 pt-2.5 pb-0.5">
      <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {initials(user.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{user.name}</div>
        <div className="text-subtle text-[11px]">{user.position}</div>
      </div>
      <Link
        href="/api/auth/signout"
        aria-label="Keluar dari akun"
        className="text-subtle hover:text-foreground hover:bg-accent flex size-9 items-center justify-center rounded-lg transition-colors"
      >
        <LogOut className="size-4" aria-hidden />
      </Link>
    </div>
  );

  return (
    <div className="bg-background flex h-dvh overflow-hidden">
      <aside className="bg-sidebar hidden w-[228px] shrink-0 flex-col overflow-y-auto border-r px-3 py-4 md:flex">
        {brand}
        <NavList badges={badges} liveLabel={liveLabel} />
        {userBlock}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              aria-label="Buka menu navigasi"
              className="hover:bg-accent -ml-1 flex size-10 items-center justify-center rounded-lg md:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[262px] flex-col px-3 py-4">
              <SheetTitle className="sr-only">Navigasi</SheetTitle>
              {brand}
              <NavList
                badges={badges}
                liveLabel={liveLabel}
                onNavigate={() => setMobileOpen(false)}
              />
              {userBlock}
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 shrink items-baseline gap-2">
            <span className="font-heading truncate text-[15px] font-semibold">
              {title}
            </span>
            <span className="text-subtle hidden truncate text-xs lg:inline">
              {sub}
            </span>
          </div>

          <SearchDialog />

          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Aktifkan mode gelap" : "Aktifkan mode terang"}
            className="bg-surface-2 text-muted-foreground hover:text-foreground flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border transition-colors"
          >
            {theme === "light" ? (
              <Moon className="size-4" aria-hidden />
            ) : (
              <Sun className="size-4" aria-hidden />
            )}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pt-5 pb-14 md:px-6 md:pt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="mx-auto max-w-[1360px]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
