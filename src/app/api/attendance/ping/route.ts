import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { attendance, attendanceEvents, officeLocations } from "@/db/schema";
import {
  formatJarak,
  jarakMeter,
  KECEPATAN_MUSTAHIL,
  kecepatanKmJam,
  todayWib,
} from "@/lib/hr";
import { sendPush } from "@/lib/push";

/**
 * Periodic location ping while the employee is clocked in (every ~3 hours from
 * the mobile app's background task).
 *
 * The first self-service write endpoint in this app: every other mutation is
 * requireAdmin(). Two rules make that safe:
 *
 *  1. Identity comes from the session, never the body — there is deliberately
 *     no employeeId field, so employee A cannot ping as employee B.
 *  2. The minimum gap below IS the rate limit (PRD §12 asks for one on the
 *     attendance endpoints), so a looping or malicious client cannot flood the
 *     log: at most one row per ~2.5 hours per attendance day.
 *
 * A ping outside the geofence it was clocked in against is flagged on the event
 * and pushed back to the employee. Unlike clock-in it is never *rejected*: the
 * point of a trail is to record where somebody actually was, and a refused ping
 * would erase exactly the fact worth recording. The same gap is what keeps the
 * warning from becoming a nag — at most one every ~2.5 hours.
 */
const body = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** optional human-readable label from reverse geocoding on the device */
  location: z.string().trim().max(120).optional(),
  /**
   * Kapan fix-nya diambil, bukan kapan ia diunggah. Diisi oleh antrean offline di
   * telepon: fix yang gagal terkirim karena tidak ada sinyal disimpan dan dikirim
   * belakangan, dan yang layak dicatat adalah waktu pengambilannya.
   *
   * Berasal dari klien, sama seperti lat/lng di atas — perangkat dengan jam yang
   * dimundurkan bisa menggeser satu fix di dalam hari itu. Batasnya di bawah
   * ([clockIn, sekarang]) yang menahannya tetap di dalam hari kerja yang sedang
   * berjalan; ini bukan skema tanda tangan dan tidak berpura-pura menjadi satu.
   */
  at: z.coerce.date().optional(),
  /**
   * Android melaporkan sendiri ketika sebuah fix datang dari mock location
   * provider — yaitu dari aplikasi fake-GPS. Ping tidak pernah ditolak karenanya:
   * lihat blok di atas.
   */
  mocked: z.coerce.boolean().optional(),
});

/** 2.5 h, not 3 h: a phone's background scheduler drifts, and rejecting a
 *  legitimate ping for being 8 minutes early would silently lose coverage. */
const MIN_GAP_MS = 2.5 * 60 * 60 * 1000;

/** Toleransi jam perangkat untuk `at`: satu menit, cukup untuk skew biasa dan
 *  jauh dari cukup untuk memalsukan urutan kejadian. */
