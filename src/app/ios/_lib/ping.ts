import { PING_GAP_MS } from "./shared";
import { ambilLokasi } from "./geo";

const LAST_KEY = "nanumhr.ios.last-ping";

export type HasilPing =
  | { kind: "ok"; outside: boolean }
  | { kind: "sudah"; nextAt: string | null }
  | { kind: "gagal"; message: string };

/** Sudah waktunya mengirim lagi? Dibaca dari localStorage supaya membuka
 *  aplikasi berkali-kali tidak menghasilkan permintaan yang pasti ditolak. */
export const pingJatuhTempo = () => {
  const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
  return Date.now() - last >= PING_GAP_MS;
};

/**
 * Ambil lokasi lalu kirim ke /api/attendance/ping sebagai ping PWA. Dipanggil
 * saat pengingat diketuk (`/ios?ping=1`), saat aplikasi dibuka kembali, dan dari
 * tombol "Kirim lokasi sekarang".
 */
export async function kirimLokasi(): Promise<HasilPing> {
  let fix;
  try {
    fix = await ambilLokasi();
  } catch (e) {
    return { kind: "gagal", message: (e as Error).message };
  }

  let res: Response;
  try {
    res = await fetch("/api/attendance/ping", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: fix.lat, lng: fix.lng, source: "pwa" }),
    });
  } catch {
    return { kind: "gagal", message: "Tidak ada koneksi. Lokasi belum terkirim." };
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    outside?: boolean;
    nextAllowedAt?: string;
  };

  if (res.ok) {
    localStorage.setItem(LAST_KEY, String(Date.now()));
    return { kind: "ok", outside: !!data.outside };
  }
  if (res.status === 409) {
    // sudah ada ping yang cukup baru — bagi orangnya ini bukan kegagalan
    localStorage.setItem(LAST_KEY, String(Date.now()));
    return { kind: "sudah", nextAt: data.nextAllowedAt ?? null };
  }
  return { kind: "gagal", message: data.error ?? "Lokasi gagal dikirim." };
}
