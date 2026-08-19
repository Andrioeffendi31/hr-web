import { durasi, tanggalPanjang } from "@/lib/hr";

/**
 * What an email says, described once.
 *
 * Both renderings below are derived from this, so the plain-text part can never
 * drift from the HTML part — the classic multipart bug, where the text version
 * still promises last quarter's wording to exactly the readers who cannot see the
 * pretty one (screen readers, watch notifications, spam filters that score both).
 */
export type Isi = {
  judul: string;
  paragraf: string[];
  /** the one action this email exists to prompt */
  tombol?: { label: string; url: string };
  /** label/value facts, so the reader does not have to open the app to know what
   *  this is about */
  rincian?: [string, string][];
  /** small print: expiry, "do not reply", why they got this */
  catatan?: string;
};

/** System stack, never a webfont: @font-face is stripped or blocked by most
 *  clients, and the fallback then decides the design. Declared on every element
 *  rather than once on <body>, because Outlook does not inherit into tables. */
// Single quotes inside the stack, never double: this string is interpolated into
// style="…", so a double quote closes the attribute early and silently discards
// every declaration after it — which renders as Times with no colours at all.
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const BRAND = "#4f46e5";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const CANVAS = "#f4f7fb";

/** Minimal escaping — every value here is company data, not user HTML, but a
 *  colleague named "Ben & Co" must not break the markup. */
const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Table layout and inline styles, on purpose.
 *
 * Email clients are not browsers: Gmail's webmail strips <style> blocks in several
 * contexts, Outlook renders through Word, and neither flexbox nor grid can be
 * relied on. Tables with inline attributes are the only layout that survives all
 * of them, which is why this looks like 2005 HTML and should stay that way.
 *
 * No images either — not even a logo. A remote image is blocked by default in most
 * clients, so a logo-led design arrives as a broken frame; a text wordmark always
 * renders.
 */
