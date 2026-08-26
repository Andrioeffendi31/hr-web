"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { toWebp } from "@/lib/image";
import { DETAIL_KEY } from "./detail-modal";
import { FileDrop } from "@/components/file-drop";
import { FilePreview } from "@/components/file-preview";
import { ekstensi } from "@/lib/hr";

/** Batas pilihan di sisi klien, BUKAN batas simpannya. Gambarnya dikecilkan
 *  dulu di browser, jadi yang mendarat di server hampir selalu ratusan KB;
 *  menolak foto kamera 12 MP sebelum sempat dikecilkan justru menghapus
 *  gunanya kompresi ini. Server tetap otoritas terakhirnya (MAX_IMAGE). */
const MAKS_PILIH = 20 * 1024 * 1024;

/**
 * Selfie for one attendance row: thumbnail when it exists, upload when it does
 * not. HR attaches it here because self-service clock-in with a camera is
 * PRD-Mobile scope — this side only owns the storage.
 */
export function SelfieCell({
  employeeId,
  name,
  date,
  selfieKey,
  hasAttendance,
}: {
  employeeId: number;
  name: string;
  date: string;
  selfieKey: string | null;
  hasAttendance: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const up = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("kind", "selfie");
      fd.append("employeeId", String(employeeId));
      fd.append("date", date);
      // 3:4 720px — angka yang sama dipakai absen.tsx di aplikasi ponsel, supaya
      // selfie yang diperbaiki admin sebanding dengan yang dikirim karyawannya
      fd.append("file", await toWebp(file, { ratio: 3 / 4, width: 720 }));
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah selfie");
      return data;
    },
    onSuccess: () => {
      toast.success(`Selfie ${name} tersimpan`);
      router.refresh();
      // dipakai di papan DAN di dalam dialog detail, yang datanya milik klien
      qc.invalidateQueries({ queryKey: [DETAIL_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (selfieKey) {
    const src = `/api/files/${selfieKey}`;
    return (
      <FilePreview
        name={`Selfie absen ${name} · ${date}`}
        src={src}
        // selfie keys carry no extension (they are overwritten on re-upload), and
        // only images ever land there
        ext={ekstensi(selfieKey) || "jpg"}
        trigger={
          <button
            type="button"
            aria-label={`Lihat selfie absen ${name}`}
            className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Selfie absen ${name}`}
              className="bg-muted size-8 rounded-md border object-cover"
            />
          </button>
        }
      />
    );
  }

  // no attendance row means there is nothing to attach the photo to
  if (!hasAttendance)
    return <span className="text-subtle text-[12.5px]">—</span>;

  // children mode: a 32 px cell cannot hold a dropzone, so FileDrop only lends
  // the drag & drop behaviour to the button that is already here
  return (
    <FileDrop
      accept=".jpg,.jpeg,.png,.webp"
      maxBytes={MAKS_PILIH}
      disabled={up.isPending}
      onFile={(f) => f && up.mutate(f)}
    >
      <span
        title={`Unggah selfie absen ${name} — bisa juga ditarik ke sini`}
        className="text-subtle hover:text-primary hover:bg-accent flex size-8 items-center justify-center rounded-md border transition-colors"
      >
        <Camera className="size-3.5" aria-hidden />
        <span className="sr-only">Unggah selfie absen {name}</span>
      </span>
    </FileDrop>
  );
}
