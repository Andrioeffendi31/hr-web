/**
 * Digital Asset Links — the Android half of the passkey setup (PRD-Mobile §7).
 *
 * `get_login_creds` is what lets Credential Manager offer this domain's passkeys
 * inside the app; `handle_all_urls` makes the notification deep links open it.
 *
 * The fingerprint comes from ANDROID_CERT_SHA256, the same env var that produces
 * the app's WebAuthn origin in lib/webauthn.ts — so a mismatch between what we
 * publish here and what we accept there is impossible.
 */
const PACKAGE_NAME = "app.nanumhr";

/** Google requires the colon-separated uppercase hex form. */
function fingerprints(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.replace(/[^0-9a-fA-F]/g, "").toUpperCase())
    .filter((f) => f.length === 64)
    .map((f) => f.match(/.{2}/g)!.join(":"));
}

export async function GET() {
  const certs = fingerprints();
  if (certs.length === 0) {
    return Response.json(
      { error: "ANDROID_CERT_SHA256 belum dikonfigurasi" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    [
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: certs,
        },
      },
    ],
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
