import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { queueEmail } from "@/lib/email";
import { baseUrl } from "@/lib/url";
import { tooMany } from "@/lib/hr";
import { putReset, recentReset } from "@/lib/reset";

/**
 * "Lupa kata sandi" — step one. Public: whoever needs this cannot sign in.
 *
 * The response is `{ ok: true }` no matter what happens: unknown address, inactive
 * account, throttled, mail provider down. Anything that distinguishes those cases
 * turns this endpoint into a directory of who works here, which is exactly the
 * list a phishing campaign wants.
 */
const body = z.object({ email: z.string().trim().email().max(160) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  // even a malformed body gets the same answer as a valid one
  if (!parsed.success) return Response.json({ ok: true });
  const email = parsed.data.email.toLowerCase();

  // per-address ceiling, so one mailbox cannot be flooded by a script
  if (tooMany(`lupa:${email}`, 3, 60 * 60_000))
    return Response.json({ ok: true });

  const [emp] = await db
    .select({ id: employees.id, active: employees.active })
    .from(employees)
    .where(eq(employees.email, email))
    .limit(1);

  // an inactive account is not a login problem to solve
  if (emp?.active && !(await recentReset(emp.id, 2 * 60_000))) {
    const token = await putReset(emp.id);
    await queueEmail({
      to: emp.id,
      template: "password_reset",
      context: { url: `${baseUrl()}/atur-sandi?token=${token}` },
    });
  }

  return Response.json({ ok: true });
}
