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
 * `--sebelum=YYYY-MM-DD` membatasi penghapusan pada data yang LEBIH TUA dari
 * tanggal itu — inilah bentuk yang dipakai pembersihan tiga bulanan. Tanpa flag
 * itu perilakunya seperti dulu: seluruh isi ketiga domain dikosongkan.
 *
 * Dengan `--sebelum`, skrip ini MENOLAK berjalan kalau arsip Excel bulan-bulan
 * yang akan dihapus belum ada (lihat `gerbangArsip`). Data mentah hanya boleh
 * hilang kalau penggantinya sudah terbukti ada — bukan diasumsikan ada.
 *
 * Jalankan:
 *   npm run db:purge              # lokal, jalan kering
 *   npm run db:purge -- --hapus   # lokal, sungguhan
 *   npm run db:purge:neon         # produksi, jalan kering
 *   npm run db:purge:neon -- --sebelum=2026-06-01
 *   npm run db:purge:neon -- --sebelum=2026-06-01 --hapus
 */
import { writeFileSync } from "node:fs";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "./index";
import { documents } from "./schema";
import { deleteObject, headObject, r2Configured } from "../lib/r2";

const HAPUS = process.argv.includes("--hapus");

/**
 * Batas umur: hanya baris yang LEBIH TUA dari tanggal ini yang dihapus.
 * Tanpa flag, null — dan seluruh isi domain terpilih dikosongkan, seperti dulu.
 */
const SEBELUM =
  process.argv.find((a) => a.startsWith("--sebelum="))?.slice("--sebelum=".length) ??
  null;
if (SEBELUM !== null && !/^\d{4}-\d{2}-\d{2}$/.test(SEBELUM)) {
  console.error(`\nTanggal tidak sah: ${SEBELUM}. Formatnya YYYY-MM-DD.\n`);
  process.exit(1);
}

/** Lewati pemeriksaan arsip. Ada supaya bisa dipakai sadar, bukan tanpa sengaja. */
const TANPA_ARSIP = process.argv.includes("--tanpa-arsip");

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

/**
 * "Baris ini lebih tua dari batas" — satu ungkapan per tabel.
 *
 * `attendance_events` tidak punya tanggal sendiri; umurnya adalah umur absensi
 * induknya. Menyaringnya lewat `at` akan salah pada ping yang tiba lewat tengah
 * malam, dan yang lebih buruk: bisa menghapus event sementara baris absensinya
 * bertahan, meninggalkan hari yang kehilangan jejaknya tanpa ada yang tahu.
 *
 * Cuti disaring dengan `end_date`, bukan `start_date`: pengajuan yang mulai
 * bulan lalu dan baru berakhir minggu depan belum boleh hilang.
 */
const PREDIKAT: Record<string, (sebelum: string) => SQL> = {
  attendance: (b) => sql`date < ${b}::date`,
  attendance_events: (b) =>
    sql`attendance_id in (select id from attendance where date < ${b}::date)`,
  leave_requests: (b) => sql`end_date < ${b}::date`,
  overtime_requests: (b) => sql`date < ${b}::date`,
};

/** Penyaring umur untuk satu tabel; `true` kalau tidak ada batas. */
const filt = (tabel: string): SQL =>
  SEBELUM ? PREDIKAT[tabel](SEBELUM) : sql`true`;

/** `berumur` = hitung hanya yang kena batas (tabel sasaran); kalau tidak,
 *  seluruh isi tabel (tabel yang wajib utuh). */
async function hitung(tabel: readonly string[], berumur = false) {
  const out: Record<string, number> = {};
  for (const t of tabel) {
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(t)} where ${berumur ? filt(t) : sql`true`}`,
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
        and ${filt(tabel)}
    `);
    keys.push(...r.rows.map((x) => x.k));
  }
  // kunci selfie bersifat deterministik, jadi baris berbeda bisa menunjuk objek
  // yang sama; menghapusnya dua kali tidak salah, tapi angkanya jadi membohongi
  return [...new Set(keys)];
}

/**
 * Bulan-bulan yang datanya akan dihapus, menurut data yang benar-benar kena
 * batas — bukan menurut rentang yang dibayangkan pemanggil.
 */
async function bulanTerdampak(): Promise<string[]> {
  const bagian: SQL[] = [];
  if (TARGET.includes("attendance"))
    bagian.push(sql`select distinct to_char(date, 'YYYY-MM') as b from attendance where ${filt("attendance")}`);
  if (TARGET.includes("leave_requests"))
    bagian.push(sql`select distinct to_char(end_date, 'YYYY-MM') as b from leave_requests where ${filt("leave_requests")}`);
  if (TARGET.includes("overtime_requests"))
    bagian.push(sql`select distinct to_char(date, 'YYYY-MM') as b from overtime_requests where ${filt("overtime_requests")}`);
  if (!bagian.length) return [];
  const r = await db.execute<{ b: string }>(
    sql`${sql.join(bagian, sql` union `)} order by b`,
  );
  return r.rows.map((x) => x.b);
}

