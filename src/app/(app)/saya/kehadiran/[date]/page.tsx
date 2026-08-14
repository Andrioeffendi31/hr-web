import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { attendanceEvents } from "@/db/schema";
import { AttBadge, Empty, PageHead, Panel } from "@/components/bits";
import { PetaPanel } from "@/components/peta";
import {
  type AttStatus,
  durasi,
  formatJarak,
  isIsoDate,
  jam,
  jarakMeter,
  jejakAbsen,
  overtimeMinutes,
  tanggalPanjang,
} from "@/lib/hr";
import { hariKaryawan } from "@/lib/kehadiran";
import { cn } from "@/lib/utils";

export const metadata = { title: "Detail Kehadiran — NanumHR" };

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
  lokasi: "bg-primary/50",
} as const;

/** WIB, matching every other time in the app. */
const waktu = (at: Date) =>
  at.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

/**
 * One day of the employee's own attendance, with the trail behind it.
 *
 * A page rather than a modal: on the mobile-web surface a full-screen modal *is*
 * a page, only without a URL or a working back button. Distances are measured
 * against the office the day was punched at — never whichever is nearest now,
 * which would silently relabel history the moment HR opens a site next door.
 */
export default async function DetailKehadiranPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { date } = await params;
  if (!isIsoDate(date)) notFound();

  // hari tanpa baris absensi tetap bisa dibuka: itu justru hari yang perlu dijelaskan
  const day = await hariKaryawan(Number(session.user.id), date);
  if (!day) notFound();

  const events = !day.id
    ? []
    : await db
        .select({
          id: attendanceEvents.id,
          kind: attendanceEvents.kind,
          at: attendanceEvents.at,
          location: attendanceEvents.location,
          lat: attendanceEvents.lat,
          lng: attendanceEvents.lng,
          photoUrl: attendanceEvents.photoUrl,
          note: attendanceEvents.note,
        })
        .from(attendanceEvents)
        .where(eq(attendanceEvents.attendanceId, day.id))
        .orderBy(asc(attendanceEvents.at));

  const minutes =
    day.clockIn && day.clockOut
      ? overtimeMinutes(day.clockIn, day.clockOut)
      : null;

  const kantor = day.officeLat
    ? {
        lat: Number(day.officeLat),
        lng: Number(day.officeLng),
        radius: day.officeRadius!,
      }
    : null;
  const titik = jejakAbsen(events, kantor);

  const jarakDari = (lat: string | null, lng: string | null) =>
    day.officeLat && lat && lng
      ? jarakMeter(
          Number(day.officeLat),
          Number(day.officeLng),
          Number(lat),
          Number(lng),
        )
      : null;

  return (
    <>
      <PageHead
        title={tanggalPanjang(day.date)}
        desc="Detail kehadiran Anda hari ini."
      >
        <Link
          href="/saya/kehadiran"
          className="bg-card border-border-strong hover:bg-accent flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-medium transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali
        </Link>
      </PageHead>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 basis-[380px] flex-col gap-4">
          {/* Kalau hari ini tercatat tanpa keterangan padahal Anda sudah mengajukan
              izin, alasan penolakannya ada di sini — bukan hanya di riwayat pengajuan. */}
          {day.ditolak && (
            <Panel title="Pengajuan Anda ditolak">
              <div className="px-4 py-3">
                <p className="text-[13px] font-medium">
                  {day.ditolak.type} · {day.ditolak.startDate} s/d{" "}
                  {day.ditolak.endDate}
                </p>
                {day.ditolak.note && (
                  <p className="text-muted-foreground mt-1 text-[12px]">
                    {day.ditolak.note}
                  </p>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Ringkasan">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <AttBadge status={day.status as AttStatus} />
              <span className="text-subtle text-[12px]">
                Titik absen: {day.officeName ?? "tanpa titik kantor (WFH)"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 p-4">
              {[
                { label: "Masuk", value: jam(day.clockIn) },
                { label: "Keluar", value: jam(day.clockOut) },
                {
                  label: "Total kerja",
                  value: minutes !== null ? durasi(minutes) : "—",
                  sub:
                    day.clockIn && !day.clockOut ? "sedang bekerja" : undefined,
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
                  {s.sub && (
                    <div className="text-subtle text-[11px]">{s.sub}</div>
                  )}
                </div>
              ))}
            </div>
            {(day.location || day.note) && (
              <p className="text-muted-foreground border-t px-4 py-3 text-[12.5px]">
                {day.note ?? day.location}
              </p>
            )}
          </Panel>

          {titik.length > 0 && (
            <PetaPanel
              height={240}
              trail
              points={
                kantor
                  ? [
                      {
                        lat: kantor.lat,
                        lng: kantor.lng,
                        tone: "kantor" as const,
                        label: `${day.officeName} · radius ${kantor.radius} m`,
                      },
                      ...titik,
                    ]
                  : titik
              }
              circles={
                kantor
                  ? [
                      {
                        lat: kantor.lat,
                        lng: kantor.lng,
                        radiusM: kantor.radius,
                      },
                    ]
                  : []
              }
              note={
                kantor
                  ? "Lingkaran adalah radius kantor. Titik oranye adalah ping yang tercatat di luar radius."
                  : "Hari WFH — tidak ada radius kantor untuk dibandingkan."
              }
            />
          )}

          <Panel title="Jejak lokasi">
            {events.length === 0 ? (
              <Empty>Tidak ada catatan kejadian di hari ini.</Empty>
            ) : (
              <ol className="relative py-4 pr-4 pl-[46px]">
                <span
                  aria-hidden
                  className="bg-border absolute top-6 bottom-6 left-[24px] w-[2px]"
                />
                {events.map((e) => {
                  const jarak = jarakDari(e.lat, e.lng);
                  return (
                    <li key={e.id} className="relative mb-5 last:mb-0">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1 left-[-29px] size-[9px] rounded-full ring-4 ring-[var(--card)]",
                          KIND_DOT[e.kind],
                        )}
                      />
                      <div className="text-[13px] font-medium">
                        {KIND_LABEL[e.kind]}
                        {e.location && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {e.location}
                          </span>
                        )}
                      </div>
                      <div className="text-subtle tnum mt-0.5 text-[11.5px]">
                        {waktu(e.at)}
                        {jarak !== null &&
                          ` · ${formatJarak(jarak)} dari ${day.officeName}`}
                      </div>
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
                      {e.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${e.photoUrl}`}
                          alt={KIND_LABEL[e.kind]}
                          className="mt-2 w-[92px] rounded-[9px] border object-cover"
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        {day.selfieKey && (
          <Panel title="Foto absen" className="w-full shrink-0 lg:w-[300px]">
            <div className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${day.selfieKey}`}
                alt="Foto absen masuk"
                className="aspect-3/4 w-full rounded-[11px] border object-cover"
              />
              <a
                href={`/api/files/${day.selfieKey}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Buka ukuran penuh
              </a>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
