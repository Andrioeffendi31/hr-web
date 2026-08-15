/** Self-check for the object-key helpers. Run: npm run check */
import assert from "node:assert/strict";
import { allowed, extOf, keyFor, safeName } from "./r2";

// extension drives the allowlist, so it must be case- and path-proof
assert.equal(extOf("Kontrak Kerja.PDF"), "pdf");
assert.equal(extOf("laporan.2026.xlsx"), "xlsx");
assert.equal(extOf("tanpa-ekstensi"), "");
assert.equal(extOf(".gitignore"), "", "dotfile has no extension");
assert.equal(extOf("arsip.tar.gz"), "gz");

assert.equal(allowed("pdf", "doc"), true);
assert.equal(allowed("exe", "doc"), false, "executables never pass");
assert.equal(allowed("php", "doc"), false);
assert.equal(allowed("pdf", "photo"), false, "a photo slot only takes images");
assert.equal(allowed("webp", "photo"), true);
// dokumen juga: unggahan berkas dari ponsel dikompres menjadi WebP lebih dulu
assert.equal(allowed("webp", "doc"), true);
assert.equal(allowed("", "doc"), false, "no extension, no upload");

// a name only ever becomes the tail of a key, so it must not carry path syntax
assert.equal(safeName("Kontrak Kerja 2026.pdf"), "kontrak-kerja-2026.pdf");
assert.equal(safeName("../../etc/passwd"), "etc-passwd", "cannot climb out");
assert.equal(safeName("a/b/c.pdf"), "a-b-c.pdf");
assert.equal(safeName("....pdf"), "pdf", "leading separators are dropped");
assert.equal(safeName("a/../b.pdf"), "a-b.pdf", "no double separators");
assert.equal(safeName("!!!"), "berkas", "never returns an empty segment");
assert.ok(safeName("x".repeat(200)).length <= 80, "key tail stays bounded");

// documents get a uuid because two people upload "kontrak.pdf"
const a = keyFor("doc", "kontrak", "Kontrak.pdf", "u1");
assert.equal(a, "docs/kontrak/u1-kontrak.pdf");
assert.notEqual(a, keyFor("doc", "kontrak", "Kontrak.pdf", "u2"));

// a photo key is unique per upload, so replacing one changes the URL and no cache
// can keep serving the face somebody just replaced — the caller deletes the old
assert.equal(keyFor("photo", "42", "", "abc"), "photo/42/abc");
assert.notEqual(keyFor("photo", "42"), keyFor("photo", "42"));
// selfie keys stay deterministic: one per punch, and the punch id is in the scope
assert.equal(keyFor("selfie", "42/2026-08-02"), "selfie/42/2026-08-02");

// every generated key stays inside its own prefix
for (const key of [a, keyFor("photo", "7"), keyFor("selfie", "7/2026-08-02")]) {
  assert.ok(!key.split("/").includes(".."), `${key} escapes its prefix`);
}

console.log("r2.check.ts ok");
