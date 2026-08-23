/** Self-check for the centre-crop arithmetic. Run: npm run check */
import assert from "node:assert/strict";
import { cropRect, fitWidth, isImageFile, renameExt, shrinkImage, toWebp } from "./image";

const R = 3 / 4; // the selfie ratio, portrait

// landscape source: trim the sides, keep full height, stay centred
assert.deepEqual(cropRect(4000, 3000, R), { x: 875, y: 0, w: 2250, h: 3000 });
// taller than 3:4: trim top and bottom, keep full width
assert.deepEqual(cropRect(3000, 4000, R), { x: 0, y: 0, w: 3000, h: 4000 });
assert.deepEqual(cropRect(1000, 2000, R), { x: 0, y: 334, w: 1000, h: 1333 });
// already exactly 3:4: nothing is cropped
assert.deepEqual(cropRect(720, 960, R), { x: 0, y: 0, w: 720, h: 960 });

// the crop is centred: what is trimmed off one side matches the other, give or
// take the single pixel an odd remainder cannot split
for (const [w, h] of [
  [4000, 3000],
  [1920, 1080],
  [1000, 999],
  [1000, 2000],
  [3, 5],
] as const) {
  const c = cropRect(w, h, R);
  assert.ok(
    Math.abs(c.x * 2 + c.w - w) <= 1,
    `${w}x${h} not horizontally centred`,
  );
  assert.ok(
    Math.abs(c.y * 2 + c.h - h) <= 1,
    `${w}x${h} not vertically centred`,
  );
  // must never sample outside the source, or drawImage silently pads with black
  assert.ok(c.x >= 0 && c.y >= 0, `${w}x${h} crop starts off-image`);
  assert.ok(
    c.x + c.w <= w && c.y + c.h <= h,
    `${w}x${h} crop escapes the source`,
  );
}

// a square source is wider than 3:4, so it loses width, not height
const sq = cropRect(1000, 1000, R);
assert.equal(sq.h, 1000);
assert.equal(sq.w, 750);

// fitWidth: mengecilkan sesuai rasio, dan TIDAK PERNAH membesarkan
assert.deepEqual(fitWidth(4000, 3000, 1600), { w: 1600, h: 1200 });
assert.deepEqual(fitWidth(3000, 4000, 1600), { w: 1600, h: 2133 });
// sudah lebih kecil → dibiarkan apa adanya. Tanpa penjaga ini foto struk 400px
// akan diregangkan ke 1600px dan berkasnya justru membengkak.
assert.deepEqual(fitWidth(400, 300, 1600), { w: 400, h: 300 });
assert.deepEqual(fitWidth(1600, 900, 1600), { w: 1600, h: 900 });
// gambar yang sangat panjang tidak boleh runtuh menjadi tinggi 0
assert.deepEqual(fitWidth(10000, 3, 100), { w: 100, h: 1 });

// nama berkas ikut ke kunci objek, jadi ekstensinya harus benar-benar tertukar
assert.equal(renameExt("Banner Rapat.PNG", "webp"), "Banner Rapat.webp");
assert.equal(renameExt("tanpa-ekstensi", "webp"), "tanpa-ekstensi.webp");
assert.equal(renameExt("arsip.tar.gz", "webp"), "arsip.tar.webp");
assert.equal(renameExt(".gitignore", "webp"), ".gitignore.webp");

// hanya gambar yang boleh masuk canvas; sisanya diunggah apa adanya
assert.equal(isImageFile(new File([], "foto.JPG")), true);
assert.equal(isImageFile(new File([], "foto.webp")), true);
assert.equal(isImageFile(new File([], "kontrak.pdf")), false);
assert.equal(isImageFile(new File([], "data.xlsx")), false);
assert.equal(isImageFile(new File([], "tanpa-ekstensi")), false);

/**
 * Kompresi TIDAK BOLEH menggagalkan unggahan.
 *
 * Node tidak punya `createImageBitmap`, jadi menjalankannya di sini menguji persis
 * cabang yang paling penting sekaligus paling mudah terlupakan: browser yang tidak
 * bisa memproses gambar harus mengembalikan berkas ASLINYA, bukan melempar. Kalau
 * penjaga itu hilang, setiap orang di browser lawas berhenti bisa mengunggah foto.
 *
 * Dibungkus fungsi, bukan top-level await: berkas ini di-transpile ke CJS oleh tsx.
 */
async function cekJatuhCadangan() {
  const asli = new File([new Uint8Array(64)], "foto.jpg", { type: "image/jpeg" });
  assert.equal(
    await toWebp(asli, { ratio: 1, width: 512 }),
    asli,
    "toWebp harus mengembalikan berkas asli, bukan melempar",
  );
  assert.equal(
    await shrinkImage(asli),
    asli,
    "shrinkImage harus mengembalikan berkas asli, bukan melempar",
  );
  // yang bukan gambar tidak pernah disentuh sama sekali
  const pdf = new File([new Uint8Array(8)], "kontrak.pdf", {
    type: "application/pdf",
  });
  assert.equal(await shrinkImage(pdf), pdf, "dokumen tidak boleh dipaksa ke canvas");
}

void cekJatuhCadangan().then(() => {
  console.log("image.check.ts ok");
});
