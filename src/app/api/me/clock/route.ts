import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  auditLog,
  officeLocations,
} from "@/db/schema";
import {
  attendanceStatus,
  formatJarak,
  geserShift,
  jarakMeter,
  jam,
  pulangCepat,
  resolveShift,
  todayWib,
} from "@/lib/hr";
import { izinSetengahHari } from "@/lib/kehadiran";
import { Bad, config, withMe } from "@/lib/me";
import {
  MAX_IMAGE,
  allowed,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";

/**
 * Self-service clock in/out (PRD-Mobile §6.1) — the punch itself, which until
 * now only HR could enter from the web console.
 *
 * Arrives as multipart because the selfie rides along: one request, so a photo
 * can never end up attached to a punch that failed, or a punch recorded without
 * the photo the policy asked for.
 */
const body = z.object({
  action: z.enum(["in", "out"]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** optional reverse-geocoded label from the device */
  location: z.string().trim().max(120).optional(),
  /** working from home skips the geofence, but must be declared, not inferred */
  wfh: z.enum(["1", "0"]).optional(),
  /** which office this punch is measured against; required on clock-in unless WFH,
   *  and ignored on clock-out, which reuses whatever clock-in chose */
  locationId: z.coerce.number().int().positive().optional(),
  /**
   * Android melaporkan sendiri bahwa fix ini berasal dari mock location provider,
   * yaitu dari aplikasi fake-GPS. Absen dengan bendera ini DITOLAK: tidak seperti
   * ping berkala — yang bertugas mencatat di mana orangnya berada dan karena itu
   * tidak boleh membuang fakta — punch adalah klaim yang sedang diajukan, dan
   * klaim yang koordinatnya diketahui karangan tidak punya alasan untuk diterima.
   */
  mocked: z.enum(["1", "0"]).optional(),
  /**
   * Alasan absen di luar jamnya — WAJIB kalau harinya memang di luar jam, dan
   * yang menentukan itu server ini, bukan jam di ponsel: `lateReason` dituntut
   * saat status yang dihitung di bawah keluar 'telat', `earlyReason` saat
   * `pulangCepat()` benar. Ambangnya sama dengan alasan pengajuan cuti/lembur
   * (api/me/requests) supaya tidak ada aturan kedua untuk hal yang sama.
   */
  lateReason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500).optional(),
  earlyReason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500).optional(),
});