const SKEW_MS = 60_000;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Koordinat tidak valid" }, { status: 400 });
  }
  const { lat, lng, location, mocked } = parsed.data;
  const today = todayWib();

  const [att] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      // titik absen masuknya — pembanding kecepatan untuk ping pertama hari itu
      lat: attendance.lat,
      lng: attendance.lng,
      // the office chosen at clock-in — the only point this ping can meaningfully
      // be measured against. Null on a WFH day, where being away from an office
      // is the arrangement rather than something to flag.
      officeName: officeLocations.name,
      officeLat: officeLocations.lat,
      officeLng: officeLocations.lng,
      officeRadiusM: officeLocations.radiusM,
    })
    .from(attendance)
    .leftJoin(officeLocations, eq(officeLocations.id, attendance.locationId))
    .where(
      and(
        eq(attendance.employeeId, Number(user.id)),
        eq(attendance.date, today),
      ),
    )
    .limit(1);

  // tracking only runs between the two punches — never before, never after
  if (!att?.clockIn) {
    return Response.json({ error: "Belum clock-in hari ini" }, { status: 400 });
  }
  if (att.clockOut) {
    return Response.json(
      { error: "Sudah clock-out hari ini" },
      { status: 400 },
    );
  }

  /**
   * Waktu fix ini pada sumbu waktu, dibatasi ke dalam hari kerja yang berjalan.
   * `clock_in` adalah kolom `time` WIB, jadi instannya dirakit dari tanggal hari
   * ini + offset +07:00 — bukan dari jam server, yang bisa berada di zona mana pun.
   */
  const now = Date.now();
  const mulai = new Date(`${today}T${att.clockIn}+07:00`).getTime();
  const at = parsed.data.at ?? new Date();
  if (at.getTime() > now + SKEW_MS) {
    return Response.json(
      { error: "Waktu ping di masa depan" },
      { status: 400 },
    );
  }
  // Sekaligus yang membersihkan antrean basi dengan sendirinya: entri kemarin
  // gagal terhadap clock-in hari ini, dan teleponnya membuangnya pada 400 ini.
  if (at.getTime() < mulai) {
    return Response.json(
      { error: "Waktu ping mendahului clock-in" },
      { status: 400 },
    );
  }

  const [last] = await db
    .select({
      at: attendanceEvents.at,
      lat: attendanceEvents.lat,
      lng: attendanceEvents.lng,
    })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.attendanceId, att.id),
        eq(attendanceEvents.kind, "lokasi"),
      ),
    )
    .orderBy(desc(attendanceEvents.at))
    .limit(1);

  if (last) {
    // Diukur pada sumbu waktu PENGAMBILAN, bukan waktu unggah: itulah yang membuat
    // tiga fix antrean berjarak 3 jam bisa mendarat sekaligus, tanpa membuka lubang
    // banjir — `at` terkurung di [clockIn, sekarang], jadi plafonnya tetap satu
    // baris per 2,5 jam hari kerja berapa pun cepatnya klien menembak.
    const elapsed = at.getTime() - last.at.getTime();
    if (elapsed < MIN_GAP_MS) {
      return Response.json(
        {
          error: "Ping terlalu cepat",
          nextAllowedAt: new Date(last.at.getTime() + MIN_GAP_MS).toISOString(),
        },
        { status: 409 },
      );
    }
  }

  /**
   * Is this ping outside the geofence it was clocked in against?
   *
   * Measured against the office the day belongs to, never "whichever is nearest
   * now" — somebody who clocked in at the head office and spent the afternoon two
   * streets from the warehouse is away from where they said they would be, and a
   * nearest-match would quietly call that fine.
   *
   * A WFH day has no office, so there is nothing to be outside of and no warning
   * to give.
   */
  const meter = att.officeLat
    ? jarakMeter(lat, lng, Number(att.officeLat), Number(att.officeLng!))
    : null;
  const outside = meter !== null && meter > att.officeRadiusM!;

  /**
   * Apakah titik ini patut dicurigai?
   *
   * Dua sinyal yang saling menutupi lubang masing-masing:
   *
   *  1. `mocked` — Android sendiri yang melaporkan bahwa fix-nya berasal dari mock
   *     location provider, yaitu dari aplikasi fake-GPS. Menangkap hampir semua
   *     pemalsu, tapi datang dari klien: APK yang dimodifikasi tinggal tidak
   *     mengirimkannya.
   *  2. Perpindahan mustahil — dihitung di sini dari titik sebelumnya, jadi tidak
   *     ada yang bisa dilakukan telepon untuk menghindarinya. Menangkap teleportasi
   *     yang menyembunyikan bendera nomor 1, tapi buta terhadap koordinat palsu yang
   *     berpindah pelan-pelan.
   *
   * Keduanya hanya MENANDAI. Ping tidak pernah ditolak — lihat blok di kepala berkas.
   */
  // Titik pembanding: ping sebelumnya kalau ada, kalau belum ada — absen masuknya
  // sendiri. Tanpa cadangan itu, ping PERTAMA hari itu tidak punya pembanding sama
  // sekali, dan justru ping pertama yang paling mungkin datang dari orang yang baru
  // menyalakan fake-GPS setelah absen di kantor.
  const asal =
    last?.lat && last.lng
      ? { lat: Number(last.lat), lng: Number(last.lng), at: last.at }
      : att.lat && att.lng
        ? { lat: Number(att.lat), lng: Number(att.lng), at: new Date(mulai) }
        : null;
  const laju = asal ? kecepatanKmJam(asal, { lat, lng, at }) : 0;
  const suspect = mocked
    ? "GPS palsu terdeteksi di perangkat"
    : laju > KECEPATAN_MUSTAHIL
      ? `Perpindahan ${Math.round(laju)} km/jam dari titik sebelumnya`
      : null;

  const [row] = await db
    .insert(attendanceEvents)
    .values({
      attendanceId: att.id,
      kind: "lokasi",
      at,
      lat: String(lat),
      lng: String(lng),
      location: location ?? null,
      // only when it is worth saying: the drawer already renders the distance for
      // every ping, so a note repeating it would be noise. This one flags it.
      note: outside ? `Di luar radius ${att.officeName}` : null,
      suspect,
    })
    .returning({ id: attendanceEvents.id, at: attendanceEvents.at });

  if (outside) {
    // awaited, but sendPush swallows its own failures — an unreachable phone must
    // not turn a recorded ping into a 500 the device would retry
    await sendPush({
      to: Number(user.id),
      title: "Anda di luar area kantor",
      body: `Terpantau ${formatJarak(meter!)} dari ${att.officeName} pada pengecekan lokasi berkala.`,
      route: "/kehadiran",
    });
  }

  // no auditLog row: that table tracks administrative actions needing a trail,
  // and attendance_events is already the trail for this one
  revalidatePath("/kehadiran");
  return Response.json({ ok: true, id: row.id, at: row.at, outside, suspect });
}
