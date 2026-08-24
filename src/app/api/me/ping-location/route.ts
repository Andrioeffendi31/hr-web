import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attendance, attendanceEvents } from "@/db/schema";
import { todayWib } from "@/lib/hr";
import { withMe } from "@/lib/me";

/**
 * Menambal nama tempat pada ping lokasi yang lahir tanpa nama.
 *
 * Kenapa ini ada: penerjemahan koordinat → nama jalan dilakukan di ponsel, dan
 * `expo-location` SENGAJA mematikan geocoder-nya selama aplikasi di latar
 * belakang (`OnActivityEntersBackground` → `mGeocoderPaused`, lalu tiap
 * reverseGeocode melempar). Ping lokasi justru lahir di latar belakang, jadi
 * hampir semuanya tersimpan tanpa nama meski koordinatnya benar.
 *
 * Jadi namanya disusulkan: saat aplikasi kembali ke depan — geocoder hidup lagi —
 * ponsel menanyakan ping miliknya sendiri yang masih kosong, menerjemahkannya,
 * lalu mengirimkan hasilnya ke sini.
 *
 * Hanya HARI INI. Bukan pembatasan yang dipaksakan, melainkan yang membuat
 * himpunannya kecil dan mengosong sendiri tiap hari: titik yang memang tidak
 * punya nama tidak akan ditanyakan ulang selamanya.
 */
const TOP = 12;

export const GET = withMe(async (me) => {
  const rows = await db
    .select({
      id: attendanceEvents.id,
      lat: attendanceEvents.lat,
      lng: attendanceEvents.lng,
    })
    .from(attendanceEvents)
    .innerJoin(attendance, eq(attendance.id, attendanceEvents.attendanceId))
    .where(
      and(
        eq(attendance.employeeId, me.id),
        eq(attendance.date, todayWib()),
        eq(attendanceEvents.kind, "lokasi"),
        isNull(attendanceEvents.location),
        sql`${attendanceEvents.lat} is not null and ${attendanceEvents.lng} is not null`,
      ),
    )
    .limit(TOP);

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      lat: Number(r.lat),
      lng: Number(r.lng),
    })),
  });
});

const body = z.object({
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        location: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(TOP),
});

export const PATCH = withMe(async (me, req) => {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  /**
   * Yang boleh ditambal disaring LEBIH DULU dari basis data, bukan dipercaya
   * dari badan permintaan.
   *
   * `id` datang dari klien, jadi tanpa langkah ini seseorang bisa menuliskan
   * nama tempat karangan ke baris ping milik rekannya. Penyaringnya sama persis
   * dengan GET di atas: milik saya, hari ini, jenis lokasi, dan MASIH kosong —
   * yang terakhir sekaligus membuat tambalan ini tidak bisa menimpa nama yang
   * sudah benar.
   */
  const ids = parsed.data.items.map((i) => i.id);
  const boleh = await db
    .select({ id: attendanceEvents.id })
    .from(attendanceEvents)
    .innerJoin(attendance, eq(attendance.id, attendanceEvents.attendanceId))
    .where(
      and(
        eq(attendance.employeeId, me.id),
        eq(attendance.date, todayWib()),
        eq(attendanceEvents.kind, "lokasi"),
        isNull(attendanceEvents.location),
        inArray(attendanceEvents.id, ids),
      ),
    );

  const sah = new Set(boleh.map((r) => r.id));
  const tulis = parsed.data.items.filter((i) => sah.has(i.id));

  for (const i of tulis) {
    await db
      .update(attendanceEvents)
      .set({ location: i.location })
      .where(eq(attendanceEvents.id, i.id));
  }

  return Response.json({ ok: true, ditambal: tulis.length });
});
