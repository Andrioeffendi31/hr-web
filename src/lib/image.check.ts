/** Self-check for the centre-crop arithmetic. Run: npm run check */
import assert from "node:assert/strict";
import { cropRect } from "./image";

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
  assert.ok(Math.abs(c.x * 2 + c.w - w) <= 1, `${w}x${h} not horizontally centred`);
  assert.ok(Math.abs(c.y * 2 + c.h - h) <= 1, `${w}x${h} not vertically centred`);
  // must never sample outside the source, or drawImage silently pads with black
  assert.ok(c.x >= 0 && c.y >= 0, `${w}x${h} crop starts off-image`);
  assert.ok(c.x + c.w <= w && c.y + c.h <= h, `${w}x${h} crop escapes the source`);
}

// a square source is wider than 3:4, so it loses width, not height
const sq = cropRect(1000, 1000, R);
assert.equal(sq.h, 1000);
assert.equal(sq.w, 750);

console.log("image.check.ts ok");
