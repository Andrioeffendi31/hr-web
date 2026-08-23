"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Menyegarkan daftar pengumuman sesudah sebuah perubahan — dua langkah, dan
 * keduanya perlu.
 *
 * `router.refresh()` menjalankan ulang komponen server halamannya, tapi daftarnya
 * dipegang react-query lewat `useInfiniteFeed`: begitu query-nya ter-mount,
 * cache-nya menang atas `initialData` yang dikirim server. Jadi refresh saja
 * membuat perubahan tidak terlihat sampai halamannya dimuat ulang penuh — itu
 * persis bug "sematkan tidak terupdate" yang harus di-refresh manual.
 *
 * Satu hook, bukan disalin ke tiap tombol: sematkan, ubah, dan hapus sama-sama
 * membutuhkannya, dan tombol berikutnya akan melupakannya lagi.
 */
export function useSegarkanPengumuman() {
  const router = useRouter();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["feed", "pengumuman"] });
    router.refresh();
  };
}
