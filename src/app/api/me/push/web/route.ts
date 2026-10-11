import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pushTokens } from "@/db/schema";
import { Bad, withMe } from "@/lib/me";
import {
  WEB_PLATFORM,
  registerPushToken,
  unregisterPushToken,
  webToken,
} from "@/lib/push";

/**
 * Web Push subscription for the iOS PWA — the /ios counterpart of
 * /api/me/push, which only accepts Expo tokens.
 *
 * Kept as its own route rather than a union in the Expo one: the two bodies
 * share nothing, and the Expo regex is what keeps junk out of a table whose
 * rows are later POSTed verbatim to Expo.
 */
const subscription = z.object({
  // Apple's push service is web.push.apple.com; https is all the spec promises
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const POST = withMe(async (me, req) => {
  const parsed = subscription.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Langganan notifikasi tidak valid");

  const token = webToken(parsed.data);
  // A subscription whose keys rotated keeps its endpoint: drop the old row for
  // the same endpoint first, or it would linger and fail on every send.
  await removeEndpoint(me.id, parsed.data.endpoint, token);
  await registerPushToken(me.id, token, WEB_PLATFORM);
  return Response.json({ ok: true });
});

export const DELETE = withMe(async (me, req) => {
  const parsed = z
    .object({ endpoint: z.string().url() })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Permintaan tidak valid");
  await removeEndpoint(me.id, parsed.data.endpoint);
  return Response.json({ ok: true });
});

/** Only the caller's own rows — logging out of one iPhone must not silence
 *  another, nor anybody else's. */
async function removeEndpoint(employeeId: number, endpoint: string, keep?: string) {
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(
      and(
        eq(pushTokens.employeeId, employeeId),
        eq(pushTokens.platform, WEB_PLATFORM),
      ),
    );
  for (const { token } of rows) {
    if (token === keep) continue;
    try {
      if ((JSON.parse(token) as { endpoint?: string }).endpoint === endpoint)
        await unregisterPushToken(employeeId, token);
    } catch {
      await unregisterPushToken(employeeId, token);
    }
  }
}
