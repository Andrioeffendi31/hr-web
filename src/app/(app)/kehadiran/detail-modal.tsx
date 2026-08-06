"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Camera, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AttBadge, Avatar } from "@/components/bits";
import { FileDrop } from "@/components/file-drop";
import { FilePreview } from "@/components/file-preview";
import { SelfieCell } from "./selfie-cell";
import {
  type AttStatus,
  durasi,
  ekstensi,
  formatJarak,
  jam,
  jarakMeter,
  overtimeMinutes,
  tanggalPanjang,
} from "@/lib/hr";
import { cn } from "@/lib/utils";

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
};

/** The geofence a punch was judged against — name included, because with several
 *  offices "dari titik absen" no longer says which one. */
export type Office = { name: string; lat: number; lng: number; radius: number };

export type DayDetail = {
  attendanceId: number;
  employeeId: number;
  name: string;
  nik: string;
  division: string;
  photoUrl: string | null;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: AttStatus;
  location: string | null;
  selfieUrl: string | null;
  events: AttEvent[];
  /** the office this day was punched against; null for WFH and for rows written
   *  before locations existed, in which case there is no distance to report */
  office: Office | null;
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

const koordinat = (lat: string, lng: string) =>
  `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

export function AttendanceDetail({
  detail: d,
  backHref,
}: {
  detail: DayDetail;
  backHref: string;
}) {
  const router = useRouter();

  const minutes =
    d.clockIn && d.clockOut ? overtimeMinutes(d.clockIn, d.clockOut) : null;

  const masuk = d.events.find((e) => e.kind === "masuk");
  const jarak =
    d.office && masuk?.lat && masuk.lng
      ? jarakMeter(d.office.lat, d.office.lng, Number(masuk.lat), Number(masuk.lng))
      : null;
  const cocok = jarak !== null && jarak <= d.office!.radius;

  // automatic pings, newest last (events already arrive ordered by `at`)
  const pings = d.events.filter((e) => e.kind === "lokasi");
  const sedangBekerja = Boolean(d.clockIn && !d.clockOut);

  return (
    <Dialog open onOpenChange={(open) => !open && router.push(backHref)}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-[720px]">
        {/* pr-14 keeps the badge clear of the dialog's close button */}
        <div className="flex items-center gap-3 border-b py-4 pr-14 pl-5">
          <Avatar name={d.name} photoKey={d.photoUrl} className="size-10 text-[13px]" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">
              {d.name}
            </DialogTitle>
            <p className="text-subtle text-[11.5px]">
              {d.nik} · {d.division}
            </p>
          </div>
          <AttBadge status={d.status} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-muted-foreground mb-3 text-[12.5px]">
            {tanggalPanjang(d.date)}
          </p>

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
              <div key={s.label} className="bg-surface-2 rounded-[11px] border p-3">
                <div className="text-subtle text-[11px]">{s.label}</div>
                <div className="tnum mt-0.5 text-[15px] font-semibold">{s.value}</div>
                {s.sub && <div className="text-subtle text-[11px]">{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Location. The mockup's whole geo presentation is this line of text —
              no map, so none is drawn here either. */}
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
                jarak === null ? "text-subtle" : cocok ? "text-success" : "text-warning",
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
                    <span className="tnum">{formatJarak(jarak)}</span> dari {d.office.name}
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
              {d.events.map((e) => (
                <TimelineEntry
                  key={e.id}
                  event={e}
                  name={d.name}
                  office={d.office}
                />
              ))}
            </ol>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t px-5 py-3.5">
          <Link
            href={`/karyawan?open=${d.employeeId}`}
            className="bg-surface-2 border-border-strong hover:bg-accent flex h-10 items-center justify-center rounded-[9px] border text-[13px] font-medium transition-colors"
          >
            Profil karyawan
          </Link>
          <Link
            href={`/kehadiran?div=${encodeURIComponent(d.division)}&date=${d.date}`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 items-center justify-center rounded-[9px] text-[13px] font-medium transition-colors"
          >
            Kehadiran divisi
          </Link>
        </div>
      </DialogContent>
    </Dialog>
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
  const up = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("kind", "event");
      fd.append("eventId", String(e.id));
      fd.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
      return data;
    },
    onSuccess: () => {
      toast.success("Foto kehadiran tersimpan");
      router.refresh();
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
          {e.note && <div className="mt-1 text-[12px]">{e.note}</div>}
        </div>

        {/* an automatic ping has no photographer, so no uploader is offered —
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
            maxBytes={1.5 * 1024 * 1024}
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
        )}
      </div>
    </li>
  );
}
