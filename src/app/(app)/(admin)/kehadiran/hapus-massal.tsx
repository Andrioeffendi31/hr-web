"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/reason-dialog";
import { usePilihan } from "./pilihan";

/**
 * Checkbox pemilih satu baris papan.
 *
 * Dirender di dalam sel DataTable, yang server component — karena itu state-nya
 * ada di store zustand dan bukan di prop: tidak ada tempat untuk mengalirkannya
 * dari atas tanpa mengubah tabelnya sendiri.
 *
 * `<input type="checkbox">` biasa, bukan primitif baru: tidak ada checkbox.tsx
 * di components/ui, dan satu kontrol tidak cukup alasan untuk menambahnya.
 */
export function PilihBaris({
  attendanceId,
  nama,
}: {
  attendanceId: number | null;
  nama: string;
}) {
  const { ids, toggle } = usePilihan();
  // hari tanpa baris absensi tidak punya apa pun untuk dihapus
  if (attendanceId === null) return null;
  return (
    <input
      type="checkbox"
      checked={ids.has(attendanceId)}
      onChange={() => toggle(attendanceId)}
      aria-label={`Pilih kehadiran ${nama}`}
      className="border-border-strong accent-primary size-4 cursor-pointer rounded-[4px] border"
    />
  );
}

/**
 * Bilah aksi yang muncul begitu ada baris tercentang.
 *
 * Ia juga yang MENGOSONGKAN pilihan setiap kali tampilan papan berubah. Tanggal,
 * divisi, status, halaman, dan urutan semuanya hidup di URL, jadi satu efek atas
 * `useSearchParams()` menutup seluruhnya. Tanpa itu, mencentang dua baris di
 * halaman 1 lalu pindah ke halaman 2 menyisakan pilihan yang tidak terlihat lagi
 * di layar — dan yang terhapus adalah baris yang tidak sedang dilihat siapa pun.
 */
export function BilahHapus() {
  const router = useRouter();
  const sp = useSearchParams();
  const { ids, kosongkan } = usePilihan();
  const kunci = sp.toString();

  useEffect(() => {
    kosongkan();
  }, [kunci, kosongkan]);

  const m = useMutation({
    mutationFn: async (alasan: string) => {
      const res = await fetch("/api/attendance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...ids], alasan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus kehadiran");
      return data as { dihapus: number; objek: number };
    },
    onSuccess: ({ dihapus, objek }) => {
      toast.success(
        `${dihapus} kehadiran dihapus` +
          (objek ? ` · ${objek} foto ikut dihapus` : ""),
      );
      kosongkan();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ids.size === 0) return null;

  return (
    <div className="bg-card fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[min(92vw,32rem)] items-center gap-3 rounded-[12px] border px-4 py-3 shadow-lg">
      <span className="text-[13px] font-medium">
        {ids.size} kehadiran dipilih
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={kosongkan}
          className="text-muted-foreground hover:text-foreground h-9 px-2 text-[12.5px] font-medium transition-colors"
        >
          Batal
        </button>
        <ReasonDialog
          trigger={
            <button
              type="button"
              disabled={m.isPending}
              className="border-danger/40 text-danger hover:bg-danger/10 h-9 rounded-[9px] border px-3 text-[12.5px] font-medium transition-colors disabled:opacity-50"
            >
              Hapus
            </button>
          }
          title={`Hapus ${ids.size} kehadiran?`}
          description={
            <>
              Menghapus <strong>permanen</strong> jam, status, lokasi, alasan,
              keputusan tinjauan, dan seluruh jejak GPS berikut fotonya untuk{" "}
              {ids.size} hari yang dipilih. Tidak bisa dibatalkan — yang
              tertinggal hanya catatan di log audit.
            </>
          }
          label="Alasan penghapusan"
          placeholder="mis. baris uji, atau tercatat untuk orang yang salah"
          required
          confirmLabel={`Hapus ${ids.size} permanen`}
          onSubmit={(alasan) => m.mutate(alasan)}
        />
      </div>
    </div>
  );
}
