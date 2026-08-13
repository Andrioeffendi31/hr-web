import assert from "node:assert/strict";
import { androidOrigins, userHandle } from "./webauthn";

/**
 * assetlinks.json and the accepted WebAuthn origins are driven by one env var and
 * must read it the same way. They did not: the route split on commas while the
 * origin helper required exactly 64 hex characters, so a second signing key made
 * the app advertise two certificates and accept neither.
 */
const set = (v?: string) => {
  if (v === undefined) delete process.env.ANDROID_CERT_SHA256;
  else process.env.ANDROID_CERT_SHA256 = v;
};

const EAS =
  "00:FA:6E:E1:FA:33:D5:98:5B:F1:79:AD:F8:19:F2:05:32:18:5C:40:CD:BF:C3:15:97:C4:F4:16:72:9E:28:3D";
const DEBUG =
  "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";

set(undefined);
assert.deepEqual(
  androidOrigins(),
  [],
  "unset means the app simply cannot use passkeys",
);

set(EAS);
assert.equal(androidOrigins().length, 1, "one fingerprint, one origin");
assert.ok(androidOrigins()[0].startsWith("android:apk-key-hash:"));

// the case that was broken: the EAS build and a local debug build side by side
set(`${EAS},${DEBUG}`);
assert.equal(androidOrigins().length, 2, "both signing keys must be accepted");
assert.notEqual(androidOrigins()[0], androidOrigins()[1]);

// whitespace and lowercase are how these get pasted out of a terminal
set(` ${EAS.toLowerCase()} , ${DEBUG} `);
assert.equal(
  androidOrigins().length,
  2,
  "formatting must not silently drop a key",
);

set("nonsense");
assert.deepEqual(
  androidOrigins(),
  [],
  "a malformed value is no key, not a bad one",
);

/**
 * user.id must survive a strict base64url decode, because Android's Credential
 * Manager does exactly that with the JSON we hand it — and answers "No create
 * options available" when it cannot, which names neither the field nor the reason.
 */
for (const id of [1, 3, 42, 12345]) {
  const handle = userHandle(id);
  assert.match(handle, /^[A-Za-z0-9_-]+$/, `${handle} is not base64url`);
  assert.equal(
    handle.length % 4 !== 1,
    true,
    `${handle} is not a whole number of bytes`,
  );
  assert.equal(
    Buffer.from(handle, "base64url").toString("utf8"),
    String(id),
    "the handle must round-trip, even though only the client reads it",
  );
}
assert.notEqual(userHandle(3), "3", "the bare id is what broke Android");

console.log("webauthn.check.ts ok");
