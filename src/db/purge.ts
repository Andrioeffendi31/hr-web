/**
 * Hapus permanen seluruh data kehadiran, pengajuan cuti, dan pengajuan lembur —
 * beserta objeknya di Cloudflare R2.
 *
 * KERING SECARA BAWAAN. Tanpa `--hapus` skrip ini hanya melihat dan melaporkan.
 *
 * Urutannya wajib: baca kunci → hapus objek R2 → baru hapus baris. Alasannya
 * lib/r2.ts tidak punya fungsi list dan tidak akan pernah punya kalau tidak
 * dibutuhkan: satu-satunya tempat yang tahu kunci mana milik data ini adalah
 * kolom database. Menghapus barisnya lebih dulu membuat objeknya yatim SELAMANYA
 * — tidak ada lagi yang bisa menyebutkan kuncinya.
 *
 * Kalau ada satu objek saja yang gagal dihapus, database tidak disentuh sama
 * sekali. Barisnya masih utuh, jadi menjalankan ulang skrip ini menemukan kunci
 * yang sama lagi; yang sudah terhapus menjawab 404 dan `deleteObject`
 * memperlakukannya sebagai sukses. Itu yang membuat kegagalan separuh jalan aman.
 *
 * DELETE, bukan TRUNCATE. TRUNCATE menuntut pilihan antara mendaftar setiap tabel
 * anak atau memakai CASCADE yang menjalar ke tabel yang harus selamat
 * (`office_locations` hanya satu lompatan FK dari `attendance`) — dan
 * RESTART IDENTITY akan mereset urutan id, padahal kunci selfie bersifat
 * deterministik terhadap id, sehingga id yang dipakai ulang bisa bertabrakan
 * dengan objek lama yang masih ada di bucket.
 *
 * Jalankan:
 *   npm run db:purge              # lokal, jalan kering
 *   npm run db:purge -- --hapus   # lokal, sungguhan
 *   npm run db:purge:neon         # produksi, jalan kering
 *   npm run db:purge:neon -- --hapus
 */
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { deleteObject, r2Configured } from "../lib/r2";

const HAPUS = process.argv.includes("--hapus");

/**
 * `--hanya=cuti` / `--hanya=kehadiran,lembur` membatasi sasarannya.
 *
 * Tanpa itu ketiganya dikosongkan. Dengan itu, penjaga "tabel di luar cakupan tidak
 * berubah" ikut menyesuaikan diri sendiri — tabel yang tidak jadi sasaran otomatis
 * masuk daftar yang wajib utuh, jadi pembatasan sasaran tidak melemahkan buktinya.
 */
const DOMAIN = {
  kehadiran: ["attendance_events", "attendance"],
  cuti: ["leave_requests"],
  lembur: ["overtime_requests"],
} as const;

const pilihan = (process.argv
  .find((a) => a.startsWith("--hanya="))
  ?.slice("--hanya=".length)
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean) ?? Object.keys(DOMAIN)) as (keyof typeof DOMAIN)[];

const asing = pilihan.filter((d) => !(d in DOMAIN));
if (asing.length) {
  console.error(
    `\nDomain tidak dikenal: ${asing.join(", ")}. Pilihannya: ${Object.keys(DOMAIN).join(", ")}\n`,
  );
  process.exit(1);
}

/** Tabel yang dikosongkan, anak sebelum induk. */
const TARGET = pilihan.flatMap((d) => DOMAIN[d]);

/** Tabel yang WAJIB tidak berubah. Dihitung sebelum dan sesudah, lalu dibandingkan
 *  — satu-satunya bukti bahwa penghapusan tidak melebar. */
const SELAMAT = [
  "employees",
  "documents",
  "office_locations",
  "holidays",
  "announcements",
  "settings",
  "leave_adjustments",
  "audit_log",
  // domain yang TIDAK jadi sasaran kali ini wajib utuh juga — itulah yang membuat
  // `--hanya=` bisa dipercaya, bukan sekadar dipersempit
  ...Object.entries(DOMAIN)
    .filter(([d]) => !pilihan.includes(d as keyof typeof DOMAIN))
    .flatMap(([, t]) => t),
] as const;

/** Kolom yang menyimpan kunci objek R2 milik ketiga domain ini. Lembur tidak punya
 *  lampiran sama sekali, jadi ia tidak muncul di sini. */
const KOLOM_R2 = (
  [
    { tabel: "attendance", kolom: "selfie_url" },
    { tabel: "attendance_events", kolom: "photo_url" },
    { tabel: "leave_requests", kolom: "attachment_key" },
  ] as const
).filter((k) => (TARGET as readonly string[]).includes(k.tabel));

