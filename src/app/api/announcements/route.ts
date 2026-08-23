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
const patchBody = z.object({
  id: z.coerce.number().int().positive(),
});

const deleteBody = z.object({
  id: z.coerce.number().int().positive(),
});

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

/**
 * Aturan banner, satu tempat untuk POST maupun PATCH.
 *
 * Mengembalikan Response penolakan, atau null kalau berkasnya boleh. Dipanggil
 * SEBELUM barisnya ditulis di kedua jalur: banner yang ditolak tidak boleh
 * menyisakan pengumuman yang sudah terlanjur tayang tanpa gambarnya.
 */
function periksaBanner(file: File): Response | null {
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
  return null;
}

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
    const tolak = periksaBanner(file);
    if (tolak) return tolak;
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

/**
 * Ubah pengumuman. Multipart, alasan yang sama dengan POST — bannernya bisa ikut
 * diganti dalam permintaan yang sama.
 *
 * Banner lama dihapus SESUDAH kolomnya menunjuk yang baru, dan kegagalan
 * penghapusan tidak pernah fatal: baris yang sudah benar tidak boleh terlihat
 * gagal hanya karena sampahnya tertinggal. Urutan yang sama dipakai jalur logo di
 * /api/files.
 */
export async function PATCH(req: Request) {
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

  const isi = Object.fromEntries(form);
  const id = patchBody.safeParse(isi);
  if (!id.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const parsed = body.safeParse(isi);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }

  const [lama] = await db
    .select({ bannerKey: announcements.bannerKey })
    .from(announcements)
    .where(eq(announcements.id, id.data.id))
    .limit(1);
  if (!lama) {
    return Response.json({ error: "Pengumuman tidak ditemukan" }, { status: 404 });
  }

  const file = form.get("banner");
  const gantiBanner = file instanceof File && file.size > 0;
  if (gantiBanner) {
    const tolak = periksaBanner(file);
    if (tolak) return tolak;
  }
  // "1" dari form: hapus bannernya tanpa menggantinya
  const hapusBanner = form.get("removeBanner") === "1";

  let bannerKey = lama.bannerKey;
  if (gantiBanner) {
    bannerKey = keyFor("banner", String(id.data.id), file.name);
    try {
      await putObject(bannerKey, await file.arrayBuffer(), file.type);
    } catch (e) {
      await deleteObject(bannerKey).catch(() => undefined);
      return Response.json(
        { error: `Banner gagal diunggah: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  } else if (hapusBanner) {
    bannerKey = null;
  }

  await db
    .update(announcements)
    .set({
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      audience: parsed.data.audience,
      pinned: parsed.data.pinned,
      bannerKey,
    })
    .where(eq(announcements.id, id.data.id));

  if (lama.bannerKey && lama.bannerKey !== bannerKey) {
    await deleteObject(lama.bannerKey).catch(() => undefined);
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "announcement.update",
    entity: "announcements",
    entityId: id.data.id,
    detail: `${parsed.data.title} · ${parsed.data.category}`,
  });

  revalidatePath("/pengumuman");
  return Response.json({ ok: true, id: id.data.id, bannerKey });
}

/** Hapus pengumuman beserta bannernya. `announcement_reads` ikut terhapus lewat
 *  ON DELETE CASCADE, jadi tidak ada baris yatim yang tertinggal. */
export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = deleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const [removed] = await db
    .delete(announcements)
    .where(eq(announcements.id, parsed.data.id))
    .returning({ title: announcements.title, bannerKey: announcements.bannerKey });

  if (!removed) {
    return Response.json({ error: "Pengumuman tidak ditemukan" }, { status: 404 });
  }
  // barisnya sudah hilang; objek yang tertinggal tidak boleh membuat penghapusan
  // yang berhasil terlihat gagal
  if (removed.bannerKey) await deleteObject(removed.bannerKey).catch(() => undefined);

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "announcement.delete",
    entity: "announcements",
    entityId: parsed.data.id,
    detail: removed.title,
  });

  revalidatePath("/pengumuman");
  return Response.json({ ok: true });
}
