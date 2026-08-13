/**
 * Push notifications to the mobile app (PRD-Mobile §6.6).
 *
 * Expo Push Service, called with plain fetch: it is one HTTPS POST, so
 * expo-server-sdk would add a dependency to save a dozen lines. Expo also stands
 * between us and FCM/APNs, which is why there are no platform credentials here.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushTokens } from "@/db/schema";

const ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Where tapping the notification should land (PRD-Mobile §6.6 deep links). */
export type PushRoute = "/pengajuan" | "/" | "/kehadiran" | "/pengaturan";

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
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.employeeId, ids));
  if (rows.length === 0) return { sent: 0 };

  const message: Message = {
    to: rows.map((r) => r.token),
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
