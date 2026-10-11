/**
 * Status → label dan kelas warna. Salinan dari ATT/REQ di mobile/src/theme.ts,
 * dinyatakan dengan token Tailwind konsol web supaya kedua tema ikut otomatis.
 */
const TONE = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  accent: "bg-primary-subtle text-primary",
  muted: "bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof TONE;
export const toneClass = (t: Tone) => TONE[t];

const ATT: Record<string, { label: string; tone: Tone }> = {
  hadir: { label: "Hadir", tone: "success" },
  telat: { label: "Terlambat", tone: "warning" },
  wfh: { label: "WFH", tone: "info" },
  cuti: { label: "Cuti", tone: "muted" },
  izin: { label: "Izin", tone: "muted" },
  sakit: { label: "Sakit", tone: "info" },
  belum_absen: { label: "Belum absen", tone: "warning" },
  tanpa_keterangan: { label: "Tanpa keterangan", tone: "danger" },
  libur: { label: "Libur", tone: "muted" },
  belum_dicatat: { label: "Belum dicatat", tone: "muted" },
};

const REQ: Record<string, { label: string; tone: Tone }> = {
  menunggu: { label: "Menunggu", tone: "warning" },
  revisi: { label: "Perlu revisi", tone: "accent" },
  menunggu_pimpinan: { label: "Menunggu pimpinan", tone: "info" },
  disetujui: { label: "Disetujui", tone: "success" },
  ditolak: { label: "Ditolak", tone: "danger" },
  dibatalkan: { label: "Dibatalkan", tone: "muted" },
};

export const att = (s: string) => ATT[s] ?? ATT.belum_absen;
export const req = (s: string) => REQ[s] ?? REQ.menunggu;
