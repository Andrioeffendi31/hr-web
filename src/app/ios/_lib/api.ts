/**
 * Klien API PWA. Sesinya cookie NextAuth biasa (same-origin), jadi tidak ada
 * header yang perlu dibawa manual seperti di aplikasi Expo.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi.", 0);
  }
  if (res.status === 401) {
    window.location.replace("/ios/masuk");
    throw new ApiError("Sesi berakhir, silakan masuk lagi", 401);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { error?: string; code?: string }) : {};
  if (!res.ok) {
    throw new ApiError(data.error ?? "Gagal memuat data", res.status, data.code);
  }
  return data as T;
}

export const postJson = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** Multipart — tanpa content-type manual, supaya boundary-nya ikut. */
export const postForm = <T>(path: string, form: FormData, method = "POST") =>
  api<T>(path, { method, body: form });

/** Berkas R2 dilayani /api/files dengan pemeriksaan sesi per permintaan; cookie
 *  same-origin ikut otomatis, jadi kuncinya cukup dijadikan URL. */
export const fileUrl = (key: string) => `/api/files/${key}`;

/* ── Bentuk respons (salinan subset dari mobile/src/api.ts) ──────────────── */

export type Office = { id: number; name: string; lat: number; lng: number; radiusM: number };

export type Bootstrap = {
  profile: {
    id: number;
    nik: string;
    name: string;
    initials: string;
    division: string;
    position: string;
    mustChangePassword: boolean;
    photoKey: string | null;
    email: string;
    birthPlace: string | null;
    birthDate: string | null;
    gender: string | null;
    religion: string | null;
    address: string | null;
    phone: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    contractType: string | null;
    joinedAt: string | null;
    workLocation: string;
  };
  today: {
    date: string;
    clockIn: string | null;
    clockOut: string | null;
    status: string;
    location: string | null;
    officeId: number | null;
    izin: { start: string; end: string } | null;
  };
  shift: { start: string; end: string; toleranceMinutes: number };
  offices: Office[];
  defaultOfficeId: number | null;
  leave: { remaining: number; quota: number; used: number; expiresAt: string };
  pendingRequests: number;
  announcements: { id: number; title: string; category: string; date: string }[];
  team: {
    total: number;
    present: number;
    avatars: { id: number; initials: string; photoKey: string | null; name?: string }[];
  };
};

export type AttendanceMonth = {
  month: string;
  stats: { hadir: number; telat: number; cuti: number; tanpaKeterangan: number };
  days: { date: string; status: string; in: string; out: string; note: string }[];
};

export type RequestItem = {
  id: number;
  kind: "cuti" | "lembur";
  title: string;
  detail: string;
  note: string;
  status:
    | "menunggu"
    | "menunggu_pimpinan"
    | "revisi"
    | "disetujui"
    | "ditolak"
    | "dibatalkan";
  days?: number;
  type?: "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus" | "Izin Setengah Hari";
  startDate?: string;
  endDate?: string;
  reason?: string;
  delegateId?: number | null;
  delegateName?: string | null;
  createdAt?: string;
  attachment?: { key: string; name: string | null; size: number | null } | null;
  minutes?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  suratToken?: string;
};

export type Requests = {
  balance: { quota: number; used: number; remaining: number } | null;
  delegates: { id: number; name: string }[];
  cuti: RequestItem[];
  lembur: RequestItem[];
};

export type AttendanceDay = {
  date: string;
  status: string;
  in: string;
  out: string;
  location: string | null;
  note: string | null;
  selfieKey: string | null;
  shift: { start: string; end: string };
  office: string | null;
  ditolak: { type: string; startDate: string; endDate: string; note: string | null } | null;
  izin: { start: string; end: string } | null;
  lateReason: string | null;
  earlyReason: string | null;
  awayReason: string | null;
  review: { ok: boolean; note: string | null; at: string | null } | null;
  events: {
    id: number;
    kind: "masuk" | "keluar" | "catatan" | "lokasi";
    /** jam WIB yang SUDAH diformat server ("02.10"), bukan timestamp */
    at: string;
    location: string | null;
    note: string | null;
    suspect: string | null;
    jedaSesudah: { menit: number; tertunda: boolean } | null;
    photoKey: string | null;
    distanceM: number | null;
    lat: number | null;
    lng: number | null;
  }[];
};

export type Team = {
  date: string;
  members: {
    id: number;
    name: string;
    initials: string;
    position: string;
    division: string;
    status: string;
    detail: string;
    photoKey: string | null;
  }[];
};

export type LeaderboardRow = {
  id: number;
  name: string;
  division: string | null;
  photoKey: string | null;
  initials: string;
  rank: number;
  poin: number;
  tepatWaktu: number;
  telat: number;
  alpa: number;
  hari: number;
};

export type Leaderboard = {
  period: "week" | "month" | "all";
  dari: string;
  sampai: string;
  hariKerja: number;
  hariIni: { hadir: number; telat: number; izin: number; belum: number };
  me: LeaderboardRow | null;
  peringkatDari: number;
  leaders: LeaderboardRow[];
};

export type Documents = {
  storage: { usedBytes: number; quotaBytes: number; terpakai: string; kuota: string; sisa: string };
  items: {
    id: number;
    name: string;
    ext: string;
    folder: string;
    key: string;
    size: string;
    mine: boolean;
    uploadedAt: string;
  }[];
};
