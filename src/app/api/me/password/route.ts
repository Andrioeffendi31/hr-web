import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";
import { cekSandi, tooMany } from "@/lib/hr";
import { Bad, withMe } from "@/lib/me";

/**
 * An employee changing their own password.
 *
 * The current password is required — except for an account still carrying
 * `mustChangePassword`, where the "current" password is the one the import gave
 * everybody. Asking for it there would only prove the person can read the same
 * memo as everyone else, while locking out anyone who mistyped it once.
 */
// zod checks the shape only; the strength rule is cekSandi() in lib/hr.ts, so the
// reset routes and this one can never disagree about what a good password is
const body = z.object({
  current: z.string().max(200).optional(),
  next: z.string().max(200),
});

export const POST = withMe(async (me, req) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const { current, next } = parsed.data;

  if (!me.mustChangePassword) {
    if (!current) throw new Bad("Kata sandi saat ini wajib diisi");
    if (!(await bcrypt.compare(current, me.passwordHash))) {
      // counted only on a wrong answer: an authenticated session should not be
      // able to grind the password out of an idle logged-in browser
      if (tooMany(`sandi:${me.id}`, 5, 15 * 60_000)) {
        throw new Bad("Terlalu banyak percobaan, coba lagi nanti", 429);
      }
      throw new Bad("Kata sandi saat ini salah");
    }
  }

  const lemah = cekSandi(next);
  if (lemah) throw new Bad(lemah);

  // the shared import password is the one thing this flow exists to retire
  if (await bcrypt.compare(next, me.passwordHash)) {
    throw new Bad("Kata sandi baru harus berbeda dari yang lama");
  }

  await db
    .update(employees)
    .set({
      passwordHash: await bcrypt.hash(next, 10),
      mustChangePassword: false,
      // ends every other session: any token minted before this instant is refused
      // by lib/me.ts, (app)/layout.tsx and requireAdmin()
      passwordChangedAt: new Date(),
    })
    .where(eq(employees.id, me.id));

  await db.insert(auditLog).values({
    actorId: me.id,
    action: "employee.password_change",
    entity: "employees",
    entityId: me.id,
    detail: me.name,
  });

  return Response.json({ ok: true });
});
