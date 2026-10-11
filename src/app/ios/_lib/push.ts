/**
 * Langganan Web Push PWA. Di iOS ini hanya tersedia sejak 16.4 dan HANYA saat
 * aplikasi dibuka dari Home Screen (mode standalone) — di tab Safari biasa
 * `PushManager` memang tidak ada.
 */
import { useSyncExternalStore } from "react";

export type PushState = "unsupported" | "denied" | "default" | "granted";

const EVT = "nanumhr:push";

/** Izin notifikasi sebagai state React. Berubah lewat aktifkanPush(), atau dari
 *  Pengaturan iPhone — yang terakhir terbaca saat aplikasi kembali ke layar. */
export function usePushState() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVT, cb);
      document.addEventListener("visibilitychange", cb);
      return () => {
        window.removeEventListener(EVT, cb);
        document.removeEventListener("visibilitychange", cb);
      };
    },
    pushState,
    () => "unsupported" as PushState,
  );
}

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const pushState = (): PushState =>
  !pushSupported() ? "unsupported" : (Notification.permission as PushState);

export async function daftarkanSW() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/ios/sw.js", {
    scope: "/ios/",
    updateViaCache: "none",
  });
}

/**
 * Registrasi yang sudah aktif. Bukan `navigator.serviceWorker.ready`: itu hanya
 * selesai untuk SW yang mengendalikan halaman INI, dan `/ios` (tanpa garis
 * miring) berada di luar cakupan `/ios/` — ia akan menunggu selamanya.
 */
async function siap() {
  const reg = await daftarkanSW();
  if (!reg) return null;
  if (reg.active) return reg;
  const sw = reg.installing ?? reg.waiting;
  if (!sw) return reg;
  await new Promise<void>((resolve) => {
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") resolve();
    });
  });
  return reg;
}

function kunci(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Minta izin lalu daftarkan langganan ke server. HARUS dipanggil dari ketukan
 * pengguna: iOS menolak `requestPermission()` yang tidak berasal dari gestur.
 */
export async function aktifkanPush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const perm = await Notification.requestPermission();
  window.dispatchEvent(new Event(EVT));
  if (perm !== "granted") return perm as PushState;
  await sinkronkanLangganan();
  return "granted";
}

/** Pastikan langganan yang ada tercatat di server (dipanggil tiap aplikasi
 *  dibuka; upsert, jadi aman diulang). */
export async function sinkronkanLangganan() {
  if (pushState() !== "granted") return;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return;
  const reg = await siap();
  if (!reg) return;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: kunci(key),
    }));
  await fetch("/api/me/push/web", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
}

/** Saat keluar: lepas langganan di perangkat dan di server. */
export async function lepasPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/ios/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/me/push/web", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
