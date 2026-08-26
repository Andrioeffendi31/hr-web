import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  auditLog,
  divisions,
  employees,
} from "@/db/schema";
import { attendanceStatus, geserShift, isIsoDate, jam, resolveShift } from "@/lib/hr";
import { izinSetengahHari } from "@/lib/kehadiran";
import { config } from "@/lib/me";

/**
 * Koreksi jam absen oleh admin — satu-satunya jalur selain punch karyawannya
 * sendiri (/api/me/clock) yang boleh menulis clock_in/clock_out.
 *
 * Upsert, bukan update: hari yang karyawannya lupa absen sama sekali tidak punya
 * baris untuk diedit, dan justru hari itulah yang paling perlu dikoreksi.
 *
 * Yang TIDAK disentuh: selfie, koordinat, titik kantor, alasan yang ditulis
 * karyawan, dan keputusan tinjauan. Mengoreksi jam bukan menghapus bukti — sama
 * seperti /api/attendance/review yang sengaja tidak menulis ulang status.
 */
const HHMM = /^\d{2}:\d{2}$/;
const kosongJadiNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const body = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.string().refine(isIsoDate, "Tanggal tidak valid"),
  clockIn: z.preprocess(kosongJadiNull, z.string().regex(HHMM).nullable()),
  clockOut: z.preprocess(kosongJadiNull, z.string().regex(HHMM).nullable()),
  /** kosong = hitung ulang dari shift */
  status: z.preprocess(
    kosongJadiNull,
    z.enum(["hadir", "telat", "wfh", "cuti", "izin", "sakit"]).nullable(),
  ),
  note: z.preprocess(kosongJadiNull, z.string().trim().max(500).nullable()),
});

const menit = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export async function POST(req: Request) {
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
  const { employeeId, date, clockIn, clockOut, status: paksa, note } = parsed.data;

  // Keluar tanpa masuk bukan hari kerja yang bisa dibaca siapa pun: total kerja
  // tidak terhitung, dan statusnya jatuh ke 'belum_absen' meski jamnya terisi.
  if (clockOut && !clockIn) {
    return Response.json({ error: "Isi jam masuk dulu" }, { status: 400 });
  }
  // Lintas tengah malam tidak didukung di mana pun di aplikasi ini (clock_in dan
  // clock_out adalah jam dinding pada SATU tanggal), jadi ditolak, bukan ditebak.
  if (clockIn && clockOut && menit(clockOut) <= menit(clockIn)) {
    return Response.json(
      { error: "Jam keluar harus setelah jam masuk" },
      { status: 400 },
    );
  }

  // baris karyawan + shift divisinya, bentuk yang sama dengan lib/me.ts supaya
  // resolveShift() bisa dipanggil apa adanya
  const [emp] = await db
    .select({
      name: employees.name,
      active: employees.active,
      shiftStart: divisions.shiftStart,
      shiftEnd: divisions.shiftEnd,
      lateToleranceMinutes: divisions.lateToleranceMinutes,
    })
    .from(employees)
    .leftJoin(divisions, eq(employees.division, divisions.name))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) {
    return Response.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
  }
  if (!emp.active) {
    return Response.json({ error: "Karyawan sudah nonaktif" }, { status: 400 });
  }

  const [lama] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
    })
    .from(attendance)
    .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)))
    .limit(1);

  /**
   * Shift efektif, sama persis dengan yang dipakai punch karyawannya: izin
   * setengah hari yang disetujui menggeser batas keterlambatan. Kalau di sini
   * dipakai shift mentah, mengoreksi jam sekian menit saja bisa mengubah hari
   * yang izinnya sah menjadi 'telat'.
   */
  const shift = geserShift(
    resolveShift(emp, await config()),
    await izinSetengahHari(employeeId, date),
  );
  // WFH adalah keterangan hari itu, bukan akibat dari jamnya — dipertahankan
  // kecuali admin memang mengganti statusnya sendiri
  const status =
    paksa ??
    attendanceStatus(clockIn, shift.start, shift.toleranceMinutes, lama?.status === "wfh");

  const [row] = await db
    .insert(attendance)
    .values({ employeeId, date, clockIn, clockOut, status })
    .onConflictDoUpdate({
      target: [attendance.employeeId, attendance.date],
      set: { clockIn, clockOut, status },
    })
    .returning({ id: attendance.id });

  const ubah = `masuk ${jam(lama?.clockIn ?? null)} → ${jam(clockIn)}, keluar ${jam(lama?.clockOut ?? null)} → ${jam(clockOut)}, status ${lama?.status ?? "—"} → ${status}`;

  /**
   * Satu entri di jejak harinya, bukan cuma di audit_log: kartu Masuk/Keluar di
   * drawer dibaca dari baris absensi, sedangkan Log lokasi di bawahnya dari
   * attendance_events. Tanpa baris ini keduanya saling membantah setelah koreksi.
   */
  await db.insert(attendanceEvents).values({
    attendanceId: row.id,
    kind: "catatan",
    note: `Jam dikoreksi ${admin.name ?? "admin"}: ${ubah}${note ? ` · ${note}` : ""}`,
  });

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "attendance.edit_jam",
    entity: "attendance",
    entityId: row.id,
    detail: `${date} — ${ubah}${note ? ` · ${note}` : ""}`,
  });

  revalidatePath("/kehadiran");
  revalidatePath("/laporan");

  return Response.json({ ok: true, status });
}
