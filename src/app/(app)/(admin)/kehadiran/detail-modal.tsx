"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  ExternalLink,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { shrinkImage } from "@/lib/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AttBadge, Avatar } from "@/components/bits";
import { PetaPanel } from "@/components/peta";
import { FileDrop } from "@/components/file-drop";
import { FilePreview } from "@/components/file-preview";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { SelfieCell } from "./selfie-cell";
import { EditJam } from "./edit-jam";
import {
  type AttStatus,
  durasi,
  ekstensi,
  formatJarak,
  jam,
  jarakMeter,
  jedaJejak,
  jamWib,
  CATATAN_TERTUNDA,
  jejakAbsen,
  overtimeMinutes,
  tanggalPanjang,
} from "@/lib/hr";
import { cn } from "@/lib/utils";

/** Batas pilihan di sisi klien, BUKAN batas simpannya. Gambarnya dikecilkan
 *  dulu di browser, jadi yang mendarat di server hampir selalu ratusan KB;
 *  menolak foto kamera 12 MP sebelum sempat dikecilkan justru menghapus
 *  gunanya kompresi ini. Server tetap otoritas terakhirnya (MAX_IMAGE). */
const MAKS_PILIH = 20 * 1024 * 1024;

export type AttEvent = {
  id: number;
  kind: "masuk" | "keluar" | "catatan" | "lokasi";
  at: Date;
  location: string | null;
  /** numeric arrives as a string from the driver */
  lat: string | null;
  lng: string | null;
  photoUrl: string | null;
  note: string | null;
  /** kenapa titik ini patut dicurigai, atau null kalau bersih */
  suspect: string | null;
};

/** The geofence a punch was judged against — name included, because with several
 *  offices "dari titik absen" no longer says which one. */
export type Office = { name: string; lat: number; lng: number; radius: number };

