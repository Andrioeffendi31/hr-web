"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Menutup dialog yang keberadaannya ditentukan URL (`?open=<id>`), tanpa menunggu
 * server.
 *
 * Dulu `onOpenChange` langsung `router.push(backHref)`, dan karena dialognya
 * tertutup HANYA saat komponennya lepas, ia tetap terpampang sampai server selesai
 * merender ulang seluruh halaman — belasan kueri ke Neon, tiap kali. Di layar itu
 * terasa seperti aplikasi yang menggantung pada tindakan yang seharusnya gratis.
 *
 * Sekarang keadaan tampil dipegang lokal: `false` menutupnya seketika berikut
 * animasinya, dan navigasinya berjalan di belakang sebagai transisi. URL-nya tetap
 * ikut berubah, jadi tautan-dalam, tombol Kembali, dan muat ulang tetap sama
 * perilakunya — yang hilang cuma penantiannya.
 */
export function useTutupDialog(backHref: string) {
  const [tampil, setTampil] = useState(true);
  const [, mulai] = useTransition();
  const router = useRouter();

  return {
    tampil,
    tutup: (open: boolean) => {
      if (open) return;
      setTampil(false);
      mulai(() => router.push(backHref));
    },
  };
}
