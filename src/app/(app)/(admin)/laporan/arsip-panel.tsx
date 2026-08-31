"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Archive, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Panel } from "@/components/bits";
import { ukuranFile } from "@/lib/hr";

export type BarisArsip = {
  periode: string;
  name: string;
  url: string;
  sizeBytes: number;
  uploadedAt: Date;
  /** "Agustus 2026" — diformat di server supaya klien tidak ikut bawa formatter */
  label: string;
};

const tanggal = (d: Date) =>
  d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Arsip laporan bulanan: satu workbook Excel per bulan, berisi keenam laporan di
 * atas plus jejak kehadiran mentah.
 *
 * Client component hanya demi tombolnya — daftarnya sendiri dirender server dan
 * diserahkan sebagai prop, jadi tidak ada kueri kedua dari browser.
 */
export function ArsipPanel({
  arsip,
  bulanIni,
  bulanLalu,
}: {
  arsip: BarisArsip[];
  /** `YYYY-MM` hari ini menurut WIB — batas atas pemilih bulan */
  bulanIni: string;
  bulanLalu: string;
}) {
  const router = useRouter();
  const [periode, setPeriode] = useState(bulanLalu);
  const sudahAda = arsip.find((a) => a.periode === periode);

  const buat = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/laporan/arsip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat arsip");
      return data as { name: string; total: number; sizeBytes: number };
    },
    onSuccess: (d) => {
      toast.success(
        `${d.name} — ${d.total.toLocaleString("id-ID")} baris · ${ukuranFile(d.sizeBytes)}`,
      );
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tombol = (
    <Button
      type="button"
      size="sm"
      disabled={buat.isPending}
      // tanpa ConfirmDialog di jalur ini: kalau belum ada arsipnya, tidak ada
      // apa pun yang bisa hilang
      onClick={sudahAda ? undefined : () => buat.mutate()}
    >
      {buat.isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Archive className="size-3.5" aria-hidden />
      )}
      {sudahAda ? "Buat ulang" : "Generate sekarang"}
    </Button>
  );

  return (
    <Panel
      title="Arsip Bulanan"
      className="mt-4"
      action={
        <div className="flex items-center gap-2">
          {/* input bulan bawaan browser: tidak ada library, dan `max` yang
              membuat periode yang belum tiba tidak bisa dipilih sama sekali */}
          <input
            type="month"
            value={periode}
            max={bulanIni}
            onChange={(e) => setPeriode(e.target.value)}
            className="bg-surface-2 border-border-strong h-9 rounded-[9px] border px-2.5 text-[12.5px]"
            aria-label="Periode arsip"
          />
          {sudahAda ? (
            <ConfirmDialog
              trigger={tombol}
              title={`Timpa arsip ${sudahAda.label}?`}
              description={
                <>
                  Arsip periode itu sudah ada — dibuat {tanggal(sudahAda.uploadedAt)},{" "}
                  {ukuranFile(sudahAda.sizeBytes)} — dan akan{" "}
                  <strong>diganti permanen</strong> oleh yang baru. Satu arsip per
                  bulan; versi lamanya tidak disimpan.
                  <br />
                  <br />
                  Kalau data mentah periode ini sudah pernah dibersihkan, arsip
                  barunya akan jauh lebih kecil — dan isinya yang lama tidak bisa
                  dikembalikan.
                </>
              }
              confirmLabel="Timpa arsip"
              destructive
              onConfirm={() => buat.mutate()}
            />
          ) : (
            tombol
          )}
        </div>
      }
    >
      {arsip.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-[12.5px]">
          Belum ada arsip bulanan. Dibuat otomatis setiap awal bulan, atau buat
          sekarang lewat tombol di atas.
        </p>
      ) : (
        <ul className="divide-y">
          {arsip.map((a) => (
            <li
              key={a.periode}
              className="flex items-center gap-4 px-4 py-2.5 text-[12.5px]"
            >
              <span className="min-w-[8.5rem] font-medium">{a.label}</span>
              <span className="text-muted-foreground tnum">
                {tanggal(a.uploadedAt)}
              </span>
              <span className="text-muted-foreground tnum">
                {ukuranFile(a.sizeBytes)}
              </span>
              <Link
                href={`/api/files/${a.url}`}
                className="bg-surface-2 border-border-strong hover:bg-accent ml-auto inline-flex h-8 items-center gap-2 rounded-[9px] border px-2.5 font-medium transition-colors"
              >
                <Download className="size-3.5" aria-hidden />
                Unduh Excel
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-subtle border-t px-4 py-3 text-[11.5px]">
        Satu workbook per bulan berisi keenam laporan di atas plus jejak kehadiran
        mentah (titik absen, ping lokasi, penanda GPS palsu). Hanya terlihat oleh
        HR Admin &amp; Pimpinan — tidak muncul di Berkas karyawan.
      </p>
    </Panel>
  );
}
