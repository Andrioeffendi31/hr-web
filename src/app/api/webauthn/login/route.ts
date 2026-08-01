import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { putChallenge, rpFrom } from "@/lib/webauthn";

/**
 * Login challenge. Deliberately unauthenticated and identifier-free: passkeys
 * are registered as discoverable credentials, so the browser picks the account
 * and we never reveal whether a given email exists.
 */
export async function GET(req: Request) {
  const { rpID } = rpFrom(req.headers);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  const challengeId = await putChallenge(options.challenge);
  return Response.json({ options, challengeId });
}
