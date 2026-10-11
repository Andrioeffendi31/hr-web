/**
 * Kecilkan foto di perangkat sebelum diunggah. Kamera iPhone menghasilkan
 * 3–5 MB, batas server 4 MB, dan selfie atau foto profil tidak butuh lebih dari
 * 1280 px. Gagal mengecilkan bukan alasan menggagalkan unggahan: file aslinya
 * dikirim apa adanya.
 */
export async function kecilkan(file: File, maks = 1280, nama = "foto.jpg"): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const skala = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * skala);
    c.height = Math.round(img.naturalHeight * skala);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], nama, { type: "image/jpeg" }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
