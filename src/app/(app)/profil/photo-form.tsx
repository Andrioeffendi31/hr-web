"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar } from "@/components/bits";
import { FileDrop } from "@/components/file-drop";

/**
 * The employee's own profile photo.
 *
 * Same control HR gets in the employee form, pointed at /api/me/photo instead of
 * /api/files — that endpoint takes the id from the session, so this page has no
 * way to aim an upload at somebody else even if the markup were tampered with.
 */
export function PhotoForm({ name, photoKey }: { name: string; photoKey: string | null }) {
  const router = useRouter();

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      return fetch("/api/me/photo", { method: "POST", body: fd }).then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
        return data;
      });
    },
    onSuccess: () => {
      toast.success("Foto profil diperbarui");
      // the key changes on every upload, so the refreshed markup points at a new
      // URL and no cache can keep showing the face that was just replaced
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-start gap-4 px-4 py-4">
      <Avatar name={name} photoKey={photoKey} className="size-16 text-[19px]" />
      <div className="min-w-0 flex-1">
        <FileDrop
          accept=".jpg,.jpeg,.png,.webp"
          maxBytes={4 * 1024 * 1024}
          disabled={upload.isPending}
          hint="JPG, PNG, atau WEBP · maksimal 4 MB"
          onFile={(f) => f && upload.mutate(f)}
        />
        <span className="text-subtle mt-1.5 block text-[11px]">
          Foto tampil di daftar karyawan, rekap kehadiran, dan aplikasi ponsel.
          Tersimpan langsung setelah dipilih.
        </span>
      </div>
    </div>
  );
}
