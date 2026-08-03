"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { FileDrop } from "@/components/file-drop";
import { FilePreview } from "@/components/file-preview";
import { ekstensi } from "@/lib/hr";

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
  const up = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("kind", "selfie");
      fd.append("employeeId", String(employeeId));
      fd.append("date", date);
      fd.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah selfie");
      return data;
    },
    onSuccess: () => {
      toast.success(`Selfie ${name} tersimpan`);
      router.refresh();
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
  if (!hasAttendance) return <span className="text-subtle text-[12.5px]">—</span>;

  // children mode: a 32 px cell cannot hold a dropzone, so FileDrop only lends
  // the drag & drop behaviour to the button that is already here
  return (
    <FileDrop
      accept=".jpg,.jpeg,.png,.webp"
      maxBytes={1.5 * 1024 * 1024}
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
