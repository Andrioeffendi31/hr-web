import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Baris `settings` — satu-satunya, dan satu kali per render.
 *
 * `cache()` dari React menyatukan pemanggilan yang sama di dalam SATU render
 * pass (lihat panduan Next "caching without cache components"). Itu penting di
 * sini karena barisnya dibaca dari tempat-tempat yang tidak saling mengenal:
 * layout aplikasi, halaman kehadiran, dan `mulaiCatat()` di lib/kehadiran —
 * tiga kueri untuk satu baris yang sama, dan tiap kueri adalah satu perjalanan
 * bolak-balik ke Neon.
 *
 * BUKAN `unstable_cache`: nilainya tidak boleh bertahan melewati satu
 * permintaan. Shift dan toleransi diubah lewat /pengaturan, dan menyajikan
 * versi lamanya sesudah itu berarti menghitung keterlambatan dengan aturan yang
 * sudah tidak berlaku.
 */
export const bacaSettings = cache(async () => {
  const [row] = await db.select().from(settings).limit(1);
  return row;
});
