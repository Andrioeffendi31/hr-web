import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, attendanceEvents, pushTokens } from "@/db/schema";
import { todayWib } from "@/lib/hr";
import { WEB_PLATFORM, sendWebPush } from "@/lib/push";

/**
 * Pengingat lokasi untuk karyawan iOS yang memakai PWA (/ios).
 *
 * Safari tidak memberi PWA cara apa pun untuk mengambil lokasi di latar
 * belakang — service worker tidak punya Geolocation, dan iOS tidak mengenal
 * push senyap. Jadi jejak 2-jamannya dibangun dari dua bagian: endpoint ini
 * mengirim notifikasi, dan karyawan mengetuknya; PWA yang terbuka lalu
 * mengambil fix dan mengirimnya ke /api/attendance/ping (source "pwa").
 *
 * Dipanggil penjadwal tiap 30 menit. Endpoint ini sendiri yang memutuskan siapa
 * yang sudah waktunya, sehingga pengingat jatuh ±2 jam sesudah ping atau
 * pengingat terakhir orang itu, bukan serentak di jam genap untuk semua orang.
 *
 * Setiap pengingat dicatat sebagai kejadian `catatan` di jejak hari itu. Itu
 * yang membuat HR bisa membedakan "diingatkan tapi tidak menanggapi" dari
 * "tidak pernah diingatkan", dan sekaligus menjadi penahan supaya pengingat
 * yang diabaikan tidak diulang tiap 30 menit.
 */
const INTERVAL_MS = 2 * 60 * 60 * 1000;
/** penjadwal tidak pernah tepat; lebih baik lebih cepat lima menit daripada
 *  menunda pengingat sampai putaran berikutnya, setengah jam kemudian */
const TOLERANSI_MS = 5 * 60 * 1000;
const CATATAN_PENGINGAT = "Pengingat lokasi dikirim (PWA iOS)";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET belum diisi" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  // Yang sedang bekerja hari ini (sudah masuk, belum keluar) dan punya
  // langganan Web Push. Pemakai aplikasi Android tidak ikut: tugas latarnya
  // sudah mengirim lokasi sendiri.
  const aktif = await db
    .selectDistinct({
      attendanceId: attendance.id,
      employeeId: attendance.employeeId,
      clockIn: attendance.clockIn,
    })
    .from(attendance)
    .innerJoin(
      pushTokens,
      and(
        eq(pushTokens.employeeId, attendance.employeeId),
        eq(pushTokens.platform, WEB_PLATFORM),
      ),
    )
    .where(
      and(
        eq(attendance.date, todayWib()),
        isNotNull(attendance.clockIn),
        isNull(attendance.clockOut),
      ),
    );
  if (aktif.length === 0) return Response.json({ due: 0, sent: 0 });

  // Kejadian terakhir yang menghitung sebagai "baru diurus": ping lokasi, atau
  // pengingat yang sudah dikirim.
  const terakhir = await db
    .select({
      attendanceId: attendanceEvents.attendanceId,
      at: sql<Date>`max(${attendanceEvents.at})`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(attendanceEvents)
    .where(
      and(
        inArray(
          attendanceEvents.attendanceId,
          aktif.map((a) => a.attendanceId),
        ),
        sql`(${attendanceEvents.kind} = 'lokasi' or (${attendanceEvents.kind} = 'catatan' and ${attendanceEvents.note} = ${CATATAN_PENGINGAT}))`,
      ),
    )
    .groupBy(attendanceEvents.attendanceId);
  const terakhirMap = new Map(terakhir.map((t) => [t.attendanceId, t.at]));

  const now = Date.now();
  const due = aktif.filter((a) => {
    const sejak = new Date(terakhirMap.get(a.attendanceId) ?? a.clockIn!);
    return now - sejak.getTime() >= INTERVAL_MS - TOLERANSI_MS;
  });
  if (due.length === 0) return Response.json({ due: 0, sent: 0 });

  const tokens = await db
    .select({ employeeId: pushTokens.employeeId, token: pushTokens.token })
    .from(pushTokens)
    .where(
      and(
        eq(pushTokens.platform, WEB_PLATFORM),
        inArray(
          pushTokens.employeeId,
          due.map((d) => d.employeeId),
        ),
      ),
    );

  const { sent } = await sendWebPush(
    tokens.map((t) => t.token),
    {
      title: "Perbarui lokasi kerja Anda",
      body: "Ketuk untuk mengirim lokasi. Hanya butuh beberapa detik.",
      url: "/ios?ping=1",
      tag: "ping-lokasi",
    },
  );

  await db.insert(attendanceEvents).values(
    due.map((d) => ({
      attendanceId: d.attendanceId,
      kind: "catatan" as const,
      at: new Date(now),
      note: CATATAN_PENGINGAT,
    })),
  );

  return Response.json({ due: due.length, sent });
}
