import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { webauthnChallenges } from "@/db/schema";

export const CHALLENGE_TTL_MS = 3 * 60 * 1000;

/**
 * Relying-Party identity, derived from the request host.
 *
 * WebAuthn requires rpID to be the origin's registrable domain, so this can
 * never be a hardcoded constant — the same build serves localhost and the
 * Vercel domain. Behind Vercel's proxy the real host is in x-forwarded-host.
 */
export function rpFrom(headers: Headers) {
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const origin = `${proto}://${host}`;
  return {
    rpName: "Ruang HR",
    rpID: host.split(":")[0],
    origin,
    /**
     * Every origin a ceremony may legitimately come from. The browser sends the
     * web origin; the Android app sends `android:apk-key-hash:…` instead, and iOS
     * sends `https://<rpID>` which is already the web origin. Verification must
     * accept the set, or the mobile passkey (PRD-Mobile §7) fails as a forgery.
     */
    origins: [origin, ...androidOrigins()],
  };
}

/**
 * The Android app's WebAuthn origins, derived from the signing certificates —
 * the same env var that fills assetlinks.json, so what we publish and what we
 * accept cannot disagree.
 *
 * Plural, because a project legitimately has more than one signing key: EAS signs
 * the distributed build, `expo run:android` signs local dev builds with the debug
 * keystore, and Play App Signing re-signs on the way to the store. Credential
 * Manager only offers passkeys to an app whose *own* certificate is listed, so a
 * fingerprint missing here is not a verification failure later — it is the app
 * reporting "No create options available" and no passkey ever being made.
 *
 * ANDROID_CERT_SHA256 takes one fingerprint or several, comma-separated, in the
 * colon-hex form `eas credentials` and `keytool -list` print. The assetlinks route
 * already split on commas; this used to require exactly one and returned null for
 * anything else — so adding a second key would have quietly stopped accepting the
 * first one's ceremonies while still advertising both.
 */
export function androidOrigins(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.replace(/[^0-9a-fA-F]/g, ""))
    .filter((hex) => hex.length === 64)
    .map((hex) => `android:apk-key-hash:${Buffer.from(hex, "hex").toString("base64url")}`);
}

/** Stores a challenge server-side and returns the handle the client echoes back. */
export async function putChallenge(challenge: string, employeeId?: number) {
  const id = randomBytes(18).toString("base64url");
  // opportunistic sweep; avoids needing a cron for a table that stays tiny
  await db
    .delete(webauthnChallenges)
    .where(lt(webauthnChallenges.expiresAt, new Date()));
  await db.insert(webauthnChallenges).values({
    id,
    challenge,
    employeeId: employeeId ?? null,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return id;
}

/** Consumes a challenge — deleting on read makes it single-use, so a captured
 *  assertion cannot be replayed. Returns null if unknown or expired. */
export async function takeChallenge(id: string) {
  const [row] = await db
    .delete(webauthnChallenges)
    .where(eq(webauthnChallenges.id, id))
    .returning({
      challenge: webauthnChallenges.challenge,
      employeeId: webauthnChallenges.employeeId,
      expiresAt: webauthnChallenges.expiresAt,
    });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/** Human-readable label from the UA string, so a credential list is scannable. */
export function labelFromUserAgent(ua: string | null) {
  if (!ua) return "Perangkat tidak dikenal";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone/iPad"
    : /Macintosh/.test(ua)
      ? "Mac"
      : /Windows/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Perangkat";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : null;
  return browser ? `${os} · ${browser}` : os;
}
