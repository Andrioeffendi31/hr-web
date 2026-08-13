"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Clock,
  FolderClosed,
  Megaphone,
  Search,
  Timer,
  Users,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { AttBadge, Pill } from "@/components/bits";
import type { SearchHit } from "@/app/api/search/route";
import { type AttStatus, initials } from "@/lib/hr";

const PAGES = [
  { href: "/kehadiran", label: "Kehadiran", icon: Clock },
  { href: "/cuti", label: "Cuti & Izin", icon: CalendarDays },
  { href: "/lembur", label: "Lembur", icon: Timer },
  { href: "/karyawan", label: "Karyawan", icon: Users },
  { href: "/pengumuman", label: "Pengumuman", icon: Megaphone },
  { href: "/berkas", label: "Berkas", icon: FolderClosed },
  { href: "/laporan", label: "Laporan", icon: BarChart3 },
];

/** Debounce so typing doesn't fire a request per keystroke. */
function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const enabled = debounced.trim().length >= 2;
  const { data, isFetching } = useQuery<{ hits: SearchHit[] }>({
    queryKey: ["search", debounced.trim()],
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep old rows visible while refetching
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debounced.trim())}`,
        {
          signal,
        },
      );
      if (!res.ok) throw new Error("Pencarian gagal");
      return (await res.json()) as { hits: SearchHit[] };
    },
  });

  const go = (href: string) => {
    setOpen(false);
    setTerm("");
    router.push(href);
  };

  const hits = data?.hits ?? [];
  const pages = term.trim()
    ? PAGES.filter((p) =>
        p.label.toLowerCase().includes(term.trim().toLowerCase()),
      )
    : PAGES;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-surface-2 text-subtle hover:text-foreground hover:border-border-strong ml-auto flex h-[34px] w-[34px] items-center justify-center gap-2 rounded-[9px] border transition-colors sm:w-full sm:max-w-[260px] sm:justify-start sm:px-2.5"
      >
        <Search className="size-[15px] shrink-0" aria-hidden />
        <span className="hidden text-[13px] sm:inline">Cari karyawan…</span>
        <kbd className="bg-muted text-subtle ml-auto hidden rounded px-1.5 py-0.5 font-mono text-[10.5px] sm:inline">
          ⌘K
        </kbd>
        <span className="sr-only">Buka pencarian</span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Pencarian"
        description="Cari karyawan berdasarkan nama, NIK, divisi, atau jabatan."
        className="top-[12%] translate-y-0 sm:max-w-[580px]"
      >
        {/* This CommandDialog only renders a Dialog, so the Command context has
            to be supplied here. shouldFilter=false because rows arrive already
            ranked from the server — cmdk's own fuzzy filter would drop hits
            that matched on NIK or division rather than name. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Cari nama, NIK, divisi, atau jabatan…"
          />
          <CommandList>
            {enabled && !isFetching && hits.length === 0 && (
              <CommandEmpty>Tidak ada karyawan yang cocok.</CommandEmpty>
            )}

            {hits.length > 0 && (
              <CommandGroup
                heading={`Karyawan${isFetching ? " · memuat…" : ""}`}
              >
                {hits.map((h) => (
                  <CommandItem
                    key={h.id}
                    value={`emp-${h.id}`}
                    onSelect={() => go(`/karyawan?open=${h.id}`)}
                    className="gap-3"
                  >
                    <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
                      {initials(h.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {h.name}
                        {!h.active && (
                          <span className="text-subtle font-normal">
                            {" "}
                            · tidak aktif
                          </span>
                        )}
                      </span>
                      <span className="text-subtle block truncate text-[11px]">
                        {h.nik} · {h.division} · {h.position}
                      </span>
                    </span>
                    {h.pendingCuti > 0 && (
                      <Pill tone="warning">{h.pendingCuti} cuti</Pill>
                    )}
                    {h.pendingLembur > 0 && (
                      <Pill tone="warning">{h.pendingLembur} lembur</Pill>
                    )}
                    <AttBadge status={h.status as AttStatus} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!enabled && term.trim().length === 1 && (
              <div className="text-subtle px-3 py-6 text-center text-[12.5px]">
                Ketik minimal 2 karakter untuk mencari karyawan.
              </div>
            )}

            {pages.length > 0 && (
              <>
                {hits.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Halaman">
                  {pages.map((p) => (
                    <CommandItem
                      key={p.href}
                      value={`page-${p.href}`}
                      onSelect={() => go(p.href)}
                      className="gap-2.5"
                    >
                      <p.icon className="size-4 shrink-0" aria-hidden />
                      <span className="text-[13px]">{p.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
