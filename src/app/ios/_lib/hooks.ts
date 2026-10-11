"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Bootstrap } from "./api";

/** Bootstrap /api/me, dibagi semua layar lewat cache React Query. */
export const useMe = () =>
  useQuery({ queryKey: ["ios", "me"], queryFn: () => api<Bootstrap>("/api/me") });

/** Sedang dalam jam kerja (sudah masuk, belum keluar) — satu-satunya keadaan
 *  di mana ping lokasi diterima server. */
export const sedangBekerja = (me?: Bootstrap) =>
  !!me?.today.clockIn && !me.today.clockOut;

const jamFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

/**
 * Jam WIB yang berdetak tiap detik ("18:53:27"). Lewat useSyncExternalStore,
 * jadi tidak ada setState di dalam efek, dan server merender placeholder yang
 * lebarnya sama supaya tidak ada hydration mismatch.
 */
export function useJamBerjalan() {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, 1000);
      return () => window.clearInterval(id);
    },
    () => jamFmt.format(new Date()).replace(/\./g, ":"),
    () => "--:--:--",
  );
}

/** Menit sejak sebuah ISO timestamp, diperbarui tiap menit. */
export function useMenitSejak(iso: string | null) {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, 30_000);
      return () => window.clearInterval(id);
    },
    () => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)) : 0),
    () => 0,
  );
}
