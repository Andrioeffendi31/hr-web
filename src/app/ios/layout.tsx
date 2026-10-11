import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PERUSAHAAN } from "@/lib/hr";
import { PLAY_STORE } from "./_lib/shared";
import { IosGate } from "./gate";

/**
 * PWA karyawan untuk iPhone (/ios).
 *
 * Android punya aplikasinya sendiri di Google Play, dan perangkat Android yang
 * membuka URL ini dikirim ke sana. Pemeriksaannya dari user-agent, jadi ia
 * PENGARAH, bukan pengaman: setiap data tetap dijaga sesi di /api/me/*.
 */
export const metadata: Metadata = {
  title: "NanumHR",
  manifest: "/ios/manifest.webmanifest",
  appleWebApp: { capable: true, title: "NanumHR", statusBarStyle: "default" },
  icons: { apple: "/ios/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" },
  ],
};

/**
 * Saklar kunci iOS. Kuncinya AKTIF secara default: Android dikirim ke Google
 * Play dan desktop ditolak. Isi `PWA_KUNCI_IOS=0` di Vercel (lalu redeploy)
 * hanya untuk uji coba dari perangkat non-iOS.
 */
const kunciIos = () => process.env.PWA_KUNCI_IOS !== "0";

export default async function IosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kunci = kunciIos();
  const ua = (await headers()).get("user-agent") ?? "";
  if (kunci && /Android/i.test(ua)) redirect(PLAY_STORE);

  // iPadOS 13+ mengaku sebagai Mac; hanya layar sentuh yang bisa membedakannya,
  // dan itu baru diketahui di klien
  const kind = /iPhone|iPad|iPod/.test(ua)
    ? "ios"
    : /Macintosh/.test(ua)
      ? "mac"
      : "other";

  return (
    <IosGate kind={kind} bebas={!kunci || process.env.NODE_ENV === "development"} perusahaan={PERUSAHAAN}>
      {children}
    </IosGate>
  );
}
