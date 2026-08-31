import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, documents } from "@/db/schema";
import { ukuranFile } from "@/lib/hr";
import { Bad, withMe } from "@/lib/me";
import {
  allowed,
  deleteObject,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";

/**
 * Jatah ruang per karyawan.
 *
 * Bucket R2 yang dipakai hanya 10 GB, dan sampai sekarang tidak ada satu pun rem:
 * seorang karyawan bisa menghabiskan jatah semua orang tanpa ada yang tahu sampai
 * unggahan berikutnya gagal di sisi Cloudflare.
 *
 * ponytail: angka mati, bukan kolom `settings`. Kalau suatu saat kuotanya perlu
 * berbeda per orang atau per divisi, kolom di sana adalah langkah berikutnya.
 */
const KUOTA = 210 * 1024 * 1024;

/**
 * Byte yang sudah dipakai karyawan ini.
 *
 * Query tersendiri, bukan penjumlahan atas baris yang sudah dibaca GET: daftar itu
 * `LIMIT 100` dan memuat berkas perusahaan. Berkas perusahaan sengaja tidak dihitung
 * — `ownerId` null berarti dokumen yang ditaruh HR untuk semua orang, dan itu bukan
 * tanggungan kuota siapa pun.
 */
async function terpakaiOleh(id: number): Promise<number> {
  const [row] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`.mapWith(Number),
    })
    .from(documents)
    .where(eq(documents.ownerId, id));
  return row?.bytes ?? 0;
}

/**
 * "Berkas Saya" (PRD-Mobile §6.5): own documents plus the company-wide ones.
 *
 * The privacy note in the mockup is enforced by this where clause, not by
 * hiding rows in the app — `ownerId = me` or `ownerId is null`, nothing else.
 * Bytes themselves still leave through /api/files/[...key], which re-checks
 * ownership per download.
 *
 * `admin_only` memotong keduanya. Sebelum kolom itu ada, "berkas perusahaan"
 * (`ownerId is null`) berarti milik semua orang — dan arsip laporan bulanan,
 * yang memuat absensi serta cuti SELURUH karyawan, akan mendarat di layar ini
 * untuk setiap orang yang membukanya. Disaring di SQL, bukan di aplikasi:
 * baris yang tidak boleh dilihat tidak boleh ikut terkirim sejak awal.
 */
export const GET = withMe(async (me) => {
  const [rows, usedBytes] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(
        and(
          or(eq(documents.ownerId, me.id), isNull(documents.ownerId)),
          eq(documents.adminOnly, false),
        ),
      )
      .orderBy(desc(documents.uploadedAt))
      .limit(100),
    terpakaiOleh(me.id),
  ]);

  return Response.json({
    /**
     * Kalimatnya diformat di sini, mengikuti `size` di bawah — aplikasi tidak perlu
     * menumbuhkan formatter byte sendiri. Byte mentahnya ikut dikirim hanya karena
     * bar kuota butuh pembagiannya, bukan kata-katanya.
     */
    storage: {
      usedBytes,
      quotaBytes: KUOTA,
      terpakai: ukuranFile(usedBytes),
      kuota: ukuranFile(KUOTA),
      sisa: ukuranFile(Math.max(0, KUOTA - usedBytes)),
    },
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      ext: r.ext,
      folder: r.folder,
      key: r.url,
      size: ukuranFile(r.sizeBytes),
      mine: r.ownerId === me.id,
      uploadedAt: r.uploadedAt,
    })),
  });
});

/**
 * Upload one's own document. Bytes are proxied through here rather than
 * presigned like the admin flow, with a much smaller ceiling: a phone uploads a
 * scan or a photo, and 10 MB through the function is cheaper than teaching the
 * app the two-step presign dance for files it will never send.
 *
 * ponytail: 10 MB proxy cap. If employees ever need to send the same 100 MB
 * files HR does, reuse /api/files/presign with a requireUser() variant.
 */
const MAX_MOBILE_DOC = 10 * 1024 * 1024;

export const POST = withMe(async (me, req) => {
  if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new Bad("File tidak ditemukan");
  if (file.size === 0) throw new Bad("File kosong");
  if (file.size > MAX_MOBILE_DOC) {
    // "kecilkan dulu" hanya pernah sampai ke PDF dan dokumen: gambar sudah dikompres
    // menjadi WebP di ponsel sebelum request ini berangkat
    throw new Bad(
      `File terlalu besar (maks ${MAX_MOBILE_DOC / (1024 * 1024)} MB). Kecilkan dulu.`,
      413,
    );
  }
  if (!allowed(extOf(file.name), "doc"))
    throw new Bad("Tipe file tidak didukung");

  /**
   * Kuota diperiksa sesudah tipe dan ukuran, sebelum satu byte pun ditulis ke R2.
   *
   * ponytail: bukan transaksi. Dua unggahan bersamaan dari satu ponsel bisa
   * sama-sama lolos dan melewati kuota sebesar satu berkas (≤10 MB). Menguncinya
   * berarti mengunci tabel di jalur tersibuk demi kelebihan yang hilang sendiri pada
   * penghapusan berikutnya.
   */
  const used = await terpakaiOleh(me.id);
  if (used + file.size > KUOTA) {
    throw new Bad(
      `Kuota berkas penuh. Sisa ${ukuranFile(Math.max(0, KUOTA - used))} dari ${ukuranFile(KUOTA)}. Hapus berkas lama dulu.`,
      413,
    );
  }

  const key = keyFor("doc", "personal", file.name);
  await putObject(key, await file.arrayBuffer(), file.type);

  const [row] = await db
    .insert(documents)
    .values({
      name: file.name,
      ext: (extOf(file.name) || "bin").toUpperCase(),
      folder: "personal",
      sizeBytes: file.size,
      ownerId: me.id,
      url: key,
    })
    .returning({ id: documents.id });

  // an employee adding to their own file is worth a trail: HR sees documents
  // appear that they did not upload
  await db.insert(auditLog).values({
    actorId: me.id,
    action: "document.upload_self",
    entity: "documents",
    entityId: row.id,
    detail: file.name,
  });
  revalidatePath("/berkas");
  return Response.json({ ok: true, id: row.id, key });
});

/**
 * Hapus salah satu berkas milik sendiri.
 *
 * Sengaja di sini dan bukan memakai ulang `DELETE /api/files`: yang di sana menghapus
 * berdasarkan id saja tanpa memeriksa pemilik, aman hanya karena `requireAdmin()`
 * menjaganya. Yang membuat versi karyawan ini aman adalah predikat kepemilikan di
 * bawah, dan itu tidak bisa ditambahkan ke rute admin tanpa merusak kegunaannya.
 *
 * Objeknya di R2 dihapus setelah barisnya, bukan sebelumnya: kalau `deleteObject`
 * gagal yang tertinggal hanya objek yatim, sedangkan urutan terbalik bisa membuang
 * berkasnya sementara barisnya tetap ada — sebuah entri yang tidak pernah bisa dibuka.
 */
const hapus = z.object({ id: z.coerce.number().int().positive() });

export const DELETE = withMe(async (me, req) => {
  const parsed = hapus.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Berkas tidak dikenali");

  const [row] = await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, parsed.data.id),
        // ownerId, bukan hanya id. Tanpa baris ini seorang karyawan bisa menghapus
        // kontrak milik orang lain dengan menebak nomor. Berkas perusahaan ikut
        // tersaring dengan sendirinya: `owner_id = 7` tidak pernah benar untuk NULL,
        // jadi tidak perlu isNotNull.
        eq(documents.ownerId, me.id),
      ),
    )
    .returning({
      id: documents.id,
      name: documents.name,
      url: documents.url,
    });

  // satu jawaban untuk "tidak ada" dan "bukan milik Anda": membedakannya akan
  // memberi tahu penebak id bahwa barisnya memang ada
  if (!row) throw new Bad("Berkas tidak ditemukan", 404);

  // baris hasil seed tidak punya objek di R2 — kolom url-nya ""
  if (row.url && r2Configured()) await deleteObject(row.url);

  await db.insert(auditLog).values({
    actorId: me.id,
    action: "document.delete_self",
    entity: "documents",
    entityId: row.id,
    detail: row.name,
  });
  revalidatePath("/berkas");
  return Response.json({ ok: true });
});
