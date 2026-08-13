"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Check, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDrop } from "@/components/file-drop";
import { Peta } from "@/components/peta";
import { SelectField } from "@/components/select-field";
import { formatJarak, jarakMeter } from "@/lib/hr";
import { toWebp } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { Bootstrap } from "./beranda";

/** 3:4 portrait at 720px — the same numbers mobile/src/image.ts uses, so a punch
 *  from a browser and one from the app are the same object in R2. */
const SELFIE_RATIO = 3 / 4;
const SELFIE_WIDTH = 720;
/** The gate on the *raw* pick, before decoding. MAX_IMAGE (4 MB) is re-checked
 *  after compression; this only rejects something absurd early. */
const MAX_PICK = 12 * 1024 * 1024;

type Fix = { lat: number; lng: number };

/**
 * Clock in / clock out from the browser.
 *
 * A Dialog rather than its own route, deliberately. Mobile made this a screen and
 * then had to add a focus-effect cleanup, because a tab screen never unmounts and
 * an abandoned punch — stale selfie, flipped WFH switch — was waiting on the next
 * visit. A Dialog throws its content away on close, so that entire class of bug
 * costs nothing here.
 *
 * The rules are the server's: /api/me/clock validates the selfie before writing
 * anything, enforces the geofence against the chosen office, and locks clock-out
 * to whatever clock-in picked. Everything below is only about not offering to
 * send something that will be refused.
 */
