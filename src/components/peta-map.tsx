"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Lingkaran, PetaProps, Titik, Tone } from "./peta";

/** OpenFreeMap's hosted Bright. No API key exists to leak. */
const STYLE = "https://tiles.openfreemap.org/styles/bright";

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const TONE: Record<Tone, string> = {
  kantor: "#4f46e5",
  masuk: "#0f7b5a",
  keluar: "#2563eb",
  ping: "#8b93a1",
  peringatan: "#b4530b",
  saya: "#d4342c",
};

/**
 * A geofence as a polygon, not a `circle` layer.
 *
 * MapLibre's circle radius is in screen pixels, so a 150 m fence would grow and
 * shrink as you zoom — exactly the wrong thing for the one shape whose size is
 * the point. 64 segments at office scale is smooth enough that the flat-earth
 * approximation never shows.
 */
function circleFeature({ lat, lng, radiusM, tone = "kantor" }: Lingkaran) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return {
    type: "Feature" as const,
    properties: { color: TONE[tone] },
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

/**
 * MapLibre throws on a latitude outside ±90 (`new LngLat`), and a half-typed
 * coordinate in a form is an ordinary state, not an exception — one bad keystroke
 * used to take the whole page down with the error boundary. Dropped here rather
 * than at each call site so every map gets it.
 */
const waras = (t: { lat: number; lng: number }) =>
  Number.isFinite(t.lat) && Number.isFinite(t.lng) && Math.abs(t.lat) <= 90;

function markerEl(t: Titik) {
  const el = document.createElement("div");
  el.className = "size-3.5 rounded-full border-2 border-white shadow";
  el.style.backgroundColor = TONE[t.tone ?? "kantor"];
  return el;
}

export function PetaMap({
  points: semuaTitik,
  circles: semuaLingkaran = [],
  trail = false,
  height,
  onPick,
  className,
}: PetaProps) {
  const points = semuaTitik.filter(waras);
  const circles = semuaLingkaran.filter(waras);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const pick = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [gagal, setGagal] = useState<string | null>(null);

  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const m = new MapLibreMap({
      container: box.current!,
      style: STYLE,
      center: [106.827, -6.175],
      zoom: 11,
      attributionControl: { compact: true },
    });
    // the map lives inside scrolling pages and dialogs; hijacking the wheel is
    // the fastest way to make one unusable. Zoom stays on the buttons.
    m.scrollZoom.disable();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e: MapMouseEvent) =>
      pick.current?.(e.lngLat.lat, e.lngLat.lng),
    );
    // Without this, every failure — tiles unreachable, style rejected, WebGL
    // refused — looks identical: an empty grey box with working zoom buttons and
    // nothing but a console line to say why.
    m.on("error", (e) => setGagal(e.error?.message ?? "Peta gagal dimuat"));
    m.on("load", () => {
      m.addSource("fence", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "fence-fill",
        type: "fill",
        source: "fence",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 },
      });
      m.addLayer({
        id: "fence-line",
        type: "line",
        source: "fence",
        paint: { "line-color": ["get", "color"], "line-width": 1.5 },
      });
      m.addSource("trail", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": TONE.kantor,
          "line-width": 2,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.7,
        },
      });
      // dialogs animate in, so the container can still be mid-transition here
      m.resize();
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Serialised so the map only re-fits when the data really changed — refitting
  // on every parent render would yank the viewport out from under the user.
  const pKey = JSON.stringify(points);
  const cKey = JSON.stringify(circles);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    markers.current.forEach((mk) => mk.remove());
    markers.current = points.map((t) => {
      const mk = new Marker({ element: markerEl(t) }).setLngLat([t.lng, t.lat]);
      if (t.label)
        mk.setPopup(
          new Popup({ offset: 14, closeButton: false }).setText(t.label),
        );
      return mk.addTo(m);
    });

    (m.getSource("fence") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: circles.map(circleFeature),
    });
    // the office itself is a fixed landmark, not a step in the day — a line
    // through it would claim the person walked to the pin
    const jejak = points.filter((t) => t.tone !== "kantor");
    (m.getSource("trail") as GeoJSONSource).setData(
      trail && jejak.length > 1
        ? {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: jejak.map((t) => [t.lng, t.lat]),
            },
          }
        : EMPTY,
    );

    // Fit everything that has to be visible: the markers, and the *edges* of
    // each fence — framing a geofence by its centre hides half of it.
    const b = new LngLatBounds();
    points.forEach((t) => b.extend([t.lng, t.lat]));
    circles.forEach((c) => {
      const dLat = c.radiusM / 111_320;
      const dLng = c.radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
      b.extend([c.lng - dLng, c.lat - dLat]);
      b.extend([c.lng + dLng, c.lat + dLat]);
    });
    if (!b.isEmpty()) m.fitBounds(b, { padding: 40, maxZoom: 17, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pKey/cKey stand in for the arrays
  }, [ready, pKey, cKey, trail]);

  return (
    <div className="relative" style={{ height: height ?? "100%" }}>
      <div
        ref={box}
        className={className}
        style={{
          height: "100%",
          width: "100%",
          cursor: onPick ? "crosshair" : undefined,
        }}
      />
      {gagal && (
        <p className="bg-danger-subtle text-danger absolute inset-x-0 bottom-0 px-3 py-2 text-[11.5px]">
          {gagal}
        </p>
      )}
    </div>
  );
}
