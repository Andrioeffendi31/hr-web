/**
 * Push notifications to the mobile app (PRD-Mobile §6.6) and to the iOS PWA.
 *
 * Expo Push Service, called with plain fetch: it is one HTTPS POST, so
 * expo-server-sdk would add a dependency to save a dozen lines. Expo also stands
 * between us and FCM/APNs, which is why there are no platform credentials here.
 *
 * The PWA (/ios) cannot use Expo: Safari speaks standard Web Push, which needs
 * VAPID signing and aes128gcm payload encryption. That is the part `web-push`
 * carries — a few hundred lines of crypto that are not worth owning. Its rows
 * live in the same `push_tokens` table with platform "web", and the token
 * column holds the whole subscription as JSON, because a Web Push target is an
 * endpoint *plus* two keys and the table has no other place for them.
 */
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { pushTokens } from "@/db/schema";

export const WEB_PLATFORM = "web";

const ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Where tapping the notification should land (PRD-Mobile §6.6 deep links). */
export type PushRoute = "/pengajuan" | "/" | "/kehadiran" | "/pengaturan";

/** The same destinations inside the PWA, which lives under /ios. */
const webUrl = (route: PushRoute) => (route === "/" ? "/ios" : `/ios${route}`);

type Message = {
  to: string[];
  title: string;
  body: string;
  data: { route: PushRoute };
  sound: "default";
  channelId: "default";
};

type TicketResponse = {
  data?: {
    status: "ok" | "error";
    id?: string;
    details?: { error?: string };
  }[];
  errors?: { message: string }[];
};

/**
 * Fire-and-forget: a failed push must never fail the request that caused it.
 * Approving leave that then 500s because a phone is unreachable would be the
 * worse bug, so everything here is caught and logged.
 */
export async function sendPush({
  to,
  title,
  body,
  route,
}: {
  to: number | number[];
  title: string;
  body: string;
  route: PushRoute;
}) {
  const ids = Array.isArray(to) ? to : [to];
  if (ids.length === 0) return { sent: 0 };

  const rows = await db
    .select({ token: pushTokens.token, platform: pushTokens.platform })
    .from(pushTokens)
    .where(inArray(pushTokens.employeeId, ids));
  if (rows.length === 0) return { sent: 0 };

  const expo = rows
    .filter((r) => r.platform !== WEB_PLATFORM)
    .map((r) => r.token);
  const web = rows
    .filter((r) => r.platform === WEB_PLATFORM)
    .map((r) => r.token);

  const [a, b] = await Promise.all([
    sendExpo(expo, title, body, route),
    sendWebPush(web, { title, body, url: webUrl(route) }),
  ]);
  return { sent: a.sent + b.sent };
}

async function sendExpo(
  tokens: string[],
  title: string,
  body: string,
  route: PushRoute,
) {
  if (tokens.length === 0) return { sent: 0 };

  const message: Message = {
    to: tokens,
    title,
    body,
    data: { route },
    sound: "default",
    channelId: "default",
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(message),
    });
    const json = (await res.json().catch(() => ({}))) as TicketResponse;

    if (!res.ok || json.errors?.length) {
      console.warn(
        "[push] gagal:",
        res.status,
        json.errors?.[0]?.message ?? "",
      );
      return { sent: 0 };
    }

    // a DeviceNotRegistered ticket means the app was uninstalled; the row is dead
    // weight that would be retried on every future notification
    const dead = (json.data ?? [])
      .map((t, i) =>
        t.details?.error === "DeviceNotRegistered" ? message.to[i] : null,
      )
      .filter((t): t is string => t !== null);
    if (dead.length) {
      await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
    }

    return { sent: message.to.length - dead.length };
  } catch (e) {
    console.warn("[push] tidak terkirim:", (e as Error).message);
    return { sent: 0 };
  }
}

/* ── Web Push (iOS PWA) ───────────────────────────────────────────────────── */

export type WebSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

let vapidReady: boolean | null = null;

/** Lazily, so a deployment without the keys still boots and simply skips the
 *  web channel — the same posture as R2 and SMTP elsewhere. */
function vapid() {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.warn("[push] VAPID belum dikonfigurasi, Web Push dilewati");
    return (vapidReady = false);
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@localhost",
    pub,
    priv,
  );
  return (vapidReady = true);
}

/** Canonical JSON, so the same subscription always maps to the same token row. */
export const webToken = (s: WebSubscription) =>
  JSON.stringify({
    endpoint: s.endpoint,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  });

/**
 * Sends one notification to each stored subscription. `url` is where the
 * service worker opens the PWA when the notification is tapped.
 *
 * Same fire-and-forget contract as the Expo half. A 404/410 from the push
 * service means the subscription is gone (PWA removed, permission revoked), so
 * the row is deleted instead of being retried forever.
 */
export async function sendWebPush(
  tokens: string[],
  payload: { title: string; body: string; url: string; tag?: string },
) {
  if (tokens.length === 0 || !vapid()) return { sent: 0 };

  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const sub = JSON.parse(token) as WebSubscription;
        await webpush.sendNotification(sub, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: "high",
          topic: payload.tag,
        });
        return "ok" as const;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "dead" as const;
        console.warn("[push] web gagal:", status ?? (e as Error).message);
        return "fail" as const;
      }
    }),
  );

  const dead = tokens.filter((_, i) => results[i] === "dead");
  if (dead.length) {
    await db
      .delete(pushTokens)
      .where(inArray(pushTokens.token, dead))
      .catch((e) => console.warn("[push] gagal membersihkan:", e.message));
  }
  return { sent: results.filter((r) => r === "ok").length };
}

/** Upsert on the token, so re-registering the same install is a no-op. */
export async function registerPushToken(
  employeeId: number,
  token: string,
  platform: string,
) {
  await db
    .insert(pushTokens)
    .values({ employeeId, token, platform, lastUsedAt: new Date() })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { employeeId, platform, lastUsedAt: new Date() },
    });
}

/** Only ever removes the caller's own token — logout on one phone must not
 *  silence the others. */
export async function unregisterPushToken(employeeId: number, token: string) {
  await db
    .delete(pushTokens)
    .where(
      and(eq(pushTokens.token, token), eq(pushTokens.employeeId, employeeId)),
    );
}
