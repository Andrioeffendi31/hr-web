import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { announcements, auditLog } from "@/db/schema";
import {
  MAX_IMAGE,
  allowed,
  deleteObject,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";

/**
 * Membuat pengumuman (PRD §6.9), beserta foto bannernya.
 *
 * Multipart, bukan JSON lalu unggah terpisah. Dua permintaan berarti ada saat
 * pengumuman sudah tayang tanpa gambarnya, dan kalau unggahan keduanya gagal
 * yang tertinggal adalah pengumuman setengah jadi yang tidak diminta siapa pun.
 * Satu permintaan membuat kegagalan berarti "tidak jadi", bukan "jadi sebagian".
 *
 * Hak akses: `requireAdmin()` — yang di aplikasi ini berarti hr_admin DAN
 * pimpinan, dua peran yang boleh membuka konsol (lihat bolehKonsol di
 * lib/access.ts). Tidak ada peran "owner" terpisah di skema ini.
 */
const body = z.object({
  title: z.string().trim().min(3, "Judul terlalu pendek").max(160),
  body: z.string().trim().min(10, "Isi pengumuman terlalu pendek").max(4000),
  category: z.enum(["Kebijakan", "Libur", "Administrasi", "Pelatihan"], {
    message: "Pilih kategori pengumuman",
  }),
  audience: z.string().trim().min(2).max(80).default("Semua karyawan"),
  pinned: z
    .union([z.literal("on"), z.literal("true"), z.literal("1")])
    .optional()
    .transform((v) => v !== undefined),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const parsed = body.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }

  /**
   * Banner divalidasi SEBELUM barisnya ditulis.
   *
   * Urutan ini yang membuat "gambarnya ditolak" tidak pernah menyisakan
   * pengumuman tanpa gambar yang sudah terlanjur tayang — persis alasan
   * /api/me/clock memeriksa selfienya sebelum menyentuh tabel absensi.
   */
  const file = form.get("banner");
  const adaBanner = file instanceof File && file.size > 0;
  if (adaBanner) {
    if (!r2Configured()) {
      return Response.json(
        { error: "Object storage belum dikonfigurasi" },
        { status: 503 },
      );
    }
    if (!allowed(extOf(file.name), "banner")) {
      return Response.json(
        { error: "Banner harus JPG, PNG atau WEBP" },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE) {
      return Response.json(
        { error: `Banner terlalu besar (maks ${MAX_IMAGE / (1024 * 1024)} MB)` },
        { status: 413 },
      );
    }
  }

  const [row] = await db
    .insert(announcements)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      audience: parsed.data.audience,
      pinned: parsed.data.pinned,
      authorId: Number(admin.id),
    })
    .returning({ id: announcements.id });

  let bannerKey: string | null = null;
  if (adaBanner) {
    bannerKey = keyFor("banner", String(row.id), file.name);
    try {
      await putObject(bannerKey, await file.arrayBuffer(), file.type);
      await db
        .update(announcements)
        .set({ bannerKey })
        .where(eq(announcements.id, row.id));
    } catch (e) {
      /**
       * Unggahan gagal sesudah barisnya masuk: buang barisnya lagi, jangan
       * tinggalkan pengumuman yang bannernya tidak pernah ada. Objek yang
       * mungkin sudah separuh tertulis ikut dibersihkan, dan kegagalan
       * pembersihan tidak boleh menutupi kegagalan aslinya.
       */
      await deleteObject(bannerKey).catch(() => undefined);
      await db.delete(announcements).where(eq(announcements.id, row.id));
      return Response.json(
        { error: `Banner gagal diunggah: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "announcement.create",
    entity: "announcements",
    entityId: row.id,
    detail: `${parsed.data.title} · ${parsed.data.category}${
      parsed.data.pinned ? " · disematkan" : ""
    }${bannerKey ? " · dengan banner" : ""}`,
  });

  revalidatePath("/pengumuman");
  return Response.json({ ok: true, id: row.id, bannerKey });
}
