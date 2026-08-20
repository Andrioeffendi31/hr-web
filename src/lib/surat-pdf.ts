import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import qrcode from "qrcode-generator";
import { bungkusTeks, teksAman } from "./surat";

/**
 * Surat izin/cuti satu halaman A4, dibangun dengan pdf-lib.
 *
 * Kenapa PDF ditulis langsung dan bukan HTML yang dicetak: hasilnya harus sama
 * di mana pun dicetak. Halaman siap cetak menyerahkan margin, header browser,
 * dan skala ke pengaturan masing-masing orang, dan surat yang diserahkan ke
 * pihak luar bukan tempat untuk itu.
 *
 * Font: StandardFonts, yang tidak perlu berkas apa pun di disk (next/font tidak
 * meninggalkan .woff2 yang bisa dibaca) — dengan syarat setiap teks bebas dari
 * karakter di luar WinAnsi, yang dijaga `teksAman()` di lib/surat.ts.
 */

export type DataSurat = {
  nomor: string;
  perusahaan: string;
  status: string;
  /** judul surat, mis. "SURAT IZIN CUTI TAHUNAN" */
  judul: string;
  nama: string;
  nik: string;
  jabatan: string | null;
  divisi: string | null;
  /** baris rincian izin: label → isi, sudah diformat pemanggil */
  rincian: [string, string][];
  alasan: string;
  /** kota + tanggal penandatanganan, mis. "Jakarta, 20 Agustus 2026" */
  tempatTanggal: string;
  pemeriksa: string | null;
  penyetuju: string | null;
  urlVerifikasi: string;
};

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const TINTA = rgb(0.07, 0.09, 0.15);
const REDUP = rgb(0.42, 0.45, 0.5);
const GARIS = rgb(0.8, 0.82, 0.85);

/** Cap untuk surat yang belum (atau tidak) sah. `null` = tidak perlu dicap. */
function cap(status: string): string | null {
  if (status === "disetujui") return null;
  if (status === "ditolak") return "DITOLAK";
  if (status === "dibatalkan") return "DIBATALKAN";
  return "BELUM DISETUJUI";
}