export function renderHtml(isi: Isi, perusahaan: string) {
  const { judul, paragraf, tombol, rincian, catatan } = isi;

  const preheader = paragraf[0] ?? judul;

  const rows = (rincian ?? [])
    .map(
      ([k, v]) => `
              <tr>
                <td style="padding:6px 0;font-family:${FONT};color:${MUTED};font-size:13px;">${esc(k)}</td>
                <td style="padding:6px 0;font-family:${FONT};color:${INK};font-size:13px;font-weight:600;text-align:right;">${esc(v)}</td>
              </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(judul)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};">
<!-- the line clients show next to the subject; hidden in the message itself -->
<div style="display:none;font-family:${FONT};font-size:1px;color:${CANVAS};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <tr>
          <td style="padding:0 4px 14px;">
            <span style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};letter-spacing:-0.2px;">Nanum</span><span style="font-family:${FONT};font-size:15px;font-weight:700;color:${BRAND};letter-spacing:-0.2px;">HR</span>
            <span style="font-family:${FONT};font-size:12px;color:${MUTED};"> &nbsp;·&nbsp; ${esc(perusahaan)}</span>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:28px 26px;">
            <h1 style="margin:0 0 12px;font-family:${FONT};font-size:19px;line-height:1.35;font-weight:700;color:${INK};letter-spacing:-0.3px;">${esc(judul)}</h1>
            ${paragraf
              .map(
                (t) =>
                  `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.65;color:#374151;">${esc(t)}</p>`,
              )
              .join("\n            ")}
            ${
              rincian?.length
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};">${rows}
            </table>`
                : ""
            }
            ${
              tombol
                ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
              <tr>
                <td style="background:${BRAND};border-radius:9px;">
                  <a href="${esc(tombol.url)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(tombol.label)}</a>
                </td>
              </tr>
            </table>
            <!-- the same URL as text: buttons get mangled, forwarded, or stripped -->
            <p style="margin:10px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${MUTED};">Kalau tombol di atas tidak bisa diklik, salin tautan ini ke browser:<br>
              <!-- break-all on the URL only: applied to the whole paragraph it also
                   chops ordinary words in half on a narrow screen -->
              <span style="word-break:break-all;">${esc(tombol.url)}</span>
            </p>`
                : ""
            }
            ${
              catatan
                ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${esc(catatan)}</p>`
                : ""
            }
          </td>
        </tr>

        <tr>
          <td style="padding:16px 6px 0;font-family:${FONT};font-size:11.5px;line-height:1.6;color:${MUTED};">
            Email ini dikirim otomatis oleh NanumHR ${esc(perusahaan)}. Mohon jangan dibalas — hubungi tim HR kalau ada yang perlu ditanyakan.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The same content as prose. Not a stripped copy of the HTML — both are built
 *  from `Isi`, which is what keeps them saying the same thing. */
export function renderText(isi: Isi, perusahaan: string) {
  const out: string[] = [isi.judul, "", ...isi.paragraf];

  if (isi.rincian?.length) {
    out.push("");
    for (const [k, v] of isi.rincian) out.push(`${k}: ${v}`);
  }
  if (isi.tombol) {
    out.push("", `${isi.tombol.label}: ${isi.tombol.url}`);
  }
  if (isi.catatan) out.push("", isi.catatan);

  out.push(
    "",
    "—",
    `Email otomatis dari NanumHR ${perusahaan}. Mohon jangan dibalas.`,
  );
  return out.join("\n");
}

/** "Cuti" / "Lembur" — the two request kinds, spelled for a reader. */
const jenis = (kind: unknown) => (kind === "lembur" ? "Lembur" : "Cuti");

/**
 * Content per template.
 *
 * Every one of these is live: five fire from approve/reject/revise, submission and
 * the attendance reminder, and they all used to read "Halo X, <subject>." — which
 * is what an employee received after waiting two days for a leave decision.
 */
export function isiFor(
  template: string,
  name: string,
  base: string,
  context?: Record<string, unknown>,
): Isi {
  const c = context ?? {};
  const panggil = `Halo ${name},`;

  switch (template) {
    case "password_reset":
      return {
        judul: "Atur ulang kata sandi",
        paragraf: [
          panggil,
          "Ada permintaan untuk mengatur ulang kata sandi akun NanumHR Anda. Klik tombol di bawah untuk membuat kata sandi baru.",
        ],
        tombol: { label: "Buat kata sandi baru", url: String(c.url ?? "") },
        catatan:
          "Tautan berlaku 1 jam dan hanya bisa dipakai sekali. Kalau Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.",
      };

    case "request_submitted": {
      const k = jenis(c.kind);
      const durasiTeks =
        c.days !== undefined
          ? `${c.days} hari kerja`
          : c.minutes !== undefined
            ? durasi(Number(c.minutes))
            : "—";
      return {
        judul: `Pengajuan ${k.toLowerCase()} baru menunggu persetujuan`,
        paragraf: [
          panggil,
          `${String(c.from ?? "Seorang karyawan")} mengajukan ${k.toLowerCase()} dan menunggu keputusan Anda.`,
        ],
        rincian: [
          ["Pengaju", String(c.from ?? "—")],
          ["Jenis", k],
          ["Durasi", durasiTeks],
        ],
        tombol: {
          label: "Tinjau pengajuan",
          url: `${base}/${c.kind === "lembur" ? "lembur" : "cuti"}`,
        },
      };
    }

    case "request_disetujui":
      return {
        judul: `Pengajuan ${jenis(c.kind).toLowerCase()} Anda disetujui`,
        paragraf: [
          panggil,
          `Pengajuan ${jenis(c.kind).toLowerCase()} Anda sudah disetujui HR.`,
          ...(c.note ? [`Catatan dari HR: ${String(c.note)}`] : []),
        ],
        tombol: {
          label: "Lihat pengajuan saya",
          url: `${base}/buka/pengajuan`,
        },
      };

    case "request_ditolak":
      return {
        judul: `Pengajuan ${jenis(c.kind).toLowerCase()} Anda ditolak`,
        paragraf: [
          panggil,
          `Pengajuan ${jenis(c.kind).toLowerCase()} Anda tidak disetujui.`,
          ...(c.note
            ? [`Alasan dari HR: ${String(c.note)}`]
            : ["Hubungi tim HR kalau perlu penjelasan lebih lanjut."]),
        ],
        tombol: {
          label: "Lihat pengajuan saya",
          url: `${base}/buka/pengajuan`,
        },
      };

    case "request_revision":
      return {
        judul: `Pengajuan ${jenis(c.kind).toLowerCase()} Anda perlu direvisi`,
        paragraf: [
          panggil,
          "HR meminta perbaikan sebelum pengajuan ini bisa diputuskan. Silakan perbaiki lalu kirim ulang.",
          ...(c.note ? [`Yang perlu diperbaiki: ${String(c.note)}`] : []),
        ],
        tombol: { label: "Perbaiki pengajuan", url: `${base}/buka/pengajuan` },
      };

    /**
     * Ke Pimpinan, bukan ke pengaju: satu admin sudah memeriksa, dan pengajuannya
     * berhenti di sini sampai Pimpinan memutus. Tombolnya menuju konsol web —
     * persetujuan tingkat kedua tidak ada di aplikasi ponsel.
     */
    case "request_perlu_pimpinan":
      return {
        judul: `Pengajuan ${jenis(c.kind).toLowerCase()} menunggu persetujuan Anda`,
        paragraf: [
          panggil,
          "Sebuah pengajuan cuti sudah lolos pemeriksaan admin dan menunggu persetujuan akhir Anda. Tanpa itu, cutinya belum berlaku.",
          ...(c.note ? [`Catatan admin: ${String(c.note)}`] : []),
        ],
        tombol: { label: "Buka antrean cuti", url: `${base}/cuti` },
      };

    case "attendance_reminder": {
      const tgl = c.date ? tanggalPanjang(String(c.date)) : "hari ini";
      return {
        judul: "Anda belum absen masuk",
        paragraf: [
          panggil,
          `Sampai saat ini belum ada catatan absen masuk untuk ${tgl}. Kalau Anda sedang bekerja, jangan lupa absen lewat aplikasi.`,
          "Kalau Anda cuti, izin, atau sakit, ajukan lewat menu Pengajuan supaya kehadiran Anda tercatat benar.",
        ],
        tombol: { label: "Absen sekarang", url: `${base}/buka/absen` },
      };
    }

    case "announcement_new":
      return {
        judul: "Pengumuman baru dari HR",
        paragraf: [
          panggil,
          ...(c.title ? [String(c.title)] : []),
          "Ada pengumuman baru yang perlu Anda baca.",
        ],
        tombol: { label: "Baca pengumuman", url: `${base}/buka/pengumuman` },
      };

    default:
      return { judul: template, paragraf: [panggil] };
  }
}
