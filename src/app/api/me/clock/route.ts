import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attendance, attendanceEvents } from "@/db/schema";
import {
  attendanceStatus,
  formatJarak,
  jarakMeter,
  jam,
  todayWib,
} from "@/lib/hr";
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
});

export const POST = withMe(async (me, req) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new Bad("Permintaan harus multipart/form-data");

  const parsed = body.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const { action, lat, lng, location, wfh } = parsed.data;
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

  const meter = jarakMeter(lat, lng, Number(cfg.officeLat), Number(cfg.officeLng));
  const isWfh = wfh === "1";
  if (!isWfh && meter > cfg.geofenceRadiusM) {
    throw new Bad(
      `Di luar radius kantor (${formatJarak(meter)} dari titik absen, maks ${cfg.geofenceRadiusM} m)`,
    );
  }

  const [existing] = await db
    .select({
      id: attendance.id,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
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

  const label = location ?? me.workLocation;
  let attendanceId: number;

  if (action === "in") {
    const status = attendanceStatus(
      now,
      cfg.shiftStart,
      cfg.lateToleranceMinutes,
      isWfh,
    );
    const values = {
      employeeId: me.id,
      date: today,
      clockIn: now,
      status,
      location: label,
      lat: String(lat),
      lng: String(lng),
    };
    const [row] = existing
      ? await db
          .update(attendance)
          .set(values)
          .where(eq(attendance.id, existing.id))
          .returning({ id: attendance.id })
      : await db.insert(attendance).values(values).returning({ id: attendance.id });
    attendanceId = row.id;
  } else {
    attendanceId = existing!.id;
    await db
      .update(attendance)
      .set({ clockOut: now })
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
      note: isWfh ? "WFH" : `${formatJarak(meter)} dari titik absen`,
    })
    .returning({ id: attendanceEvents.id });

  let selfieKey: string | null = null;
  const file = form.get("selfie");
  if (file instanceof File && file.size > 0) {
    if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);
    if (!allowed(extOf(file.name), "photo")) {
      throw new Bad("Foto harus JPG, PNG atau WEBP");
    }
    if (file.size > MAX_IMAGE) {
      throw new Bad(`Foto terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)`, 413);
    }
    selfieKey = keyFor("selfie", `${me.id}/${today}/${event.id}`);
    await putObject(selfieKey, await file.arrayBuffer(), file.type);
    await db
      .update(attendanceEvents)
      .set({ photoUrl: selfieKey })
      .where(eq(attendanceEvents.id, event.id));
    // the admin table shows one selfie per day and clock-in is the one that
    // proves who showed up, so only that punch claims it
    if (action === "in") {
      await db
        .update(attendance)
        .set({ selfieUrl: selfieKey })
        .where(eq(attendance.id, attendanceId));
    }
  }

  revalidatePath("/kehadiran");
  return Response.json({
    ok: true,
    action,
    at: now.slice(0, 5),
    distanceM: Math.round(meter),
    location: label,
    selfieKey,
  });
});