export async function suratPdf(d: DataSurat): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reguler = await pdf.embedFont(StandardFonts.Helvetica);
  const tebal = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  const lebarIsi = A4.w - MARGIN * 2;
  let y = A4.h - MARGIN;

  const tulis = (
    teks: string,
    o: {
      x?: number;
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      tengah?: boolean;
    } = {},
  ) => {
    const size = o.size ?? 10.5;
    const font = o.bold ? tebal : reguler;
    const isi = teksAman(teks);
    const x = o.tengah
      ? (A4.w - font.widthOfTextAtSize(isi, size)) / 2
      : (o.x ?? MARGIN);
    page.drawText(isi, { x, y, size, font, color: o.color ?? TINTA });
  };

  // --- kop
  tulis(d.perusahaan, { size: 14, bold: true, tengah: true });
  y -= 15;
  tulis("Human Resources Department", { size: 9, color: REDUP, tengah: true });
  y -= 12;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.w - MARGIN, y },
    thickness: 1.2,
    color: TINTA,
  });

  // --- judul + nomor
  y -= 30;
  tulis(d.judul, { size: 12.5, bold: true, tengah: true });
  y -= 14;
  tulis(`Nomor: ${d.nomor}`, { size: 9.5, color: REDUP, tengah: true });

  // --- pembuka
  y -= 34;
  tulis("Yang bertanda tangan di bawah ini menerangkan bahwa:");

  // --- identitas
  const baris = (label: string, isi: string) => {
    y -= 17;
    tulis(label, { x: MARGIN + 14, size: 10.5, color: REDUP });
    tulis(":", { x: MARGIN + 118, size: 10.5, color: REDUP });
    tulis(isi || "—", { x: MARGIN + 128, size: 10.5 });
  };
  y -= 6;
  baris("Nama", d.nama);
  baris("NIK", d.nik);
  baris("Jabatan", d.jabatan ?? "—");
  baris("Divisi", d.divisi ?? "—");

  // --- rincian izin
  y -= 28;
  tulis("telah mengajukan izin dengan rincian sebagai berikut:");
  y -= 6;
  for (const [label, isi] of d.rincian) baris(label, isi);

  // --- alasan, dibungkus dalam kolom yang sama seperti nilai di atas
  y -= 17;
  tulis("Alasan", { x: MARGIN + 14, size: 10.5, color: REDUP });
  tulis(":", { x: MARGIN + 118, size: 10.5, color: REDUP });
  const kolom = lebarIsi - 128 + MARGIN - MARGIN;
  const barisAlasan = bungkusTeks(teksAman(d.alasan), kolom, (s) =>
    reguler.widthOfTextAtSize(s, 10.5),
  );
  barisAlasan.forEach((t, i) => {
    if (i > 0) y -= 14;
    tulis(t, { x: MARGIN + 128, size: 10.5 });
  });

  // --- penutup
  y -= 30;
  const penutup =
    d.status === "disetujui"
      ? "Surat ini diterbitkan sebagai keterangan sah atas izin tersebut dan berlaku sebagai bukti kehadiran pada tanggal di atas."
      : `Pengajuan ini berstatus "${d.status.replace(/_/g, " ")}" pada saat surat ini diunduh, sehingga BELUM dapat dipakai sebagai bukti izin yang sah.`;
  for (const t of bungkusTeks(penutup, lebarIsi, (s) =>
    reguler.widthOfTextAtSize(s, 10.5),
  )) {
    tulis(t);
    y -= 14;
  }

  // --- tanda tangan: QR-nya sendiri yang menjadi tanda tangannya
  y -= 26;
  const qrKanan = A4.w - MARGIN;
  const qrUkuran = 92;
  const qrX = qrKanan - qrUkuran;
  tulis(d.tempatTanggal, { x: qrX, size: 10 });
  const qrY = y - 12 - qrUkuran;
  gambarQr(page, d.urlVerifikasi, qrX, qrY, qrUkuran);
  y = qrY - 14;
  tulis(d.penyetuju ?? "Menunggu persetujuan", {
    x: qrX,
    size: 10.5,
    bold: true,
  });
  y -= 13;
  tulis(d.penyetuju ? "Disetujui secara digital" : "Belum ditandatangani", {
    x: qrX,
    size: 9,
    color: REDUP,
  });
  if (d.pemeriksa) {
    y += 13;
    tulis(`Diperiksa oleh: ${d.pemeriksa}`, { size: 9.5, color: REDUP });
    y -= 13;
  }

  // --- catatan kaki verifikasi
  y = MARGIN + 26;
  page.drawLine({
    start: { x: MARGIN, y: y + 14 },
    end: { x: A4.w - MARGIN, y: y + 14 },
    thickness: 0.8,
    color: GARIS,
  });
  tulis(
    d.status === "disetujui"
      ? "Dokumen ini ditandatangani secara digital. Pindai QR di atas untuk memeriksa keasliannya:"
      : "Pindai QR di atas untuk memeriksa status pengajuan ini:",
    { size: 8.5, color: REDUP },
  );
  y -= 11;
  tulis(d.urlVerifikasi, { size: 8.5, color: REDUP });

  // --- cap, digambar terakhir supaya berada di atas teks
  const teksCap = cap(d.status);
  if (teksCap) {
    const size = 46;
    const w = tebal.widthOfTextAtSize(teksCap, size);
    page.drawText(teksCap, {
      x: (A4.w - w * 0.72) / 2,
      y: A4.h / 2 - 110,
      size,
      font: tebal,
      color: rgb(0.86, 0.24, 0.24),
      opacity: 0.22,
      rotate: degrees(38),
    });
  }

  return pdf.save();
}

/**
 * QR digambar sebagai persegi per modul — tanpa encoder PNG, tanpa canvas.
 *
 * Modul gelap yang bersebelahan dalam satu baris digabung menjadi satu persegi:
 * QR versi 4 punya ~1.100 modul, dan satu objek per modul membuat berkasnya
 * berlipat tanpa alasan.
 */
function gambarQr(
  page: ReturnType<PDFDocument["addPage"]>,
  isi: string,
  x0: number,
  y0: number,
  ukuran: number,
) {
  const qr = qrcode(0, "M");
  qr.addData(isi);
  qr.make();
  const n = qr.getModuleCount();
  // margin putih 2 modul (spesifikasi QR minta 4; 2 cukup di atas kertas putih
  // dan membuat kodenya tetap besar pada kotak 92pt)
  const sel = ukuran / (n + 4);
  const geser = sel * 2;
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      let panjang = 1;
      while (c + panjang < n && qr.isDark(r, c + panjang)) panjang++;
      page.drawRectangle({
        x: x0 + geser + c * sel,
        // baris QR dihitung dari atas, koordinat PDF dari bawah
        y: y0 + geser + (n - 1 - r) * sel,
        width: sel * panjang,
        height: sel,
        color: rgb(0, 0, 0),
      });
      c += panjang;
    }
  }
}
