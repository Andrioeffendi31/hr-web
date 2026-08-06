import { revalidatePath } from "next/cache";
import { Bad, withMe } from "@/lib/me";
import { replacePhoto } from "@/lib/photo";

/**
 * An employee's own profile photo (PRD §7: everybody manages their own account,
 * HR does not become a helpdesk for face pictures).
 *
 * `withMe` is the authorization: the id comes from the session, never from the
 * body, so this endpoint cannot be aimed at a colleague. HR keeps its own path
 * through /api/files, which can act on anyone and is admin-checked there.
 */
export const POST = withMe(async (me, req) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new Bad("Permintaan harus multipart/form-data");

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new Bad("Foto belum dipilih");

  try {
    const { key } = await replacePhoto({ employeeId: me.id, file, actorId: me.id });
    // the avatar rides in the app shell on every page, so the whole layout is stale
    revalidatePath("/", "layout");
    revalidatePath("/profil");
    return Response.json({ ok: true, key });
  } catch (e) {
    throw new Bad((e as Error).message, (e as { status?: number }).status ?? 400);
  }
});
