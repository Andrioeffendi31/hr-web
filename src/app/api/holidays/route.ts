import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, holidays } from "@/db/schema";
import { isIsoDate } from "@/lib/hr";

const isoDate = z
  .string()
  .refine(isIsoDate, "Tanggal harus YYYY-MM-DD dan tanggal nyata");

const upsertBody = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(120),
  collective: z.boolean().default(false),
});

const deleteBody = z.object({ date: isoDate });

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = upsertBody.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const { date, name, collective } = parsed.data;

  await db
    .insert(holidays)
    .values({ date, name, collective })
    .onConflictDoUpdate({ target: holidays.date, set: { name, collective } });

  await db.insert(auditLog).values({
    actorId: Number(actor.id),
    action: "holiday.upsert",
    entity: "holidays",
    detail: `${date} · ${name}${collective ? " · cuti bersama" : ""}`,
  });

  revalidatePath("/libur");
  revalidatePath("/cuti");
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = deleteBody.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const [removed] = await db
    .delete(holidays)
    .where(eq(holidays.date, parsed.data.date))
    .returning({ date: holidays.date, name: holidays.name });

  if (!removed) {
    return Response.json(
      { error: "Hari libur tidak ditemukan" },
      { status: 404 },
    );
  }

  await db.insert(auditLog).values({
    actorId: Number(actor.id),
    action: "holiday.delete",
    entity: "holidays",
    detail: `${removed.date} · ${removed.name}`,
  });

  revalidatePath("/libur");
  revalidatePath("/cuti");
  return Response.json({ ok: true });
}
