import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import { cekSandi } from "@/lib/hr";
import { takeReset } from "@/lib/reset";

/**
 * "Lupa kata sandi" — step two. Public, because the token *is* the authentication:
 * possession of a link that was emailed to the address on the account.
 */
const body = z.object({
  token: z.string().min(10).max(200),
  next: z.string().max(200),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const { token, next } = parsed.data;

  // strength first: a rejected password must not consume the link, or a typo costs
  // the user another round of email
  const lemah = cekSandi(next);
  if (lemah) return Response.json({ error: lemah }, { status: 400 });

  const row = await takeReset(token);
  if (!row) {
    return Response.json(
      {
        error:
          "Tautan tidak berlaku atau sudah kedaluwarsa. Minta tautan baru.",
      },
      { status: 400 },
    );
  }

  const [emp] = await db
    .update(employees)
    .set({
      passwordHash: await bcrypt.hash(next, 10),
      // they chose this one themselves, so there is nothing left to force
      mustChangePassword: false,
      // and every session that existed before this moment is over — including the
      // one belonging to whoever may have taken the account
      passwordChangedAt: new Date(),
    })
    .where(eq(employees.id, row.employeeId))
    .returning({ name: employees.name });

  await db.insert(auditLog).values({
    actorId: row.employeeId,
    action: "employee.password_reset_self",
    entity: "employees",
    entityId: row.employeeId,
    detail: emp?.name ?? String(row.employeeId),
  });

  return Response.json({ ok: true });
}
