import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, leaveRequests, overtimeRequests } from "@/db/schema";
import { queueEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";

const body = z.object({
  kind: z.enum(["cuti", "lembur"]),
  id: z.coerce.number().int().positive(),
  action: z.enum(["disetujui", "ditolak", "revisi"]),
  note: z.string().max(500).optional(),
});

/** Approve / reject a leave or overtime request. Authorization is re-checked
 *  here, not assumed from the UI (PRD §7). */
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
  const { kind, id, action, note } = parsed.data;

  // "Minta revisi" sends it back to the employee rather than closing it out.
  const status = action === "revisi" ? "menunggu" : action;
  const table = kind === "cuti" ? leaveRequests : overtimeRequests;

  const [updated] = await db
    .update(table)
    .set({
      status,
      decisionNote: note ?? null,
      decidedById: Number(admin.id),
      decidedAt: new Date(),
    })
    .where(eq(table.id, id))
    .returning({ id: table.id, employeeId: table.employeeId });

  if (!updated) {
    return Response.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 });
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: `${kind}.${action}`,
    entity: kind === "cuti" ? "leave_requests" : "overtime_requests",
    entityId: id,
    detail: note ?? null,
  });

  await queueEmail({
    to: updated.employeeId,
    template: action === "revisi" ? "request_revision" : `request_${action}`,
    context: { kind, requestId: id, note },
  });

  // and to the phone, which is where the employee actually is (PRD-Mobile §6.6).
  // Deliberately after the DB write and never awaited for success: a decision is
  // recorded whether or not a notification lands.
  const label = kind === "cuti" ? "cuti" : "lembur";
  await sendPush({
    to: updated.employeeId,
    title:
      action === "disetujui"
        ? `Pengajuan ${label} disetujui`
        : action === "ditolak"
          ? `Pengajuan ${label} ditolak`
          : `Pengajuan ${label} perlu direvisi`,
    body: note?.trim() || `Buka Riwayat Pengajuan untuk detailnya.`,
    route: "/pengajuan",
  });

  revalidatePath(kind === "cuti" ? "/cuti" : "/lembur");
  revalidatePath("/kehadiran");

  return Response.json({ ok: true, status });
}