/**
 * Data mentah hanya boleh hilang kalau penggantinya TERBUKTI ada.
 *
 * Untuk setiap bulan yang terdampak: barisnya ada di `documents` dengan
 * `periode` itu dan bertanda `admin_only`, DAN objeknya benar-benar terbaca di
 * R2. Barisnya saja tidak cukup — sebuah baris yang menunjuk objek yang sudah
 * hilang adalah arsip yang tampak ada di daftar tapi tidak pernah bisa dibuka,
 * dan itu justru bentuk kegagalan yang paling mungkin luput.
 */
async function gerbangArsip(bulan: string[]) {
  const kurang: string[] = [];
  for (const b of bulan) {
    const [row] = await db
      .select({ url: documents.url, size: documents.sizeBytes })
      .from(documents)
      .where(and(eq(documents.periode, b), eq(documents.adminOnly, true)))
      .limit(1);
    if (!row) {
      kurang.push(`${b} — tidak ada arsipnya`);
      continue;
    }
    const nyata = await headObject(row.url);
    if (!nyata) kurang.push(`${b} — barisnya ada tapi objeknya hilang dari R2`);
    else console.log(`  ${b}  arsip OK (${Math.round(nyata / 1024)} KB)`);
  }
  if (kurang.length) {
    console.error("\nArsip yang belum siap:");
    for (const k of kurang) console.error(`  ${k}`);
    throw new Error(
      "Tidak ada yang dihapus. Buat arsipnya dulu (npm run db:arsip -- --bulan=YYYY-MM " +
        "atau tombol Generate di /laporan), lalu jalankan lagi. " +
        "Kalau Anda memang ingin menghapus tanpa arsip, tambahkan --tanpa-arsip.",
    );
  }
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
  console.log(
    `  Batas    : ${SEBELUM ? `hanya data SEBELUM ${SEBELUM}` : "SEMUA data (tanpa batas umur)"}`,
  );
  console.log("=".repeat(64));

  if (!r2Configured()) {
    throw new Error(
      "Kredensial R2 tidak ada di environment. Objeknya akan menjadi yatim tanpa " +
        "cara menemukannya lagi, jadi skrip berhenti di sini. Jalankan lewat " +
        "npm run db:purge / db:purge:neon yang memuat .env.local untuk R2-nya.",
    );
  }

  // ── 1. hitung
  const sebelum = await hitung(TARGET, true);
  const jagaSebelum = await hitung(SELAMAT);
  const keys = await kunciR2();
  tabelkan("Akan dihapus:", sebelum);
  tabelkan("Harus tetap utuh:", jagaSebelum);
  console.log(`\nObjek R2 yang akan dihapus: ${keys.length}`);

  // ── 1b. gerbang arsip. Diperiksa juga pada jalan kering: gunanya justru untuk
  //       memberi tahu SEBELUM ada yang menekan --hapus.
  const bulan = SEBELUM ? await bulanTerdampak() : [];
  if (bulan.length) {
    console.log(`\nBulan terdampak: ${bulan.join(", ")}`);
    if (TANPA_ARSIP) {
      console.log("  --tanpa-arsip: pemeriksaan arsip DILEWATI");
    } else {
      await gerbangArsip(bulan);
    }
  }

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
      const r = await tx.execute(
        sql`delete from ${sql.identifier(t)} where ${filt(t)}`,
      );
      terhapus[t] = r.rowCount ?? 0;
    }
  });
  tabelkan("Baris terhapus:", terhapus);

  // ── 6. bukti bahwa penghapusan tidak melebar
  /**
   * Yang wajib nol adalah baris yang KENA BATAS, bukan seluruh isi tabel.
   * Dengan `--sebelum`, data yang lebih baru memang harus tetap ada — dan
   * memeriksa "tabelnya kosong" di sini akan gagal justru saat skripnya benar.
   */
  const sesudah = await hitung(TARGET, true);
  const jagaSesudah = await hitung(SELAMAT);
  tabelkan(
    SEBELUM
      ? `Sisa yang lebih tua dari ${SEBELUM} (harus 0):`
      : "Sisa di tabel target (harus 0):",
    sesudah,
  );
  if (SEBELUM) tabelkan("Yang sengaja dipertahankan:", await hitung(TARGET));

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