export const POST = withMe(async (me, req) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new Bad("Permintaan harus multipart/form-data");

  const parsed = body.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const {
    action,
    lat,
    lng,
    location,
    wfh,
    locationId,
    mocked,
    lateReason,
    earlyReason,
  } = parsed.data;

  /**
   * The selfie is mandatory for both punches, and it is checked here — before the
   * geofence, before the duplicate check, and above all before any row is written.
   * The upload used to happen after the insert, so rejecting a photo at that point
   * would have left the punch recorded and the evidence missing: exactly the state
   * the requirement exists to prevent.
   *
   * Storage being unreachable therefore blocks attendance rather than quietly
   * recording photoless punches. That is the policy, not an oversight — an
   * exception that fires whenever R2 has a bad day is not a requirement.
   */
  /**
   * Diperiksa sebelum apa pun yang lain, termasuk sebelum selfie: menyuruh orang
   * berfoto lalu menolak punch-nya karena hal yang sudah diketahui sejak baris
   * pertama adalah membuang waktunya dengan sengaja.
   *
   * Bendera ini datang dari perangkat, jadi APK yang dimodifikasi bisa saja tidak
   * mengirimkannya. Yang menjaga sisi itu adalah heuristik perpindahan mustahil di
   * jalur ping — di sini yang ditutup adalah aplikasi fake-GPS biasa dari Play Store,
   * yaitu seluruh kasus yang sebenarnya terjadi.
   */
  if (mocked === "1") {
    await db.insert(auditLog).values({
      actorId: me.id,
      action: "attendance.mocked",
      entity: "attendance",
      detail: `Absen ${action === "in" ? "masuk" : "keluar"} ditolak: GPS palsu terdeteksi di perangkat (${lat}, ${lng})`,
    });
    throw new Bad(
      "Absen ditolak: aplikasi lokasi palsu terdeteksi. Matikan aplikasi fake GPS, lalu coba lagi.",
    );
  }

  const file = form.get("selfie");
  if (!(file instanceof File) || file.size === 0) {
    throw new Bad("Foto selfie wajib untuk absen masuk maupun keluar");
  }
  if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);
  if (!allowed(extOf(file.name), "photo")) {
    throw new Bad("Foto harus JPG, PNG atau WEBP");
  }
  if (file.size > MAX_IMAGE) {
    throw new Bad(
      `Foto terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)`,
      413,
    );
  }

  const cfg = await config();
  const today = todayWib();

  // WIB, like todayWib() — a UTC clock would stamp a 07:30 punch as 00:30 and
  // every morning would read as on-time
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  const isWfh = wfh === "1";

  const [existing] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      locationId: attendance.locationId,
    })
    .from(attendance)
    .where(and(eq(attendance.employeeId, me.id), eq(attendance.date, today)))
    .limit(1);

  if (action === "in" && existing?.clockIn) {
    throw new Bad(`Sudah absen masuk ${jam(existing.clockIn)} hari ini`);
  }
  if (action === "out") {
    if (!existing?.clockIn) throw new Bad("Belum absen masuk hari ini");
    if (existing.clockOut) {
      throw new Bad(`Sudah absen keluar ${jam(existing.clockOut)} hari ini`);
    }
  }

  /**
   * Which office this punch is measured against.
   *
   * On clock-out the answer is settled: it is whatever clock-in chose, read from
   * the row. The client may send a locationId and it is ignored — letting somebody
   * end the day against a different office than they started it at would make the
   * geofence opt-out-able by picking the nearest one at 17:00.
   *
   * A null on clock-out means the day was declared WFH, so there is nothing to
   * measure and the punch passes, same as the clock-in did.
   */
  const wantedId =
    action === "out" ? existing!.locationId : isWfh ? null : locationId;
  if (action === "in" && !isWfh && !wantedId)
    throw new Bad("Pilih titik absen dulu");

  const office = wantedId
    ? (
        await db
          .select()
          .from(officeLocations)
          .where(eq(officeLocations.id, wantedId))
          .limit(1)
      )[0]
    : undefined;

  if (wantedId && !office) throw new Bad("Titik absen tidak ditemukan");
  // only checked when the employee picked it — an office deactivated after somebody
  // clocked in must not trap them, unable to clock out for the rest of the day
  if (office && action === "in" && !office.active) {
    throw new Bad(`${office.name} sudah tidak aktif, pilih titik absen lain`);
  }

  const meter = office
    ? jarakMeter(lat, lng, Number(office.lat), Number(office.lng))
    : null;
  if (office && meter! > office.radiusM) {
    throw new Bad(
      `Di luar radius ${office.name} (${formatJarak(meter!)} dari titik absen, maks ${office.radiusM} m)`,
    );
  }

  /**
   * Alasan wajib, diperiksa dari status yang dihitung server sendiri dan SEBELUM
   * satu baris pun ditulis.
   *
   * WFH otomatis bebas dari alasan keterlambatan, dan bukan karena ada cabang
   * khusus di sini: `attendanceStatus` mengembalikan 'wfh', bukan 'telat'. Satu
   * sumber kebenaran, jadi aturan absennya tidak bisa menyimpang dari aturan
   * statusnya.
   */
  /**
   * Shift efektif, bukan shift divisinya: izin setengah hari yang sudah
   * DISETUJUI menggeser batas keterlambatan (dan batas pulang cepat) ke jam
   * izinnya — lihat `geserShift()` di lib/hr.ts.
   *
   * Ini satu-satunya tempat jalur absen menyentuh tabel pengajuan, dan ia harus:
   * tanpa ini, orang yang izinnya sudah disetujui tetap dipaksa menulis alasan
   * keterlambatan lalu barisnya tercatat 'telat' — dan baris itu MENANG atas
   * cuti/izin di statusHarianSql, jadi izinnya tidak akan pernah terbaca lagi.
   */
  const shift = geserShift(
    resolveShift(me, cfg),
    await izinSetengahHari(me.id, today),
  );
  const status = attendanceStatus(
    now,
    shift.start,
    shift.toleranceMinutes,
    isWfh,
  );
  if (action === "in" && status === "telat" && !lateReason) {
    throw new Bad(
      `Terlambat dari shift ${shift.start}. Isi alasan keterlambatan dulu`,
    );
  }
  if (action === "out" && pulangCepat(now, shift) && !earlyReason) {
    throw new Bad(
      `Shift baru selesai ${shift.end}. Isi alasan pulang cepat dulu`,
    );
  }

  const label = location ?? office?.name ?? me.workLocation;
  let attendanceId: number;

  if (action === "in") {
    const values = {
      employeeId: me.id,
      date: today,
      clockIn: now,
      status,
      location: label,
      lat: String(lat),
      lng: String(lng),
      locationId: office?.id ?? null,
      lateReason: lateReason ?? null,
    };
    const [row] = existing
      ? await db
          .update(attendance)
          .set(values)
          .where(eq(attendance.id, existing.id))
          .returning({ id: attendance.id })
      : await db
          .insert(attendance)
          .values(values)
          .returning({ id: attendance.id });
    attendanceId = row.id;
  } else {
    attendanceId = existing!.id;
    await db
      .update(attendance)
      .set({ clockOut: now, earlyReason: earlyReason ?? null })
      .where(eq(attendance.id, attendanceId));
  }

  const [event] = await db
    .insert(attendanceEvents)
    .values({
      attendanceId,
      kind: action === "in" ? "masuk" : "keluar",
      location: label,
      lat: String(lat),
      lng: String(lng),
      note: office ? `${formatJarak(meter!)} dari ${office.name}` : "WFH",
    })
    .returning({ id: attendanceEvents.id });

  const selfieKey = keyFor("selfie", `${me.id}/${today}/${event.id}`);
  await putObject(selfieKey, await file.arrayBuffer(), file.type);
  await db
    .update(attendanceEvents)
    .set({ photoUrl: selfieKey })
    .where(eq(attendanceEvents.id, event.id));
  // the admin table shows one selfie per day and clock-in is the one that proves
  // who showed up, so only that punch claims it
  if (action === "in") {
    await db
      .update(attendance)
      .set({ selfieUrl: selfieKey })
      .where(eq(attendance.id, attendanceId));
  }

  revalidatePath("/kehadiran");
  return Response.json({
    ok: true,
    action,
    at: now.slice(0, 5),
    distanceM: meter === null ? null : Math.round(meter),
    location: label,
    selfieKey,
  });
});
