import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets } from "@/db/schema";

/**
 * Single-use password-reset links.
 *
 * Same shape and lifecycle as the WebAuthn challenges in lib/webauthn.ts, down to
 * consuming the row with DELETE ... RETURNING so a token cannot be redeemed twice
 * even by two requests racing each other.
 *
 * What is stored is sha256(token), never the token: the link in the email is the
 * secret, so reading this table gives an attacker a list of hashes and no way in.
 */
const TTL_MS = 60 * 60_000;
/** Long enough to survive a slow mail hop and somebody reading it after lunch;
 *  short enough that a forwarded email is not a standing key. */

const key = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issue a link, replacing whatever was outstanding for this employee. */
export async function putReset(employeeId: number) {
  const token = randomBytes(24).toString("base64url");
  // opportunistic sweep instead of a cron: this table is tiny and only ever
  // touched here, so the cheapest place to collect garbage is on the way in
  await db
    .delete(passwordResets)
    .where(lt(passwordResets.expiresAt, new Date()));
  // one live link per person — requesting a new one must retire the old
  await db
    .delete(passwordResets)
    .where(eq(passwordResets.employeeId, employeeId));
  await db.insert(passwordResets).values({
    id: key(token),
    employeeId,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return token;
}

/** Is this link still good? Does **not** consume it — the page renders with this,
 *  and a refresh must not burn the token before the form is submitted. */
export async function peekReset(token: string) {
  const [row] = await db
    .select({ employeeId: passwordResets.employeeId })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.id, key(token)),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Redeem it. Atomic, so a double submit cannot set two passwords. */
export async function takeReset(token: string) {
  const [row] = await db
    .delete(passwordResets)
    .where(eq(passwordResets.id, key(token)))
    .returning({
      employeeId: passwordResets.employeeId,
      expiresAt: passwordResets.expiresAt,
    });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/** Is this employee's outstanding link younger than `ms`? The cooldown for
 *  /api/password/forgot, using the row that already exists rather than a
 *  rate-limit table. */
export async function recentReset(employeeId: number, ms: number) {
  const [row] = await db
    .select({ expiresAt: passwordResets.expiresAt })
    .from(passwordResets)
    .where(eq(passwordResets.employeeId, employeeId))
    .limit(1);
  if (!row) return false;
  const issuedAt = row.expiresAt.getTime() - TTL_MS;
  return Date.now() - issuedAt < ms;
}
