import { z } from "zod";
import { Bad, withMe } from "@/lib/me";
import { registerPushToken, unregisterPushToken } from "@/lib/push";

/**
 * Push token registration (PRD-Mobile §6.6, §8: registered at login, removed at
 * logout). The employee is taken from the session, so a device can only ever
 * subscribe itself to its own owner's notifications.
 */
const body = z.object({
  // ExpoPushToken[…] / ExponentPushToken[…] — rejecting anything else keeps
  // junk out of a table we later POST verbatim to Expo
  token: z
    .string()
    .regex(/^Exp(o|onent)PushToken\[[^\]]+\]$/, "token push tidak valid")
    .max(200),
  platform: z.enum(["ios", "android"]).optional(),
});

export const POST = withMe(async (me, req) => {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  await registerPushToken(me.id, parsed.data.token, parsed.data.platform ?? "unknown");
  return Response.json({ ok: true });
});

export const DELETE = withMe(async (me, req) => {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Permintaan tidak valid");
  await unregisterPushToken(me.id, parsed.data.token);
  return Response.json({ ok: true });
});