async function hitung(tabel: readonly string[]) {
  const out: Record<string, number> = {};
  for (const t of tabel) {
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(t)}`,
    );
    out[t] = r.rows[0].n;
  }
  return out;
}

async function kunciR2(): Promise<string[]> {
  const keys: string[] = [];
  for (const { tabel, kolom } of KOLOM_R2) {
    const r = await db.execute<{ k: string }>(sql`
      select ${sql.identifier(kolom)} as k from ${sql.identifier(tabel)}
      where ${sql.identifier(kolom)} is not null and ${sql.identifier(kolom)} <> ''
    `);
    keys.push(...r.rows.map((x) => x.k));
  }
  // kunci selfie bersifat deterministik, jadi baris berbeda bisa menunjuk objek
  // yang sama; menghapusnya dua kali tidak salah, tapi angkanya jadi membohongi
  return [...new Set(keys)];
}

const tabelkan = (judul: string, isi: Record<string, number>) => {
  console.log(`\n${judul}`);
  for (const [k, v] of Object.entries(isi)) {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(7)}`);
  }
};

async function main() {
  // ── 0. tujuan, dicetak sebelum apa pun terjadi
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diisi");
  const host = new URL(url).host;
  const neon = host.includes("neon.tech");
  console.log(`\n${"=".repeat(64)}`);
  console.log(`  Target   : ${host}  ${neon ? "← PRODUKSI (Neon)" : "(lokal)"}`);
  console.log(`  R2       : ${r2Configured() ? "terkonfigurasi" : "TIDAK ADA"}`);
  console.log(`  Mode     : ${HAPUS ? "HAPUS SUNGGUHAN" : "jalan kering (tidak mengubah apa pun)"}`);
  console.log(`  Sasaran  : ${pilihan.join(", ")}`);
  console.log("=".repeat(64));

  if (!r2Configured()) {
    throw new Error(
      "Kredensial R2 tidak ada di environment. Objeknya akan menjadi yatim tanpa " +
        "cara menemukannya lagi, jadi skrip berhenti di sini. Jalankan lewat " +
        "npm run db:purge / db:purge:neon yang memuat .env.local untuk R2-nya.",
    );
  }

  // ── 1. hitung
  const sebelum = await hitung(TARGET);
  const jagaSebelum = await hitung(SELAMAT);
  const keys = await kunciR2();
  tabelkan("Akan dihapus:", sebelum);
  tabelkan("Harus tetap utuh:", jagaSebelum);
  console.log(`\nObjek R2 yang akan dihapus: ${keys.length}`);

  if (!HAPUS) {
    console.log("\nJalan kering selesai. Tambahkan --hapus untuk benar-benar menghapus.\n");
    process.exit(0);
  }

  // ── 2. daftar kunci ke berkas: bukti apa yang dihancurkan, dan jaring kalau
  //      langkah berikutnya gagal separuh jalan
  const stempel = new Date().toISOString().replace(/[:.]/g, "-");
  const berkas = `purge-keys-${neon ? "neon" : "lokal"}-${stempel}.txt`;
  writeFileSync(berkas, keys.join("\n") + (keys.length ? "\n" : ""));
  console.log(`\nDaftar kunci ditulis ke ${berkas}`);

  // ── 3. hapus objek R2
  let ok = 0;
  const gagal: string[] = [];
  for (const k of keys) {
    try {
      await deleteObject(k);
      ok++;
      if (ok % 50 === 0) console.log(`  …${ok}/${keys.length}`);
    } catch (e) {
      gagal.push(`${k} — ${(e as Error).message}`);
    }
  }
  console.log(`R2: ${ok} objek terhapus, ${gagal.length} gagal`);

  // ── 4. satu kegagalan pun menahan database
  if (gagal.length) {
    console.error("\nObjek yang gagal dihapus:");
    for (const g of gagal.slice(0, 20)) console.error(`  ${g}`);
    if (gagal.length > 20) console.error(`  … dan ${gagal.length - 20} lagi`);
    throw new Error(
      "Database TIDAK disentuh. Barisnya masih utuh, jadi perbaiki sebabnya lalu " +
        "jalankan skrip ini lagi — objek yang sudah terhapus menjawab 404 dan itu " +
        "dihitung sukses.",
    );
  }

  // ── 5. hapus baris, satu transaksi
  const terhapus: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const t of TARGET) {
      const r = await tx.execute(sql`delete from ${sql.identifier(t)}`);
      terhapus[t] = r.rowCount ?? 0;
    }
  });
  tabelkan("Baris terhapus:", terhapus);

  // ── 6. bukti bahwa penghapusan tidak melebar
  const sesudah = await hitung(TARGET);
  const jagaSesudah = await hitung(SELAMAT);
  tabelkan("Sisa di tabel target (harus 0):", sesudah);

  const sisa = Object.values(sesudah).reduce((a, b) => a + b, 0);
  const melebar = SELAMAT.filter((t) => jagaSebelum[t] !== jagaSesudah[t]);
  if (sisa !== 0) throw new Error(`Masih ada ${sisa} baris tersisa di tabel target`);
  if (melebar.length) {
    throw new Error(
      `Tabel di luar cakupan ikut berubah: ${melebar
        .map((t) => `${t} ${jagaSebelum[t]}→${jagaSesudah[t]}`)
        .join(", ")}`,
    );
  }
  console.log("\nSelesai. Tabel di luar cakupan tidak berubah satu baris pun.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\n${(e as Error).message}\n`);
    process.exit(1);
  });
