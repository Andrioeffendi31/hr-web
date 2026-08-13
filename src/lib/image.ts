/**
 * Turning a browser file pick into something worth uploading.
 *
 * The web twin of mobile/src/image.ts, called with the same numbers (3:4, 720px,
 * quality 0.6) so a punch made from a phone browser and one made from the Expo
 * app land in R2 as comparable objects. A 12 MP camera shot comes out around
 * 60–90 KB, which is why MAX_IMAGE (4 MB) is never approached in practice.
 *
 * Browser-only — it touches createImageBitmap and canvas, so it must not be
 * imported from a server component.
 */

/**
 * The centre-crop source rectangle for `ratio` (width ÷ height).
 *
 * Pure and exported so image.check.ts can assert it without a DOM: the cropping
 * arithmetic is the part that is easy to get subtly wrong, and getting it wrong
 * means every selfie is off-centre forever.
 */
export function cropRect(w: number, h: number, ratio: number) {
  if (w / h > ratio) {
    // wider than the target — trim the sides
    const cw = Math.round(h * ratio);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  // taller than the target — trim top and bottom
  const ch = Math.round(w / ratio);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

/**
 * Centre-crop to `ratio`, downscale to `width`, re-encode.
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` rather than an
 * `<img>` + object URL: that older path ignores the EXIF orientation tag, so a
 * portrait taken on a phone held normally would be filed on its side. Choosing
 * the decoder that honours EXIF is the whole fix — no exif library needed.
 */
export async function toWebp(
  file: File,
  {
    ratio,
    width,
    quality = 0.6,
  }: { ratio: number; width: number; quality?: number },
): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const src = cropRect(bitmap.width, bitmap.height, ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width / ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar");
  ctx.drawImage(
    bitmap,
    src.x,
    src.y,
    src.w,
    src.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Gagal memproses foto");

  // Safari before 14 ignores the requested type and hands back a PNG. The server
  // validates the extension against the filename, so the name is derived from
  // what the browser actually produced — both are accepted by allowed(ext,"photo"),
  // whereas hardcoding ".webp" would 400 on exactly those browsers.
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `selfie.${ext}`, { type: blob.type });
}
