import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

export default async function IosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ua = (await headers()).get("user-agent") ?? "";
  if (/Android/i.test(ua)) redirect(PLAY_STORE);

  // iPadOS 13+ mengaku sebagai Mac; hanya layar sentuh yang bisa membedakannya,
  // dan itu baru diketahui di klien
  const kind = /iPhone|iPad|iPod/.test(ua)
    ? "ios"
    : /Macintosh/.test(ua)
      ? "mac"
      : "other";

  return (
    <IosGate kind={kind} dev={process.env.NODE_ENV === "development"}>
      {children}
    </IosGate>
  );
}
