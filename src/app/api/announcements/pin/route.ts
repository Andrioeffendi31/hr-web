import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { announcements, auditLog } from "@/db/schema";

const body = z.object({
  id: z.coerce.number().int().positive(),
  pinned: z.boolean(),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const [updated] = await db
    .update(announcements)
    .set({ pinned: parsed.data.pinned })
    .where(eq(announcements.id, parsed.data.id))
    .returning({ id: announcements.id });

  if (!updated) {
    return Response.json({ error: "Pengumuman tidak ditemukan" }, { status: 404 });
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: parsed.data.pinned ? "announcement.pin" : "announcement.unpin",
    entity: "announcements",
    entityId: parsed.data.id,
  });

  revalidatePath("/pengumuman");
  return Response.json({ ok: true });
}
