import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { attendance, auditLog } from "@/db/schema";

/**
 * Tinjauan admin atas alasan terlambat / pulang cepat.
 *
 * `ok: true` MEMUTIHKAN keterlambatan: kolom `status` tidak disentuh sama sekali —
 * barisnya tetap 'telat' — dan yang berubah hanyalah `review_ok`, yang dibaca
 * cabang teratas `statusHarianSql()` sebagai 'hadir'. Karena buktinya tidak
 * dihancurkan, keputusan yang salah bisa langsung dibalik dengan memanggil ini
 * sekali lagi, dan tiap panggilan meninggalkan barisnya sendiri di audit_log.
 *
 * Satu keputusan untuk harinya, bukan satu per alasan: yang dibaca admin adalah
 * penjelasan hari itu.
 */
const body = z.object({
  /** id baris attendance, bukan id karyawan */
  id: z.coerce.number().int().positive(),
  ok: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const { id, ok, note } = parsed.data;

  // menolak tanpa alasan tidak memberi karyawannya apa pun untuk diperbaiki
  if (!ok && !note) {
    return Response.json(
      { error: "Isi alasan penolakan" },
      { status: 400 },
    );
  }

  const [row] = await db
    .select({
      status: attendance.status,
      date: attendance.date,
      lateReason: attendance.lateReason,
      earlyReason: attendance.earlyReason,
    })
    .from(attendance)
    .where(eq(attendance.id, id))
    .limit(1);
  if (!row) {
    return Response.json({ error: "Absensi tidak ditemukan" }, { status: 404 });
  }
  // tidak ada yang bisa ditinjau kalau tidak ada yang ditulis karyawannya
  if (!row.lateReason && !row.earlyReason) {
    return Response.json(
      { error: "Tidak ada alasan untuk ditinjau" },
      { status: 400 },
    );
  }

  await db
    .update(attendance)
    .set({
      reviewOk: ok,
      reviewedById: Number(admin.id),
      reviewedAt: new Date(),
      reviewNote: note || null,
    })
    .where(eq(attendance.id, id));

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: ok ? "attendance.alasan_diterima" : "attendance.alasan_ditolak",
    entity: "attendance",
    entityId: id,
    detail: `${row.date} (${row.status})${note ? ` — ${note}` : ""}`,
  });

  revalidatePath("/kehadiran");
  revalidatePath("/laporan");

  return Response.json({ ok: true, reviewOk: ok });
}
