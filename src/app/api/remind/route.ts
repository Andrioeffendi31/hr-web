import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { queueEmail } from "@/lib/email";

const body = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  const { sent } = await queueEmail({
    to: parsed.data.ids,
    template: "attendance_reminder",
    context: { date: parsed.data.date },
  });

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "attendance.remind",
    entity: "attendance",
    detail: `${sent} pengingat untuk ${parsed.data.date}`,
  });

  return Response.json({ sent });
}
