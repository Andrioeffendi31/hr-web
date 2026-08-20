import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tanda tangan digital surat izin — HMAC, bukan token yang disimpan.
 *
 * Pola token di lib/reset.ts dan lib/webauthn.ts (acak, sha256-nya disimpan,
 * dikonsumsi dengan DELETE ... RETURNING) cocok untuk tautan sekali pakai dan
 * SALAH untuk surat: surat dicetak sekali lalu diperiksa berkali-kali selama
 * bertahun-tahun, oleh orang yang tidak punya akun di sini. Karena itu tandanya
 * stateless — tidak ada baris yang bisa kadaluarsa, hilang saat migrasi, atau
 * membuat surat yang sudah di tangan orang berhenti bisa diperiksa.
 *
 * Yang menentukan surat itu SAH bukan tanda ini, melainkan status pengajuannya
 * saat dipindai, yang dibaca segar dari database. Tanda ini hanya menjawab satu
 * pertanyaan: apakah nomor pengajuan ini benar-benar diterbitkan oleh sistem ini.
 */

/** Rahasianya: satu-satunya yang dijamin ada di setiap lingkungan, karena
 *  Auth.js menolak berjalan tanpanya. Sengaja TIDAK punya nilai cadangan —
 *  kunci tanda tangan yang punya default adalah kunci yang bisa dikarang. */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET belum diisi; surat tidak bisa ditandatangani");
  return s;
}

/** 16 byte cukup: 128 bit, dan tandanya ikut tercetak di URL di bawah QR. */
const sign = (id: number) =>
  createHmac("sha256", secret())
    .update(`cuti:${id}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");

/** `12-Ab3…` — nomor pengajuan, lalu tandanya. Nomornya tampak, dan memang tidak
 *  rahasia; yang tidak bisa dikarang adalah tanda di belakangnya. */
export const tokenSurat = (id: number) => `${id}-${sign(id)}`;

/**
 * Nomor pengajuan dari token, atau `null` kalau tandanya tidak cocok.
 *
 * Mengembalikan null, tidak melempar: pemanggilnya adalah rute publik yang harus
 * menjawab 404 untuk token ngawur, dan galat yang naik ke atas akan menjadi 500
 * yang memberi tahu penebak bahwa ia sedang menebak sesuatu yang ada.
 */
export function idDariToken(token: string): number | null {
  const potong = token.indexOf("-");
  if (potong < 1) return null;
  const id = Number(token.slice(0, potong));
  if (!Number.isInteger(id) || id < 1) return null;
  /**
   * Dibandingkan sebagai TEKS, bukan sebagai byte hasil decode base64url.
   *
   * 22 karakter base64url membawa 132 bit untuk tanda yang hanya 128 bit, jadi
   * empat bit terakhir tidak bermakna: mengubah karakter TERAKHIR token tetap
   * menghasilkan 16 byte yang sama, dan perbandingan byte akan menerimanya.
   * Tidak berbahaya (bit itu tidak memuat informasi), tapi berarti satu token
   * punya beberapa bentuk — dan token yang punya beberapa bentuk membuat setiap
   * uji, log, dan laporan "tautan ini tidak sama" jadi sulit dipercaya.
   * Membandingkan teksnya membuat bentuknya tunggal.
   */
  const diberi = Buffer.from(token);
  const benar = Buffer.from(tokenSurat(id));
  // panjang diperiksa lebih dulu: timingSafeEqual MELEMPAR kalau panjangnya beda
  if (diberi.length !== benar.length) return null;
  return timingSafeEqual(diberi, benar) ? id : null;
}

const ROMAWI = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
] as const;

/**
 * `007/HRD/VIII/2026`.
 *
 * Fungsi murni atas id dan tanggal, jadi nomornya sama setiap kali surat yang
 * sama diunduh ulang — tanpa satu pun kolom baru untuk menyimpannya. Urutannya
 * global (dari id pengajuan), bukan mulai 001 lagi setiap Januari.
 */
export function nomorSurat(id: number, isoDate: string): string {
  const bulan = ROMAWI[Number(isoDate.slice(5, 7)) - 1] ?? "I";
  return `${String(id).padStart(3, "0")}/HRD/${bulan}/${isoDate.slice(0, 4)}`;
}

/** Karakter tipografis yang sering datang dari papan ketik ponsel dan tidak ada
 *  di WinAnsi — dipetakan ke padanan ASCII-nya, bukan dibuang. */
const GANTI: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[‐-―]/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
  [/[•·]/g, "-"],
];

/**
 * Teks yang pasti bisa ditulis font standar PDF.
 *
 * Bukan kehati-hatian teoretis: font StandardFonts pdf-lib memakai WinAnsi dan
 * MELEMPAR untuk karakter di luarnya. `reason` diisi karyawan dari papan ketik
 * ponsel — satu emoji di alasan izin akan membuat rute unduhnya 500, dan itu
 * baru terlihat di tangan pengguna.
 */
export function teksAman(s: string | null | undefined): string {
  if (!s) return "";
  let out = s;
  for (const [dari, ke] of GANTI) out = out.replace(dari, ke);
  // sisanya: rentang yang seluruhnya ada di WinAnsi (ASCII cetak + Latin-1),
  // ditambah baris baru yang ditangani pemanggil saat memecah baris
  return out.replace(/[^\n\x20-\x7E¡-ÿ]/g, "");
}

/**
 * Memecah satu paragraf menjadi baris yang lebarnya tidak melewati `lebar`.
 *
 * `ukur` disuntikkan alih-alih mengimpor font: aturan pemecahannya bisa diuji
 * tanpa memuat pdf-lib, dan surat-pdf.ts tinggal mengirim
 * `(s) => font.widthOfTextAtSize(s, size)`.
 *
 * Kata yang sendirian sudah lebih lebar dari kolomnya (URL panjang, "aaaa…")
 * tetap dikeluarkan sebagai satu baris — dipotong di tengah karakter akan
 * membuat alasan izin tidak terbaca, dan melebar sedikit lebih jujur.
 */
export function bungkusTeks(
  teks: string,
  lebar: number,
  ukur: (s: string) => number,
): string[] {
  const baris: string[] = [];
  for (const paragraf of teks.split("\n")) {
    let kini = "";
    for (const kata of paragraf.split(/\s+/).filter(Boolean)) {
      const coba = kini ? `${kini} ${kata}` : kata;
      if (kini && ukur(coba) > lebar) {
        baris.push(kini);
        kini = kata;
      } else {
        kini = coba;
      }
    }
    baris.push(kini);
  }
  // paragraf kosong di ujung tidak perlu menyisakan baris hampa
  while (baris.length > 1 && baris.at(-1) === "") baris.pop();
  return baris;
}
