"use client";

import { useState } from "react";

/**
 * Menutup dialog yang keberadaannya ditentukan URL (`?open=<id>`), tanpa menunggu
 * server dan tanpa memuatnya ulang.
 *
 * Dulu `onOpenChange` langsung `router.push(backHref)`, dan karena dialognya
 * tertutup HANYA saat komponennya lepas, ia tetap terpampang sampai server selesai
 * merender ulang seluruh halaman — belasan kueri ke Neon, tiap kali. Di layar itu
 * terasa seperti aplikasi yang menggantung pada tindakan yang seharusnya gratis.
 *
 * Sekarang keadaan tampil dipegang lokal: `false` menutupnya seketika berikut
 * animasinya, dan URL-nya dirapikan lewat History API — bukan `router.push`, yang
 * tetap menagih satu render server penuh meski hasilnya adalah halaman yang sudah
 * terpampang di layar. Menutup dialog tidak mengubah apa pun di halaman di
 * belakangnya, jadi tidak ada yang perlu diambil ulang; yang butuh data baru
 * (menyetujui, mengedit jam) sudah memanggil `router.refresh()` sendiri.
 *
 * `pushState`, bukan `replaceState`: tombol Kembali tetap membuka lagi dialognya,
 * persis seperti sebelum ini.
 */
export function useTutupDialog(backHref: string) {
  const [tampil, setTampil] = useState(true);

  return {
    tampil,
    tutup: (open: boolean) => {
      if (open) return;
      setTampil(false);
      // didukung resmi App Router: URL berubah, tree-nya tidak diambil ulang
      window.history.pushState(null, "", backHref);
    },
  };
}
