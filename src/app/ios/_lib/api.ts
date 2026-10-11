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
  team: { total: number; present: number };
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
};

export type Requests = {
  balance: { quota: number; used: number; remaining: number } | null;
  cuti: RequestItem[];
  lembur: RequestItem[];
};
