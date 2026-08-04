/**
 * Apple App Site Association — the iOS half of what makes a passkey created in
 * the Ruang HR app usable for this domain (PRD-Mobile §7).
 *
 * `webcredentials` is the part passkeys need; `applinks` makes the notification
 * deep links open the app rather than Safari. Both key off the same appID, so
 * one env var (APPLE_TEAM_ID) configures the pair.
 *
 * Served from a route handler rather than public/ because the file must have no
 * extension and content-type application/json — which a static file at
 * public/.well-known/apple-app-site-association cannot guarantee, and because
 * the Team ID is deployment configuration, not source.
 *
 * iOS fetches this over HTTPS with no redirects allowed, so it must stay outside
 * the auth guard (see proxy.ts).
 */
const BUNDLE_ID = "co.id.nusantaradigital.ruanghr";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) {
    // an empty association is honest: nothing is delegated to an app we cannot
    // name. Answering 200 with a wrong appID would silently break enrolment.
    return Response.json(
      { error: "APPLE_TEAM_ID belum dikonfigurasi" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const appID = `${teamId}.${BUNDLE_ID}`;

  return Response.json(
    {
      webcredentials: { apps: [appID] },
      applinks: {
        details: [{ appIDs: [appID], components: [{ "/": "/*", comment: "semua rute" }] }],
      },
    },
    {
      headers: {
        "content-type": "application/json",
        // Apple's CDN caches this; an hour is short enough to fix a mistake and
        // long enough that enrolment is not gated on our uptime
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
