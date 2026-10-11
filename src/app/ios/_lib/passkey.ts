import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { signIn } from "next-auth/react";

/**
 * Passkey (Face ID / Touch ID) di PWA — memakai endpoint WebAuthn yang sama
 * dengan login konsol web. rpID-nya domain web ini, jadi passkey yang dibuat di
 * PWA juga berlaku untuk login web di Safari, dan sebaliknya.
 */

export const passkeyDidukung = () => typeof window !== "undefined" && !!window.PublicKeyCredential;

/** Pengguna menutup sendiri sheet Face ID — bukan galat yang perlu diumumkan. */
export const dibatalkan = (e: unknown) => /abort|NotAllowed|timed out/i.test((e as Error)?.message ?? "");

export async function daftarPasskey() {
  const optRes = await fetch("/api/webauthn/register", { credentials: "same-origin" });
  const opt = (await optRes.json().catch(() => ({}))) as { options?: unknown; challengeId?: string; error?: string };
  if (!optRes.ok || !opt.options) throw new Error(opt.error ?? "Tidak bisa memulai pendaftaran passkey.");

  let attestation;
  try {
    attestation = await startRegistration(opt.options as Parameters<typeof startRegistration>[0]);
  } catch (e) {
    if (/InvalidState|already registered|excludeCredentials/i.test((e as Error).message))
      throw new Error("iPhone ini sudah terdaftar sebagai passkey.");
    throw e;
  }

  const res = await fetch("/api/webauthn/register", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: opt.challengeId, response: attestation, label: "iPhone (PWA)" }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Passkey gagal didaftarkan.");
  }
}

export async function masukPasskey() {
  const optRes = await fetch("/api/webauthn/login");
  if (!optRes.ok) throw new Error("Tidak bisa memulai login passkey.");
  const { options, challengeId } = await optRes.json();
  const assertion = await startAuthentication(options);
  const res = await signIn("passkey", {
    challengeId,
    response: JSON.stringify(assertion),
    redirect: false,
  });
  if (res?.error) throw new Error("Passkey tidak dikenali. Masuk dengan kata sandi.");
}
