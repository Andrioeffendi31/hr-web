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
 * Ukuran hasil untuk lebar maksimum `maxWidth`, TANPA pernah membesarkan.
 *
 * Murni dan diekspor supaya image.check.ts bisa menegaskannya tanpa DOM. Penjaga
 * "jangan besarkan" itu bukan optimasi melainkan koreksi kebenaran: canvas
 * meregangkan dua arah, jadi tanpanya foto struk 400px justru dinaikkan ke
 * 1600px dan berkasnya membengkak — kebalikan persis dari tujuan fungsi ini.
 * Saudara `shrinkImage` di mobile/src/image.ts menjelaskan hal yang sama.
 */
export function fitWidth(w: number, h: number, maxWidth: number) {
  if (w <= maxWidth) return { w, h };
  return { w: maxWidth, h: Math.max(1, Math.round((h * maxWidth) / w)) };
}

/** Nama asal dengan ekstensi diganti — supaya kunci objeknya tetap menyebut
 *  berkas yang diunggah orangnya, bukan kata "selfie" untuk setiap gambar. */
export function renameExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name) || "gambar";
  return `${base}.${ext}`;
}

/** Hanya gambar yang bisa dilewatkan canvas. PDF, CSV, XLSX dan DOCX lewat apa
 *  adanya — memaksakannya ke canvas hanya akan merusaknya. */
export function isImageFile(file: File): boolean {
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

/**
 * Bungkus pengaman: kompresi TIDAK BOLEH menggagalkan unggahan.
 *
 * Kalau browsernya tidak bisa memproses gambar, berkasnya bukan gambar, atau
 * encodernya menyerah — yang diunggah adalah berkas aslinya. Batas ukuran di
 * server tetap menjadi otoritasnya; ini cuma penghemat, dan penghemat yang bisa
 * membuat orang gagal absen bukan penghemat.
 */
async function amanKan(file: File, olah: () => Promise<File>): Promise<File> {
  if (!isImageFile(file) || typeof createImageBitmap !== "function") return file;
  try {
    const hasil = await olah();
    // hasil yang justru lebih besar tidak ada gunanya dikirim
    return hasil.size > 0 && hasil.size < file.size ? hasil : file;
  } catch {
    return file;
  }
}

/** Encode satu canvas menjadi File WebP, dengan nama yang mengikuti tipe yang
 *  benar-benar dihasilkan browsernya. */
async function encode(
  canvas: HTMLCanvasElement,
  quality: number,
  name: string,
): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Gagal memproses foto");
  // Safari before 14 ignores the requested type and hands back a PNG. The server
  // validates the extension against the filename, so the name is derived from
  // what the browser actually produced — both are accepted by allowed(ext,"photo"),
  // whereas hardcoding ".webp" would 400 on exactly those browsers.
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], renameExt(name, ext), { type: blob.type });
}

/**
 * Perkecil tanpa memotong.
 *
 * Saudara `toWebp`, bukan pemanggilnya, karena keduanya menjawab dua hal
 * berbeda. `toWebp` membuat potret: ia memotong ke rasio tetap karena hasilnya
 * akan tampil di dalam lingkaran atau bingkai 3:4. Yang ini menerima logo,
 * dokumen hasil pindaian, dan foto bukti — memotong tengahnya berarti membuang
 * bagian yang justru dicari orang.
 */
export async function shrinkImage(
  file: File,
  { maxWidth = 1600, quality = 0.72 }: { maxWidth?: number; quality?: number } = {},
): Promise<File> {
  return amanKan(file, async () => {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const target = fitWidth(bitmap.width, bitmap.height, maxWidth);

    const canvas = document.createElement("canvas");
    canvas.width = target.w;
    canvas.height = target.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar");
    ctx.drawImage(bitmap, 0, 0, target.w, target.h);
    bitmap.close();

    return encode(canvas, quality, file.name);
  });
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
  return amanKan(file, async () => {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const src = cropRect(bitmap.width, bitmap.height, ratio);

    const canvas = document.createElement("canvas");
    // jangan pernah membesarkan: sumber yang lebih kecil dari `width` sudah
    // sekecil yang bisa dicapai, dan meregangkannya hanya menambah byte
    canvas.width = Math.min(width, src.w);
    canvas.height = Math.round(canvas.width / ratio);
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

    return encode(canvas, quality, file.name);
  });
}
