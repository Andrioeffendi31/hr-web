/**
 * Manifest PWA iOS — sengaja hanya untuk /ios, bukan app/manifest.ts di akar.
 *
 * Manifest di akar akan ditautkan ke SETIAP halaman, termasuk konsol HR, dan
 * menjadikan konsol itu ikut "terpasang" sebagai app karyawan. Yang dipasang ke
 * Home Screen hanya /ios.
 */
export function GET() {
  return Response.json(
    {
      id: "/ios",
      name: "NanumHR",
      short_name: "NanumHR",
      description: "Absensi, cuti, dan lembur karyawan.",
      lang: "id",
      start_url: "/ios",
      scope: "/ios",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f3f5f9",
      theme_color: "#f3f5f9",
      icons: [
        { src: "/ios/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/ios/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/ios/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
