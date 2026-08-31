/**
 * Bekukan laporan satu bulan menjadi satu workbook Excel di Berkas perusahaan.
 *
 * Pembungkus CLI tipis di atas `lib/arsip.ts` — seluruh isinya ada di sana,
 * karena tombol "Generate sekarang" di /laporan memanggil fungsi yang sama.
 * Dua penulis workbook akan menyimpang, dan sesudah `db/purge.ts` berjalan,
 * yang menyimpang itulah satu-satunya salinan data yang tersisa.
 *
 * Jalankan:
 *   npx tsx src/db/arsip.ts                  # bulan lalu (WIB)
 *   npx tsx src/db/arsip.ts --bulan=2026-08  # periode tertentu
 *
 * Membuat ulang periode yang sama MENIMPA arsip lamanya. Itu memang aturannya:
 * satu arsip per bulan.
 */
import { buatArsip, labelPeriode, PERIODE_RE } from "../lib/arsip";
import { r2Configured } from "../lib/r2";

/** Bulan lalu menurut WIB — batas bulannya harus WIB, bukan UTC. */
function bulanLalu(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth(); // 0-based; tanpa +1 ini sudah bulan sebelumnya
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const arg = process.argv
    .find((a) => a.startsWith("--bulan="))
    ?.slice("--bulan=".length);
  const periode = arg ?? bulanLalu();

  if (!PERIODE_RE.test(periode)) {
    console.error(`\nPeriode tidak sah: ${periode}. Formatnya YYYY-MM.\n`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diisi");
  const host = new URL(url).host;

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  Target  : ${host}${host.includes("neon.tech") ? "  ← PRODUKSI (Neon)" : "  (lokal)"}`);
  console.log(`  R2      : ${r2Configured() ? "terkonfigurasi" : "TIDAK ADA"}`);
  console.log(`  Periode : ${labelPeriode(periode)} (${periode})`);
  console.log("=".repeat(64));

  if (!r2Configured()) {
    throw new Error(
      "Kredensial R2 tidak ada di environment. Workbook tidak punya tempat " +
        "mendarat, jadi skrip berhenti sebelum membangun apa pun.",
    );
  }

  const hasil = await buatArsip(periode);

  console.log("\nIsi arsip:");
  for (const [sheet, n] of Object.entries(hasil.counts)) {
    console.log(`  ${sheet.padEnd(22)} ${String(n).padStart(7)} baris`);
  }
  console.log(`  ${"TOTAL".padEnd(22)} ${String(hasil.total).padStart(7)} baris`);
  console.log(`\n${hasil.name} · ${(hasil.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`Kunci objek: ${hasil.key}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
});