export function ClockDialog({
  data,
  onClose,
}: {
  data: Bootstrap;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  const [fix, setFix] = useState<Fix | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [wfh, setWfh] = useState(false);
  const [officeId, setOfficeId] = useState<number | null>(null);

  const clockedIn = Boolean(data.today.clockIn && !data.today.clockOut);
  const action = clockedIn ? "out" : "in";

  // geolocation and camera capture are secure-context only. Checked up front and
  // surfaced as UI copy rather than a console warning, because the usual way to
  // hit it — opening the dev server from a phone on a LAN IP — otherwise looks
  // like the location read simply hanging forever.
  const secure = typeof window !== "undefined" && window.isSecureContext;

  /**
   * Ask the device where it is. Both callbacks are asynchronous, so nothing here
   * sets state during the effect body — the insecure-context case is derived
   * below rather than stored, which is why this can stay a plain read.
   */
  const readLocation = useCallback(() => {
    if (!secure) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocError(null);
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) =>
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini, lalu coba lagi."
            : "Lokasi tidak terbaca. Pastikan GPS aktif lalu coba lagi.",
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, [secure]);

  useEffect(readLocation, [readLocation]);

  // derived, not state: an insecure page can never produce a fix, so this is a
  // fact about the page rather than something that happens to it
  const problem = secure
    ? locError
    : "Absen butuh koneksi aman (HTTPS). Buka Ruang HR lewat alamat resminya.";

  /**
   * Which office this punch is measured against, in two-step preselection —
   * derived rather than stored.
   *
   * `officeId` holds *only* a deliberate pick, so precedence falls out of one
   * expression: a manual choice wins; otherwise the nearest office once GPS has
   * answered; otherwise the company default, so the field never reads "Pilih
   * kantor" when there is an obvious answer. The mobile version keeps this in an
   * effect plus a `picked` ref to express the same three rules — this is the same
   * behaviour with neither.
   *
   * On the way out there is nothing to choose at all: the server reads the office
   * off the row and ignores anything sent, so offering a list would only invite
   * somebody to pick one and watch it be ignored.
   */
  const nearest =
    fix && data.offices.length > 0
      ? data.offices.reduce((a, b) =>
          jarakMeter(fix.lat, fix.lng, a.lat, a.lng) <=
          jarakMeter(fix.lat, fix.lng, b.lat, b.lng)
            ? a
            : b,
        )
      : null;
  const activeId = officeId ?? nearest?.id ?? data.defaultOfficeId;

  const chosen =
    action === "out"
      ? data.offices.find((o) => o.id === data.today.officeId)
      : data.offices.find((o) => o.id === activeId);

  const meter =
    fix && chosen ? jarakMeter(fix.lat, fix.lng, chosen.lat, chosen.lng) : null;
  // a day clocked in as WFH has no office to measure against, and the server
  // checks nothing on the way out — so neither does this
  const noGeofence = action === "out" && data.today.officeId === null;
  const inside = noGeofence || (meter !== null && meter <= chosen!.radiusM);

  const takeSelfie = async (file: File | null) => {
    if (!file) return setSelfie(null);
    setPreparing(true);
    try {
      setSelfie(
        await toWebp(file, { ratio: SELFIE_RATIO, width: SELFIE_WIDTH }),
      );
    } catch {
      toast.error("Foto gagal diproses. Coba ambil ulang.");
    } finally {
      setPreparing(false);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!fix || !selfie) throw new Error("Lokasi atau foto belum siap");
      const fd = new FormData();
      fd.append("action", action);
      fd.append("lat", String(fix.lat));
      fd.append("lng", String(fix.lng));
      if (wfh) fd.append("wfh", "1");
      // only on the way in — the server reads clock-out's office off the row
      else if (action === "in" && chosen)
        fd.append("locationId", String(chosen.id));
      // no `location` part: the browser has no reverse-geocoder, and the server
      // already falls back to the office name
      fd.append("selfie", selfie);

      const res = await fetch("/api/me/clock", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        at?: string;
        location?: string;
      };
      // the server's messages ARE the rules — duplicate punch, outside the
      // radius, office deactivated — so they are surfaced verbatim
      if (!res.ok) throw new Error(json.error ?? "Absen gagal");
      return json;
    },
    onSuccess: async (res) => {
      toast.success(
        action === "in"
          ? `Absen masuk tercatat ${res.at} · ${res.location}`
          : `Absen keluar tercatat ${res.at}`,
      );
      await qc.invalidateQueries({ queryKey: ["me"] });
      router.refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blocked =
    !secure ||
    !fix ||
    !selfie ||
    (!inside && !wfh) ||
    preparing ||
    submit.isPending;

  // one reason at a time, in the order they have to be resolved
  const hint = !secure
    ? "Absen butuh koneksi aman (HTTPS)"
    : preparing
      ? "Menyiapkan foto…"
      : !selfie
        ? "Foto selfie wajib untuk absen"
        : !fix
          ? (problem ?? "Menunggu verifikasi lokasi")
          : !inside && !wfh
            ? "Tandai WFH untuk melanjutkan dari luar radius"
            : "Lokasi dan foto siap dikirim";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {action === "in" ? "Absen masuk" : "Absen keluar"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Foto dan lokasi direkam sebagai bukti kehadiran.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* the selfie. `capture="user"` opens the front camera straight away on
              a phone; on a desktop it degrades to the ordinary file picker */}
          <FileDrop
            accept=".jpg,.jpeg,.png,.webp"
            maxBytes={MAX_PICK}
            capture="user"
            disabled={preparing || submit.isPending}
            hint="Foto wajib · JPG, PNG atau WEBP"
            onFile={takeSelfie}
          >
            <span className="flex flex-col items-center gap-1.5 py-2">
              <Camera className="text-muted-foreground size-5" aria-hidden />
              <span className="text-[12.5px] font-medium">
                {preparing
                  ? "Menyiapkan foto…"
                  : selfie
                    ? "Foto siap · ketuk untuk ambil ulang"
                    : "Ambil foto selfie"}
              </span>
            </span>
          </FileDrop>

          {/* location */}
          <div
            className={cn(
              "flex items-start gap-3 rounded-[11px] border p-3",
              problem
                ? "bg-danger-subtle border-danger/30"
                : !fix
                  ? "bg-surface-2"
                  : inside
                    ? "bg-success-subtle border-success/30"
                    : "bg-warning-subtle border-warning/30",
            )}
          >
            <MapPin
              className={cn(
                "mt-0.5 size-4 shrink-0",
                problem
                  ? "text-danger"
                  : !fix
                    ? "text-subtle"
                    : inside
                      ? "text-success"
                      : "text-warning",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1 text-[12.5px]">
              <div className="font-medium">
                {problem
                  ? "Lokasi gagal"
                  : !fix
                    ? "Membaca lokasi…"
                    : noGeofence
                      ? "Hari ini ditandai WFH"
                      : inside
                        ? "Lokasi cocok"
                        : "Di luar radius"}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[11.5px]">
                {problem ??
                  (chosen && meter !== null
                    ? `${formatJarak(meter)} dari ${chosen.name} · radius ${chosen.radiusM} m`
                    : noGeofence
                      ? "Absen masuk hari ini tanpa titik kantor"
                      : "Menunggu koordinat perangkat")}
              </div>
            </div>
            {problem && secure && (
              <button
                type="button"
                onClick={() => {
                  setLocError(null);
                  setFix(null);
                  readLocation();
                }}
                aria-label="Coba lagi baca lokasi"
                className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <RefreshCw className="size-4" aria-hidden />
              </button>
            )}
          </div>

          {/* the same two facts as the card above, but as a picture: where the
              fence is and which side of it you are standing on */}
          {fix && (
            <div className="h-[180px] overflow-hidden rounded-[11px] border">
              <Peta
                points={[
                  { ...fix, tone: "saya", label: "Posisi Anda sekarang" },
                  ...(chosen
                    ? [
                        {
                          lat: chosen.lat,
                          lng: chosen.lng,
                          tone: "kantor" as const,
                          label: `${chosen.name} · radius ${chosen.radiusM} m`,
                        },
                      ]
                    : []),
                ]}
                circles={
                  chosen && !noGeofence
                    ? [
                        {
                          lat: chosen.lat,
                          lng: chosen.lng,
                          radiusM: chosen.radiusM,
                        },
                      ]
                    : []
                }
              />
            </div>
          )}

          {/* office picker — read-only on the way out */}
          {action === "in" && data.offices.length > 1 && (
            <label className="text-[12px] font-medium">
              Titik absen
              <SelectField
                name="locationId"
                defaultValue={activeId ? String(activeId) : ""}
                ariaLabel="Titik absen"
                className="mt-1 h-10 w-full"
                onChange={(v) => setOfficeId(Number(v))}
                options={data.offices.map((o) => ({
                  value: String(o.id),
                  label: fix
                    ? `${o.name} · ${formatJarak(jarakMeter(fix.lat, fix.lng, o.lat, o.lng))} dari sini`
                    : `${o.name} · radius ${o.radiusM} m`,
                }))}
              />
            </label>
          )}

          {/* WFH escape hatch, only once we know we are outside every radius */}
          {fix && !inside && (
            <div className="border-warning/30 bg-warning-subtle rounded-[11px] border p-3">
              <p className="text-warning flex gap-2 text-[12.5px] leading-relaxed">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {chosen
                  ? `Anda ${formatJarak(meter!)} dari ${chosen.name}, di luar radius ${chosen.radiusM} m. Absen dari luar kantor harus ditandai WFH.`
                  : "Belum ada titik absen aktif. Absen harus ditandai WFH."}
              </p>
              <label className="mt-2.5 flex items-center gap-2 text-[12.5px] font-medium">
                <input
                  type="checkbox"
                  checked={wfh}
                  onChange={(e) => setWfh(e.currentTarget.checked)}
                  className="size-4"
                />
                Kerja dari rumah (WFH)
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            size="lg"
            disabled={blocked}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? (
              "Mengirim…"
            ) : (
              <>
                <Check aria-hidden />
                {action === "in"
                  ? "Konfirmasi absen masuk"
                  : "Konfirmasi absen keluar"}
              </>
            )}
          </Button>
          <p className="text-subtle w-full text-center text-[11px]">{hint}</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
