"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Bootstrap } from "./api";

/** Bootstrap /api/me, dibagi semua layar lewat cache React Query. */
export const useMe = () =>
  useQuery({ queryKey: ["ios", "me"], queryFn: () => api<Bootstrap>("/api/me") });

/** Sedang dalam jam kerja (sudah masuk, belum keluar) — satu-satunya keadaan
 *  di mana ping lokasi diterima server. */
export const sedangBekerja = (me?: Bootstrap) =>
  !!me?.today.clockIn && !me.today.clockOut;
