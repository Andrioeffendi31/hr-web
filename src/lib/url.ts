/**
 * Origin publik aplikasi ini — dasar setiap tautan yang dikirim lewat email.
 *
 * Urutannya penting. `AUTH_URL` menang karena itu satu-satunya yang dinyatakan
 * manusia; sesudahnya Vercel menyediakan sendiri dua nama host, dan memakainya
 * berarti lupa mengisi env var tidak lagi berujung pada tautan `localhost` yang
 * dikirim ke kotak masuk orang sungguhan — persis yang terjadi pada email reset
 * kata sandi pertama di produksi.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` sebelum `VERCEL_URL`: yang kedua berubah tiap
 * deploy, dan tautan reset yang menunjuk ke URL deployment lama akan mati begitu
 * deployment itu dihapus — tautannya berlaku satu jam, tapi tidak ada gunanya
 * menaruh tanggal kedaluwarsa kedua yang tidak diketahui siapa pun.
 */
export function baseUrl(): string {
  const dari =
    process.env.AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
  return dari.replace(/\/$/, "");
}

