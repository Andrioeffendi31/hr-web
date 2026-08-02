"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";

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
    return (
      <a
        href={`/api/files/${selfieKey}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Lihat selfie absen ${name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/files/${selfieKey}`}
          alt={`Selfie absen ${name}`}
          className="bg-muted size-8 rounded-md border object-cover"
        />
      </a>
    );
  }

  // no attendance row means there is nothing to attach the photo to
  if (!hasAttendance) return <span className="text-subtle text-[12.5px]">—</span>;

  return (
    <label
      title={`Unggah selfie absen ${name}`}
      className="text-subtle hover:text-primary hover:bg-accent flex size-8 cursor-pointer items-center justify-center rounded-md border transition-colors"
    >
      <Camera className="size-3.5" aria-hidden />
      <span className="sr-only">Unggah selfie absen {name}</span>
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        disabled={up.isPending}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) up.mutate(file);
          e.currentTarget.value = "";
        }}
        className="hidden"
      />
    </label>
  );
}
