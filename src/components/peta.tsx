"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

/** What a dot on the map means. Colours come from the theme tokens, so a marker
 *  reads the same as the badge next to it. */
export type Tone =
  "kantor" | "masuk" | "keluar" | "ping" | "peringatan" | "saya";

export type Titik = { lat: number; lng: number; label?: string; tone?: Tone };
export type Lingkaran = {
  lat: number;
  lng: number;
  radiusM: number;
  tone?: Tone;
};

export type PetaProps = {
  points: Titik[];
  /** Geofences, drawn as translucent discs under the markers. */
  circles?: Lingkaran[];
  /** Join the points in order — the movement trail of a working day. */
  trail?: boolean;
  height?: number;
  /** Turns the map into a picker: every click reports a coordinate. */
  onPick?: (lat: number, lng: number) => void;
  className?: string;
};

/**
 * One map for the whole app, rendered from OpenFreeMap vector tiles.
 *
 * OpenFreeMap rather than Google/Mapbox because it needs no key, no billing
 * account and no per-view quota — the attribution control that MapLibre shows by
 * default is the entire obligation, so it is deliberately left on.
 *
 * Loaded client-side only: MapLibre reaches for `window` and WebGL at import
 * time, and there is nothing meaningful to prerender anyway.
 */
export const Peta = dynamic(() => import("./peta-map").then((m) => m.PetaMap), {
  ssr: false,
  loading: () => (
    <div className="bg-surface-2 h-full w-full animate-pulse rounded-[11px] border" />
  ),
});

/** Map plus a caption, the shape every call site actually wants. */
export function PetaPanel({
  title,
  note,
  className,
  ...props
}: PetaProps & { title?: string; note?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[11px] border", className)}>
      <div style={{ height: props.height ?? 220 }}>
        <Peta {...props} />
      </div>
      {(title || note) && (
        <div className="bg-surface-2 border-t px-3 py-2">
          {title && <div className="text-[12px] font-medium">{title}</div>}
          {note && <div className="text-subtle text-[11px]">{note}</div>}
        </div>
      )}
    </div>
  );
}