export type DayDetail = {
  /** null kalau hari itu tidak punya baris absensi sama sekali */
  attendanceId: number | null;
  employeeId: number;
  name: string;
  nik: string;
  division: string | null;
  photoUrl: string | null;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: AttStatus;
  location: string | null;
  selfieUrl: string | null;
  events: AttEvent[];
  /** izin setengah hari yang DISETUJUI untuk hari ini — inilah sebabnya absen
   *  masuk yang terlihat siang tetap tercatat hadir */
  izin: { start: string; end: string } | null;
  /** pengajuan cuti yang ditolak dan mencakup hari ini — konteks, bukan status */
  ditolak: {
    type: string;
    startDate: string;
    endDate: string;
    note: string | null;
  } | null;
  /** the office this day was punched against; null for WFH and for rows written
   *  before locations existed, in which case there is no distance to report */
  office: Office | null;
  /** alasan yang ditulis karyawan di titik absen, wajib saat di luar jamnya */
  lateReason: string | null;
  earlyReason: string | null;
  /** ...dan saat absen keluar dari luar TEMPATnya; bisa berbarengan dengan yang di atas */
  awayReason: string | null;
  /** null = belum ditinjau · true = diterima (telat diputihkan) · false = ditolak */
  reviewOk: boolean | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

const KIND_LABEL = {
  masuk: "Absen masuk",
  keluar: "Absen keluar",
  catatan: "Catatan",
  lokasi: "Ping lokasi",
} as const;

const KIND_DOT = {
  masuk: "bg-success",
  keluar: "bg-info",
  catatan: "bg-muted-foreground",
  // dimmer than the two manual punches: automatic pings are context, not events
  lokasi: "bg-primary/50",
} as const;

const KIND_RING = {
  masuk: "bg-success-subtle",
  keluar: "bg-info-subtle",
  catatan: "bg-muted",
  lokasi: "bg-primary-subtle",
} as const;

/** WIB, matching every other time in the app. */
const waktu = (at: Date) =>
  at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

/**
 * Satu lubang pada jejak, sebagai baris di antara dua kejadian.
 *
 * Kalimatnya menyebut dua sebab sekaligus karena keduanya memang tidak bisa
 * dibedakan dari sini: yang membedakan justru ADA-nya baris — fix yang terambil
 * saat ponsel offline tetap tersimpan dan menyusul dengan waktu pengambilannya
 * (baris seperti itu bertanda "terkirim menyusul"). Yang tidak menyisakan apa pun
 * hanyalah aplikasi yang benar-benar berhenti berjalan.
 */
function JedaEntry({ menit, tertunda }: { menit?: number; tertunda: boolean }) {
  if (!menit) return null;
  return (
    <li className="relative mb-5">
      <span
        aria-hidden
        className="bg-warning-subtle ring-card absolute top-0.5 left-[-30px] flex size-[18px] items-center justify-center rounded-full ring-2"
      >
        <AlertTriangle className="text-warning size-3" aria-hidden />
      </span>
      <div className="text-[12.5px] font-medium">
        Tidak ada catatan selama {durasi(menit)}
      </div>
      <p className="text-subtle mt-0.5 text-[11.5px]">
        {tertunda
          ? "Ponsel tanpa jaringan — titik sesudahnya terkirim menyusul."
          : "Aplikasi kemungkinan ditutup, ponsel mati, atau dihentikan penghemat baterai."}
      </p>
    </li>
  );
}

const koordinat = (lat: string, lng: string) =>
  `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

/** Awalan kunci react-query untuk detail hari; dipakai juga oleh yang mengubahnya. */
export const DETAIL_KEY = "kehadiran-detail";

/**
 * Pemicu dialog detail: state, bukan `?open=` di URL.
 *
 * Dulu barisnya adalah tautan ke `?open=<id>` dan hari itu diambil oleh page.tsx,
 * jadi membuka satu baris berarti satu render server penuh untuk seluruh papan —
 * dan menutupnya satu lagi. Sekarang yang dibuka adalah state lokal dan yang
 * diambil hanya satu hari, lewat /api/attendance/detail.
 *
 * Yang hilang: tautan-dalam `?open=`. Tidak ada satu pun tempat di aplikasi ini
 * yang membuatnya, dan dialog detail bukan halaman yang orang kirim ke orang lain.
 */
export function AttendanceDetail({
  employeeId,
  date,
  className,
  children,
}: {
  employeeId: number;
  date: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [buka, setBuka] = useState(false);
  const q = useQuery({
    queryKey: [DETAIL_KEY, employeeId, date],
    // hanya saat dibuka: papan berisi puluhan baris, dan tidak ada gunanya
    // mengambil hari yang tidak dilihat siapa pun
    enabled: buka,
    queryFn: async (): Promise<DayDetail> => {
      const res = await fetch(
        `/api/attendance/detail?employee=${employeeId}&date=${date}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (data as { error?: string }).error ?? "Gagal memuat detail",
        );
      const d = data as DayDetail;
      // JSON tidak punya tanggal: garis waktunya menghitung selisih jam, jadi
      // yang mendarat sebagai teks harus jadi Date lagi sebelum dipakai
      return {
        ...d,
        reviewedAt: d.reviewedAt ? new Date(d.reviewedAt) : null,
        events: d.events.map((e) => ({ ...e, at: new Date(e.at) })),
      };
    },
  });

  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className={className}>
        {children}
      </button>
      <Dialog open={buka} onOpenChange={setBuka}>
        <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-[720px]">
          {q.data ? (
            <IsiDetail detail={q.data} />
          ) : (
            <div className="px-5 py-10 text-center">
              <DialogTitle className="text-[13.5px] font-medium">
                {q.error ? "Gagal memuat detail" : "Memuat detail…"}
              </DialogTitle>
              {q.error && (
                <p className="text-subtle mt-1 text-[12px]">
                  {(q.error as Error).message}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IsiDetail({ detail: d }: { detail: DayDetail }) {
  const minutes =
    d.clockIn && d.clockOut ? overtimeMinutes(d.clockIn, d.clockOut) : null;

  const masuk = d.events.find((e) => e.kind === "masuk");
  const jarak =
    d.office && masuk?.lat && masuk.lng
      ? jarakMeter(
          d.office.lat,
          d.office.lng,
          Number(masuk.lat),
          Number(masuk.lng),
        )
      : null;
  const cocok = jarak !== null && jarak <= d.office!.radius;

  // automatic pings, newest last (events already arrive ordered by `at`)
  const pings = d.events.filter((e) => e.kind === "lokasi");
  // how many of them landed outside the geofence — the one thing about a trail
  // worth knowing before deciding whether to read the trail
  const pingsLuar = d.office
    ? pings.filter(
        (e) =>
          e.lat &&
          e.lng &&
          jarakMeter(
            d.office!.lat,
            d.office!.lng,
            Number(e.lat),
            Number(e.lng),
          ) > d.office!.radius,
      ).length
    : 0;
  const sedangBekerja = Boolean(d.clockIn && !d.clockOut);

  /**
   * Lubang pada jejak, dipetakan ke kejadian yang mendahuluinya supaya baris
   * penjelasnya bisa disisipkan tepat di bawah baris itu.
   *
   * Batas kanannya: jam absen keluar, atau sekarang kalau harinya masih berjalan.
   * Hari yang sudah lewat tanpa absen keluar tidak punya batas yang jujur — jam
   * sekarang akan mengarang lubang sepanjang berhari-hari — jadi jeda ekornya
   * memang tidak dinilai.
   */
  const jeda = new Map(
    jedaJejak(
      d.events.map((e) => e.at),
      sedangBekerja
        ? new Date()
        : d.clockOut
          ? new Date(`${d.date}T${d.clockOut}+07:00`)
          : null,
    ).map((j) => [j.setelah.getTime(), j.menit]),
  );
  const titik = jejakAbsen(d.events, d.office);

  return (
    <>
      {/* pr-14 keeps the badge clear of the dialog's close button */}
      <div className="flex items-center gap-3 border-b py-4 pr-14 pl-5">
        <Avatar
          name={d.name}
          photoKey={d.photoUrl}
          className="size-10 text-[13px]"
        />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-[15px] font-semibold">
            {d.name}
          </DialogTitle>
          <p className="text-subtle text-[11.5px]">
            {d.nik}
            {d.division ? ` · ${d.division}` : ""}
          </p>
        </div>
        <AttBadge status={d.status} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[12.5px]">
            {tanggalPanjang(d.date)}
          </p>
          <EditJam
            employeeId={d.employeeId}
            date={d.date}
            name={d.name}
            clockIn={d.clockIn}
            clockOut={d.clockOut}
          />
        </div>

        {/* Membedakan "tidak pernah minta izin" dari "sudah minta, ditolak, tetap
              tidak masuk" — tanpa membuat status kedua untuknya. */}
        {d.ditolak && (
          <div className="bg-warning-subtle border-warning/30 mb-3 rounded-[11px] border p-3">
            <div className="text-[12.5px] font-medium">
              Pengajuan {d.ditolak.type.toLowerCase()} ditolak
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11.5px]">
              {d.ditolak.startDate} s/d {d.ditolak.endDate}
              {d.ditolak.note ? ` · ${d.ditolak.note}` : ""}
            </p>
          </div>
        )}

        {/* Kenapa hari ini terbaca Hadir padahal masuknya siang: izinnya sudah
              disetujui, dan batas keterlambatannya digeser ke jam selesai izin. */}
        {d.izin && (
          <div className="bg-info-subtle border-info/30 mb-3 rounded-[11px] border p-3">
            <div className="text-[12.5px] font-medium">
              Izin setengah hari disetujui
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11.5px]">
              {d.izin.start}–{d.izin.end} · batas keterlambatan hari ini
              mengikuti jam ini
            </p>
          </div>
        )}

        <KartuAlasan d={d} />

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Masuk", value: jam(d.clockIn) },
            { label: "Keluar", value: jam(d.clockOut) },
            {
              label: "Total kerja",
              value: minutes !== null ? durasi(minutes) : "—",
              sub: d.clockIn && !d.clockOut ? "sedang bekerja" : undefined,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-surface-2 rounded-[11px] border p-3"
            >
              <div className="text-subtle text-[11px]">{s.label}</div>
              <div className="tnum mt-0.5 text-[15px] font-semibold">
                {s.value}
              </div>
              {s.sub && <div className="text-subtle text-[11px]">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Location: the verdict in one line, the evidence on the map below it */}
        <div
          className={cn(
            "mt-3 flex items-start gap-3 rounded-[11px] border p-3",
            jarak === null
              ? "bg-surface-2"
              : cocok
                ? "bg-success-subtle border-success/30"
                : "bg-warning-subtle border-warning/30",
          )}
        >
          <span
            className={cn(
              "mt-0.5 shrink-0",
              jarak === null
                ? "text-subtle"
                : cocok
                  ? "text-success"
                  : "text-warning",
            )}
          >
            <MapPin className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium">
              {d.location ?? "Lokasi tidak dicatat"}
            </div>
            <div className="text-muted-foreground mt-0.5 text-[11.5px]">
              {!d.office ? (
                "Tanpa titik kantor (WFH)"
              ) : jarak === null ? (
                "Koordinat tidak direkam"
              ) : (
                <>
                  {cocok ? "Lokasi cocok" : "Di luar radius"} ·{" "}
                  <span className="tnum">{formatJarak(jarak)}</span> dari{" "}
                  {d.office.name}
                  {!cocok && ` (radius ${d.office.radius} m)`}
                </>
              )}
            </div>
            {/* the monitoring state is visible without scrolling to the rail */}
            <div className="text-subtle mt-1 text-[11px]">
              {pings.length === 0
                ? sedangBekerja
                  ? "Terpantau tiap 3 jam · belum ada ping otomatis"
                  : "Tidak ada ping otomatis hari ini"
                : `Terpantau tiap 3 jam · ${pings.length} ping · terakhir ${waktu(
                    pings[pings.length - 1].at,
                  )}`}
              {pingsLuar > 0 && (
                <span className="text-warning font-medium">
                  {" "}
                  · {pingsLuar} di luar radius
                </span>
              )}
            </div>
          </div>
          {masuk?.lat && masuk.lng && (
            <a
              href={`https://www.google.com/maps?q=${masuk.lat},${masuk.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary shrink-0 text-[11.5px] font-medium hover:underline"
            >
              <ExternalLink className="mr-1 inline size-3" aria-hidden />
              Peta
            </a>
          )}
        </div>

        {titik.length > 0 && (
          <PetaPanel
            className="mt-3"
            height={240}
            trail
            points={
              d.office
                ? [
                    {
                      lat: d.office.lat,
                      lng: d.office.lng,
                      label: `${d.office.name} · radius ${d.office.radius} m`,
                      tone: "kantor" as const,
                    },
                    ...titik,
                  ]
                : titik
            }
            circles={
              d.office
                ? [
                    {
                      lat: d.office.lat,
                      lng: d.office.lng,
                      radiusM: d.office.radius,
                    },
                  ]
                : []
            }
            note={
              d.office
                ? "Garis putus-putus adalah urutan absen dan ping otomatis. Titik oranye jatuh di luar radius."
                : "Hari WFH — tidak ada radius kantor untuk dibandingkan."
            }
          />
        )}

        <div className="mt-5 mb-2.5 flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold">Log lokasi</h3>
          <span className="text-subtle text-[11px]">
            Foto hari ini
            <span className="ml-2 inline-flex translate-y-1.5">
              <SelfieCell
                employeeId={d.employeeId}
                name={d.name}
                date={d.date}
                selfieKey={d.selfieUrl}
                hasAttendance
              />
            </span>
          </span>
        </div>

        {d.events.length === 0 ? (
          <p className="text-subtle bg-surface-2 rounded-[11px] border px-3 py-6 text-center text-[12.5px]">
            Belum ada kejadian absen di hari ini.
          </p>
        ) : (
          <ol className="relative pl-[30px]">
            <span
              aria-hidden
              className="bg-border absolute top-1.5 bottom-1.5 left-[8px] w-[2px]"
            />
            {d.events.map((e, i) => (
              <Fragment key={e.id}>
                <TimelineEntry event={e} name={d.name} office={d.office} />
                <JedaEntry
                  menit={jeda.get(e.at.getTime())}
                  // sebab lubangnya terbaca dari titik SESUDAHNYA: kalau ia
                  // tertunda, fix-nya tetap terambil dan yang hilang cuma sinyal
                  tertunda={Boolean(
                    d.events[i + 1]?.note?.includes(CATATAN_TERTUNDA),
                  )}
                />
              </Fragment>
            ))}
          </ol>
        )}
      </div>

      {/* flex, bukan grid-cols-2: karyawan tanpa divisi hanya punya satu tombol,
            dan grid dua kolom menyisakan setengah baris kosong di sampingnya */}
      <div className="flex gap-2 border-t px-5 py-3.5">
        <Link
          href={`/karyawan?open=${d.employeeId}`}
          className="bg-surface-2 border-border-strong hover:bg-accent flex h-10 flex-1 items-center justify-center rounded-[9px] border text-[13px] font-medium transition-colors"
        >
          Profil karyawan
        </Link>
        {d.division && (
          <Link
            href={`/kehadiran?div=${encodeURIComponent(d.division)}&date=${d.date}`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 items-center justify-center rounded-[9px] text-[13px] font-medium transition-colors"
          >
            Kehadiran divisi
          </Link>
        )}
      </div>
    </>
  );
}

/**
 * Alasan karyawan + keputusan admin atasnya.
 *
 * Memutihkan TIDAK menulis ulang status hari itu: yang dikirim hanyalah keputusan,
 * dan statusnya dihitung ulang dari situ setiap kali dibaca (lib/kehadiran.ts).
 * Karena itu keputusan yang salah bisa dibalik dengan menekan tombol yang lain —
 * tidak ada yang perlu dipulihkan.
 */
function KartuAlasan({ d }: { d: DayDetail }) {
  const router = useRouter();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (input: { ok: boolean; note: string }) => {
      const res = await fetch("/api/attendance/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: d.attendanceId,
          ok: input.ok,
          note: input.note || undefined,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(error ?? "Gagal menyimpan tinjauan");
      }
      return input;
    },
    onSuccess: ({ ok }) => {
      toast.success(
        ok ? `Keterlambatan ${d.name} diputihkan` : `Alasan ${d.name} ditolak`,
      );
      // dua-duanya: papannya dirender server, dialognya diambil klien
      router.refresh();
      qc.invalidateQueries({ queryKey: [DETAIL_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!d.attendanceId || (!d.lateReason && !d.earlyReason && !d.awayReason))
    return null;

  const diputihkan = d.reviewOk === true && d.status === "hadir";

  return (
    <div
      className={cn(
        "mb-3 rounded-[11px] border p-3",
        d.reviewOk === null
          ? "bg-warning-subtle border-warning/30"
          : d.reviewOk
            ? "bg-success-subtle border-success/30"
            : "bg-surface-2",
      )}
    >
      <div className="text-[12.5px] font-medium">
        {d.reviewOk === null
          ? "Alasan menunggu tinjauan"
          : d.reviewOk
            ? "Alasan diterima"
            : "Alasan ditolak"}
      </div>

      {d.lateReason && (
        <p className="mt-1 text-[12px]">
          <span className="text-subtle">Terlambat:</span> {d.lateReason}
        </p>
      )}
      {d.earlyReason && (
        <p className="mt-1 text-[12px]">
          <span className="text-subtle">Pulang cepat:</span> {d.earlyReason}
        </p>
      )}
      {d.awayReason && (
        <p className="mt-1 text-[12px]">
          <span className="text-subtle">Keluar di luar kantor:</span>{" "}
          {d.awayReason}
        </p>
      )}

      {d.reviewOk !== null && (
        <p className="text-muted-foreground mt-1.5 text-[11.5px]">
          {d.reviewedBy ?? "Admin"}
          {d.reviewedAt
            ? ` · ${d.reviewedAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" })} ${jamWib(d.reviewedAt)}`
            : ""}
          {d.reviewNote ? ` · ${d.reviewNote}` : ""}
        </p>
      )}
      {/* Yang tersimpan tetap 'telat' — dikatakan terus-terang, supaya tidak ada
          yang menyangka catatannya hilang. */}
      {diputihkan && (
        <p className="text-subtle mt-1 text-[11px]">
          Tercatat hadir; keterlambatannya tetap tersimpan.
        </p>
      )}

      <div className="mt-2.5 flex gap-2">
        <ReasonDialog
          trigger={
            <Button size="sm" disabled={m.isPending || d.reviewOk === true}>
              Putihkan
            </Button>
          }
          title="Putihkan keterlambatan"
          description={`Hari ini akan terbaca hadir untuk ${d.name}. Statusnya tetap tersimpan sebagai terlambat.`}
          label="Catatan"
          placeholder="Misal: sesuai bukti yang dikirim"
          confirmLabel="Putihkan"
          onSubmit={(note) => m.mutate({ ok: true, note })}
        />
        <ReasonDialog
          trigger={
            <Button
              size="sm"
              variant="outline"
              disabled={m.isPending || d.reviewOk === false}
            >
              Tolak alasan
            </Button>
          }
          title="Tolak alasan"
          description={`${d.name} tetap tercatat terlambat, dan melihat catatan Anda di aplikasinya.`}
          label="Alasan penolakan"
          required
          confirmLabel="Tolak"
          onSubmit={(note) => m.mutate({ ok: false, note })}
        />
      </div>
    </div>
  );
}

/** One rail entry: dot, subject line, mono metadata, and the optional photo for
 *  that moment (Design System §timeline). */
function TimelineEntry({
  event: e,
  name,
  office,
}: {
  event: AttEvent;
  name: string;
  office: Office | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const up = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("kind", "event");
      fd.append("eventId", String(e.id));
      // shrinkImage, bukan toWebp: ini foto bukti kehadiran, dan memotong
      // tengahnya berarti membuang bagian yang justru dicari orang saat memeriksa
      fd.append("file", await shrinkImage(file, { maxWidth: 1600 }));
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
      return data;
    },
    onSuccess: () => {
      toast.success("Foto kehadiran tersimpan");
      router.refresh();
      qc.invalidateQueries({ queryKey: [DETAIL_KEY] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const jarak =
    office && e.lat && e.lng
      ? jarakMeter(office.lat, office.lng, Number(e.lat), Number(e.lng))
      : null;
  const src = e.photoUrl ? `/api/files/${e.photoUrl}` : null;
  const label = `${KIND_LABEL[e.kind]} ${name}`;

  return (
    <li className="relative mb-5 last:mb-0">
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-[-30px] flex size-[18px] items-center justify-center rounded-full ring-2 ring-[var(--card)]",
          KIND_RING[e.kind],
        )}
      >
        <span className={cn("size-[7px] rounded-full", KIND_DOT[e.kind])} />
      </span>

      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[13px]">
            <b className="font-semibold">{KIND_LABEL[e.kind]}</b>
            {e.location && (
              <span className="text-muted-foreground"> · {e.location}</span>
            )}
          </div>
          <div className="text-subtle tnum mt-0.5 text-[11.5px]">
            {waktu(e.at)}
            {e.lat && e.lng && ` · ${koordinat(e.lat, e.lng)}`}
            {jarak !== null && ` · ${formatJarak(jarak)} dari kantor`}
          </div>
          {/* a ping only carries a note when it fell outside the geofence, so that
              one gets the warning tone; a manual `catatan` is just text */}
          {e.note && (
            <div
              className={cn(
                "mt-1 text-[12px]",
                e.kind === "lokasi" && "text-warning font-medium",
              )}
            >
              {e.note}
            </div>
          )}
          {/* Merah, satu tingkat di atas "di luar radius": berada di tempat lain
              adalah fakta tentang hari itu, sedangkan koordinat karangan adalah
              fakta tentang catatannya sendiri. */}
          {e.suspect && (
            <div className="text-danger mt-1 flex items-center gap-1 text-[12px] font-medium">
              <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
              {e.suspect}
            </div>
          )}
        </div>

        {
          /* an automatic ping has no photographer, so no uploader is offered —
            api/files rejects kind:"lokasi" too, so the two cannot drift apart */
          e.kind === "lokasi" ? null : src ? (
            <FilePreview
              name={label}
              src={src}
              // event photo keys carry no extension, and only images land there
              ext={ekstensi(e.photoUrl!) || "jpg"}
              trigger={
                <button
                  type="button"
                  aria-label={`Lihat foto ${label}`}
                  className="focus-visible:ring-ring shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Foto ${label}`}
                    className="bg-muted size-10 rounded-md border object-cover"
                  />
                </button>
              }
            />
          ) : (
            <FileDrop
              accept=".jpg,.jpeg,.png,.webp"
              maxBytes={MAKS_PILIH}
              disabled={up.isPending}
              onFile={(f) => f && up.mutate(f)}
            >
              <span
                title={`Unggah foto ${label} — bisa juga ditarik ke sini`}
                className="text-subtle hover:text-primary hover:bg-accent flex size-10 items-center justify-center rounded-md border transition-colors"
              >
                <Camera className="size-4" aria-hidden />
                <span className="sr-only">Unggah foto {label}</span>
              </span>
            </FileDrop>
          )
        }
      </div>
    </li>
  );
}
