"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { id as localeId } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateFromIso, isoFromDate, labelRentang } from "@/lib/hr";
import { cn } from "@/lib/utils";

/**
 * Rentang tanggal dengan rail preset — pengganti dua kolom "Dari"/"Sampai".
 *
 * Nilainya tetap dua input tersembunyi bernama `from` dan `to`, jadi tidak ada
 * satu baris pun di sisi server yang berubah: halaman laporan tetap membaca dua
 * search param yang sama seperti sebelumnya.
 *
 * Diterapkan begitu rentangnya LENGKAP, bukan pada tiap ketukan. Klik pertama
 * pada kalender rentang hanya menetapkan ujung awal; menerapkannya saat itu juga
 * berarti memuat ulang halaman dengan periode satu hari yang tidak pernah diminta
 * siapa pun, lalu memuatnya ulang sekali lagi satu detik kemudian.
 */

/** Preset di rail kiri. Dihitung dari "hari ini" milik server, bukan jam browser. */
function presets(today: string) {
  const d = dateFromIso(today);
  const iso = isoFromDate;
  const geser = (n: number) => {
    const x = dateFromIso(today);
    x.setDate(x.getDate() + n);
    return iso(x);
  };
  const awalBulan = (offset: number) =>
    iso(new Date(d.getFullYear(), d.getMonth() + offset, 1));
  const akhirBulan = (offset: number) =>
    iso(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0));
  const kuartal = Math.floor(d.getMonth() / 3) * 3;

  return [
    { label: "Hari ini", from: today, to: today },
    { label: "7 hari terakhir", from: geser(-6), to: today },
    { label: "Bulan ini", from: awalBulan(0), to: akhirBulan(0) },
    { label: "Bulan lalu", from: awalBulan(-1), to: akhirBulan(-1) },
    {
      label: "Kuartal ini",
      from: iso(new Date(d.getFullYear(), kuartal, 1)),
      to: iso(new Date(d.getFullYear(), kuartal + 3, 0)),
    },
  ] as const;
}

export function DateRangeField({
  id,
  from,
  to,
  fromName = "from",
  toName = "to",
  today,
  className,
}: {
  id?: string;
  /** YYYY-MM-DD */
  from: string;
  to: string;
  fromName?: string;
  toName?: string;
  /** hari ini menurut server (WIB) — preset dihitung dari sini */
  today: string;
  className?: string;
}) {
  const [nilai, setNilai] = useState({ from, to });
  const [range, setRange] = useState<DateRange | undefined>({
    from: dateFromIso(from),
    to: dateFromIso(to),
  });
  const [open, setOpen] = useState(false);
  const kirim = useRef(false);
  /** ujung awal rentang yang sedang disusun; null = klik berikutnya memulai rentang baru */
  const [menyusun, setMenyusun] = useState<Date | null>(null);
  const form = useRef<HTMLInputElement>(null);

  // submit dari efek, supaya kedua input tersembunyi sudah membawa nilai barunya
  useEffect(() => {
    if (!kirim.current) return;
    kirim.current = false;
    form.current?.form?.requestSubmit();
  }, [nilai]);

  const terapkan = (f: string, t: string) => {
    kirim.current = true;
    setMenyusun(null);
    setNilai({ from: f, to: t });
    setRange({ from: dateFromIso(f), to: dateFromIso(t) });
  };

  /**
   * Pemilihan manual dikendalikan di sini, bukan diserahkan ke react-day-picker.
   *
   * Kalau rentangnya sudah lengkap, RDP tidak memulai rentang baru saat diklik —
   * ia MEMENDEKKAN yang lama dan langsung mengembalikan rentang lengkap lagi.
   * Akibatnya klik pertama pada 10 Juli menghasilkan "1–8 Juli", diterapkan saat
   * itu juga, halaman dimuat ulang, dan panelnya tertutup sebelum ujung kedua
   * sempat dipilih. Dua ketukan di sini selalu berarti dua ujung yang diminta.
   */
  const pilihHari = (hari: Date) => {
    if (!menyusun) {
      setMenyusun(hari);
      setRange({ from: hari, to: undefined });
      return;
    }
    const [a, b] = menyusun <= hari ? [menyusun, hari] : [hari, menyusun];
    terapkan(isoFromDate(a), isoFromDate(b));
  };

  const daftar = presets(today);
  const aktif = daftar.find((p) => p.from === nilai.from && p.to === nilai.to);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // menutup panel di tengah pemilihan membatalkan ujung pertama, bukan
        // menyimpannya untuk ketukan berikutnya lima menit kemudian
        if (!o && menyusun) {
          setMenyusun(null);
          setRange({
            from: dateFromIso(nilai.from),
            to: dateFromIso(nilai.to),
          });
        }
      }}
    >
      <input
        ref={form}
        type="hidden"
        name={fromName}
        value={nilai.from}
        readOnly
      />
      <input type="hidden" name={toName} value={nilai.to} readOnly />
      <PopoverTrigger
        id={id}
        className={cn(
          "bg-card border-border-strong hover:bg-accent tnum flex h-9 items-center gap-2 rounded-[9px] border px-2.5 text-[13px] transition-colors",
          className,
        )}
      >
        <CalendarDays
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
        {labelRentang(nilai.from, nilai.to)}
      </PopoverTrigger>

      <PopoverContent
        className="w-auto max-w-none flex-row gap-0 p-0"
        align="end"
      >
        {/* rail preset — pilihan yang dipakai sembilan dari sepuluh kali, supaya
            tidak ada yang perlu berhitung mundur tujuh hari sendiri */}
        <div className="flex w-[186px] shrink-0 flex-col gap-1 border-r p-3">
          {daftar.map((p) => {
            const on = aktif?.label === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => terapkan(p.from, p.to)}
                className={cn(
                  "rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-colors",
                  on
                    ? "border-primary bg-primary-subtle text-primary font-semibold"
                    : "hover:bg-accent border-transparent",
                )}
              >
                {p.label}
              </button>
            );
          })}
          <span
            className={cn(
              "rounded-[10px] border px-3 py-2.5 text-left text-[13px]",
              aktif
                ? "text-muted-foreground border-transparent"
                : "border-primary bg-primary-subtle text-primary font-semibold",
            )}
          >
            Kustom…
          </span>
        </div>

        <div className="flex flex-col">
          <Calendar
            mode="range"
            locale={localeId}
            defaultMonth={dateFromIso(nilai.from)}
            selected={range}
            onSelect={(_r, hari) => pilihHari(hari)}
            autoFocus
          />
          <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
            <span className="tnum text-muted-foreground text-[12.5px]">
              {labelRentang(nilai.from, nilai.to)}
            </span>
            {/* Rentangnya sudah diterapkan begitu lengkap; tombol ini menutup
                panelnya. Tetap ada karena rancangannya memuatnya, dan karena
                penutup yang jelas mengalahkan menebak-nebak harus mengetuk di mana. */}
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Terapkan
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
