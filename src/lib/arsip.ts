/**
 * Arsip laporan bulanan: satu workbook Excel per periode, masuk ke Berkas
 * perusahaan sebagai berkas yang hanya bisa dilihat HR Admin & Pimpinan.
 *
 * Dipanggil dua tempat dan sengaja hanya ada satu: tombol "Generate sekarang" di
 * /laporan (`api/laporan/arsip`) dan script terjadwal (`db/arsip.ts`) yang jalan
 * di GitHub Action. Kalau keduanya punya penulis workbook sendiri, keduanya akan
 * menyimpang — dan yang menyimpang adalah SATU-SATUNYA sisa data setelah
 * `db/purge.ts` menghapus yang mentah.
 *
 * Satu arsip per periode. Membuat ulang periode yang sama menimpa yang lama;
 * tidak ada versi kedua dan tidak ada penomoran.
 */
import ExcelJS from "exceljs";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, documents } from "@/db/schema";
import { LAPORAN, REPORTS, jejakKehadiran } from "@/lib/laporan";
import { namaBulan } from "@/lib/hr";
import { deleteObject, headObject, keyFor, putObject } from "@/lib/r2";

/** `YYYY-MM` → hari pertama dan hari terakhir bulan itu. */
export function rentangBulan(periode: string) {
  const [y, m] = periode.split("-").map(Number);
  // hari terakhir tanpa tabel kalender: hari ke-0 bulan berikutnya
  const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${periode}-01`,
    to: `${periode}-${String(akhir).padStart(2, "0")}`,
  };
}

/** `2026-08` → "Agustus 2026". Nama bulannya dari `namaBulan()` di lib/hr —
 *  daftar bulan Indonesia sudah ada di sana, tidak perlu yang kedua. */
export function labelPeriode(periode: string): string {
  const [y, m] = periode.split("-").map(Number);
  return `${namaBulan(m - 1)} ${y}`;
}

export const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Nama sheet untuk jejak — di luar REPORTS, lihat `jejakKehadiran()`. */
const SHEET_JEJAK = "Jejak Kehadiran";

export type HasilArsip = {
  name: string;
  key: string;
  sizeBytes: number;
  counts: Record<string, number>;
  total: number;
};

/**
 * Bangun (atau bangun ulang) arsip satu periode.
 *
 * Urutan penulisannya bukan selera: objek baru diunggah LEBIH DULU, barisnya
 * ditukar dalam satu transaksi, objek lama baru dihapus paling akhir. Kegagalan
 * di titik mana pun hanya menyisakan objek yatim di R2 — yang mahal tapi tidak
 * merusak. Urutan sebaliknya bisa meninggalkan baris `documents` yang menunjuk
 * objek yang sudah tidak ada: sebuah arsip yang terlihat ada di daftar tapi tidak
 * pernah bisa dibuka, dan itu justru yang dipercaya `db/purge.ts` sebagai izin
 * menghapus data mentah.
 */
export async function buatArsip(
  periode: string,
  actorId?: number,
): Promise<HasilArsip> {
  if (!PERIODE_RE.test(periode)) throw new Error(`Periode tidak sah: ${periode}`);
  const { from, to } = rentangBulan(periode);

  // ── 1. kumpulkan semua sheet
  const isi: { sheet: string; headers: string[]; rows: unknown[][] }[] = [];
  for (const r of REPORTS) {
    const { headers, rows } = await LAPORAN[r.key]({ from, to, div: null });
    isi.push({ sheet: r.label, headers, rows });
  }
  const jejak = await jejakKehadiran({ from, to });
  isi.push({ sheet: SHEET_JEJAK, headers: jejak.headers, rows: jejak.rows });

  const counts = Object.fromEntries(isi.map((s) => [s.sheet, s.rows.length]));
  const total = isi.reduce((n, s) => n + s.rows.length, 0);

  // ── 2. workbook
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ringkasan = wb.addWorksheet("Ringkasan");
  ringkasan.columns = [{ width: 34 }, { width: 52 }];
  ringkasan.addRow(["Arsip Laporan Bulanan"]).font = { bold: true, size: 14 };
  ringkasan.addRow([]);
  ringkasan.addRow(["Periode", labelPeriode(periode)]);
  ringkasan.addRow(["Rentang tanggal", `${from} s/d ${to}`]);
  ringkasan.addRow([
    "Dibuat",
    new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB",
  ]);
  ringkasan.addRow([]);
  ringkasan.addRow(["Isi arsip", "Jumlah baris"]).font = { bold: true };
  for (const [sheet, n] of Object.entries(counts)) ringkasan.addRow([sheet, n]);
  ringkasan.addRow([]);
  ringkasan.addRow(["Total baris", total]).font = { bold: true };
  ringkasan.addRow([]);
  /**
   * Peringatan tetap, bukan basa-basi: sesudah purge, kolom "Kunci foto" di sheet
   * jejak menunjuk objek yang sudah tidak ada. Orang yang membuka berkas ini
   * bertahun-tahun lagi harus tahu batas itu tanpa perlu bertanya ke siapa pun.
   */
  const catatan = ringkasan.addRow([
    "Catatan",
    "Foto selfie & foto ping periode ini dihapus dari penyimpanan saat pembersihan berkala. " +
      'Kolom "Kunci foto" pada sheet Jejak Kehadiran hanya jejak nama objek, bukan tautan yang bisa dibuka.',
  ]);
  catatan.getCell(2).alignment = { wrapText: true, vertical: "top" };
  catatan.height = 44;

  for (const s of isi) {
    const ws = wb.addWorksheet(s.sheet);
    ws.addRow(s.headers).font = { bold: true };
    for (const row of s.rows) ws.addRow(row);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: s.headers.length },
    };
    // lebar kolom dari isi terpanjang, dibatasi supaya satu alasan cuti yang
    // panjang tidak membuat kolomnya selebar layar
    ws.columns = s.headers.map((h, i) => ({
      width: Math.min(
        44,
        Math.max(h.length + 2, ...s.rows.map((r) => String(r[i] ?? "").length + 2)),
      ),
    }));
  }

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

  // ── 3. unggah objek BARU (yang lama masih utuh sampai langkah 5)
  const name = `Laporan-${periode}.xlsx`;
  const key = keyFor("doc", "legal", name);
  await putObject(
    key,
    buf,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  // ukuran nyata dari bucket, bukan panjang buffer yang kita klaim sendiri
  const sizeBytes = (await headObject(key)) ?? 0;
  if (!sizeBytes) {
    await deleteObject(key).catch(() => {});
    throw new Error("Objek tidak terbaca kembali dari R2 setelah diunggah");
  }

  // ── 4. tukar barisnya
  const [lama] = await db
    .select({ id: documents.id, url: documents.url })
    .from(documents)
    .where(and(eq(documents.periode, periode), eq(documents.adminOnly, true)))
    .limit(1);

  const id = await db.transaction(async (tx) => {
    if (lama) await tx.delete(documents).where(eq(documents.id, lama.id));
    const [baru] = await tx
      .insert(documents)
      .values({
        name,
        ext: "XLSX",
        folder: "legal",
        sizeBytes,
        // milik perusahaan, bukan seseorang — dan `adminOnly` yang membuatnya
        // tetap tertutup dari karyawan meski `ownerId` null
        ownerId: null,
        adminOnly: true,
        periode,
        url: key,
      })
      .returning({ id: documents.id });
    return baru.id;
  });

  // ── 5. objek lama baru boleh pergi
  if (lama?.url && lama.url !== key) await deleteObject(lama.url).catch(() => {});

  await db.insert(auditLog).values({
    actorId: actorId ?? null,
    action: lama ? "report.archive_replace" : "report.archive",
    entity: "documents",
    entityId: id,
    detail: `${periode} · ${total} baris · ${Object.entries(counts)
      .map(([s, n]) => `${s}:${n}`)
      .join(", ")}`,
  });

  return { name, key, sizeBytes, counts, total };
}

/** Arsip yang sudah ada, terbaru dulu — panel /laporan dan gerbang purge. */
export function daftarArsip(limit = 24) {
  return db
    .select({
      periode: documents.periode,
      name: documents.name,
      url: documents.url,
      sizeBytes: documents.sizeBytes,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .where(and(isNotNull(documents.periode), eq(documents.adminOnly, true)))
    .orderBy(desc(documents.periode))
    .limit(limit);
}
