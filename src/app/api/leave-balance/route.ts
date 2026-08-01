import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, leaveAdjustments } from "@/db/schema";

const body = z.object({
  employeeId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2000).max(2100),
  /** carry-over or correction; replaces the previous value for that year */
  days: z.coerce.number().int().min(-30).max(30),
  note: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
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
  const { employeeId, year, days, note } = parsed.data;

  try {
    await db
      .insert(leaveAdjustments)
      .values({ employeeId, year, days, note: note || null })
      .onConflictDoUpdate({
        target: [leaveAdjustments.employeeId, leaveAdjustments.year],
        set: { days, note: note || null },
      });
  } catch {
    return Response.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "leave_balance.adjust",
    entity: "leave_adjustments",
    entityId: employeeId,
    detail: `${year}: ${days > 0 ? "+" : ""}${days} hari${note ? ` — ${note}` : ""}`,
  });

  revalidatePath("/cuti");
  revalidatePath("/karyawan");

  return Response.json({ ok: true, days });
}
