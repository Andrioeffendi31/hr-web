import type { Office } from "./api";

export type Fix = { lat: number; lng: number; accuracy: number };

/**
 * Satu fix GPS. Di PWA iOS ini HANYA berhasil saat aplikasi sedang terbuka —
 * itulah seluruh alasan pengingat push 2-jaman ada.
 */
export function ambilLokasi(timeout = 15_000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Perangkat ini tidak mendukung lokasi."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: Math.round(p.coords.latitude * 1e6) / 1e6,
          lng: Math.round(p.coords.longitude * 1e6) / 1e6,
          accuracy: p.coords.accuracy,
        }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Izin lokasi ditolak. Buka Pengaturan iPhone › Privasi › Layanan Lokasi, lalu izinkan untuk NanumHR."
              : e.code === e.TIMEOUT
                ? "Lokasi terlalu lama ditemukan. Coba di tempat terbuka, lalu ulangi."
                : "Lokasi tidak bisa ditemukan. Pastikan Layanan Lokasi menyala.",
          ),
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}

/** Haversine, meter — sama dengan jarakMeter() di server. */
export function jarakMeter(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function terdekat(offices: Office[], fix: Fix) {
  return offices
    .map((o) => ({ office: o, meter: jarakMeter(fix.lat, fix.lng, o.lat, o.lng) }))
    .sort((a, b) => a.meter - b.meter)[0];
}
