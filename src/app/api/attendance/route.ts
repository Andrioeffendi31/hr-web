import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  auditLog,
  employees,
} from "@/db/schema";
import { jam } from "@/lib/hr";
import { deleteObject } from "@/lib/r2";

/**
 * Hapus permanen satu atau beberapa baris kehadiran.
 *
 * Satu-satunya jalur penghapusan kehadiran dari konsol. Ada karena baris uji,
 * absensi yang tercatat untuk orang yang salah, dan hari yang terlanjur dobel
 * sebelumnya tidak bisa dibereskan sama sekali — `/api/attendance/edit` hanya
 * bisa mengoreksi jam, dan `db/purge.ts` mengosongkan semuanya.
 *
 * BUKAN soft delete. Kolom `deleted_at` akan menuntut setiap pembaca absensi
 * ikut menyaring — statusHarianSql, papan, rekap, laporan, arsip, purge — dan
 * satu tempat yang terlewat berarti hari yang "dihapus" muncul lagi diam-diam di
 * laporan. Yang tertinggal sebagai gantinya adalah `audit_log`: nisannya, bukan
 * cadangannya. Isinya tidak bisa dikembalikan.
 *
 * Sekali jalan ini menghancurkan jam, status, lokasi, selfie, alasan yang
 * ditulis karyawan, keputusan tinjauan admin, DAN seluruh `attendance_events`
 * hari itu lewat ON DELETE CASCADE — jejak GPS, catatan, penanda GPS palsu.
 * Karena itu alasannya wajib, bukan opsional.
 *
 * `requireAdmin()` menerima hr_admin DAN pimpinan; lihat `bolehKonsol()` di
 * lib/access.ts. Tidak ada peran ketiga di aplikasi ini yang perlu disebut.
 */
const body = z.object({
  /** id baris `attendance`, bukan id karyawan */
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  alasan: z.string().trim().min(3, "Alasan wajib diisi").max(500),
});

export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const { ids, alasan } = parsed.data;

  /**
   * ── 1. Potret + kunci objek, SEBELUM apa pun dihapus.
   *
   * Urutannya bukan soal kerapian. Kunci selfie hanya hidup di kolom database;
   * lib/r2.ts tidak punya fungsi list dan tidak akan pernah punya. Menghapus
   * barisnya lebih dulu berarti tidak ada lagi apa pun di dunia ini yang bisa
   * menyebutkan kunci objeknya, dan fotonya yatim selamanya di bucket. Pelajaran
   * yang sama sudah ditulis panjang di db/purge.ts.
   */
  const baris = await db
    .select({
      id: attendance.id,
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
      selfieUrl: attendance.selfieUrl,
      name: employees.name,
      nik: employees.nik,
    })
    .from(attendance)
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .where(inArray(attendance.id, ids));

  if (!baris.length) {
    return Response.json({ error: "Kehadiran tidak ditemukan" }, { status: 404 });
  }

  const events = await db
    .select({
      attendanceId: attendanceEvents.attendanceId,
      photoUrl: attendanceEvents.photoUrl,
    })
    .from(attendanceEvents)
    .where(
      inArray(
        attendanceEvents.attendanceId,
        baris.map((b) => b.id),
      ),
    );

  const perBaris = new Map(
    baris.map((b) => [
      b.id,
      {
        ...b,
        events: 0,
        // selfie harian dan foto tiap event bisa menunjuk objek yang sama;
        // Set supaya jumlah yang dilaporkan tidak membohongi
        kunci: new Set<string>(b.selfieUrl ? [b.selfieUrl] : []),
      },
    ]),
  );
  for (const e of events) {
    const b = perBaris.get(e.attendanceId);
    if (!b) continue;
    b.events++;
    if (e.photoUrl) b.kunci.add(e.photoUrl);
  }

  // ── 2. hapus barisnya; attendance_events ikut lewat ON DELETE CASCADE
  const dihapus = await db
    .delete(attendance)
    .where(
      inArray(
        attendance.id,
        baris.map((b) => b.id),
      ),
    )
    .returning({ id: attendance.id });

  /**
   * ── 3. objek R2, SESUDAH barisnya hilang, dan kegagalannya diabaikan.
   *
   * Kebalikan dari db/purge.ts, dan disengaja. Di sana yang dilindungi adalah
   * operasi massal yang bisa diulang dari awal, jadi satu kegagalan menahan
   * database. Di sini penghapusannya sudah terjadi dan tidak bisa diurungkan;
   * objek yang tertinggal itu mahal, tapi membuat aksi yang BERHASIL terlihat
   * gagal akan mengundang admin menekannya lagi. Sama seperti announcements.
   */
  let objek = 0;
  for (const b of perBaris.values()) {
    for (const k of b.kunci) {
      await deleteObject(k).then(
        () => objek++,
        () => undefined,
      );
    }
  }

  /**
   * ── 4. nisannya. Satu baris audit per kehadiran, dan isinya harus cukup
   * menjawab "apa yang hilang" tanpa barisnya — karena barisnya memang sudah
   * tidak ada untuk dilihat lagi.
   */
  await db.insert(auditLog).values(
    [...perBaris.values()].map((b) => ({
      actorId: Number(admin.id),
      action: "attendance.delete",
      entity: "attendance",
      entityId: b.id,
      detail:
        `${b.date} · ${b.name} (${b.nik}) · masuk ${jam(b.clockIn)} keluar ${jam(b.clockOut)} · ` +
        `status ${b.status} · ${b.events} event · ${b.kunci.size} objek R2 · alasan: ${alasan}`,
    })),
  );

  revalidatePath("/kehadiran");
  revalidatePath("/laporan");
  return Response.json({ ok: true, dihapus: dihapus.length, objek });
}
