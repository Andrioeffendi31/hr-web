"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { toWebp } from "@/lib/image";
import { Avatar } from "@/components/bits";
import { FileDrop } from "@/components/file-drop";

/** Batas pilihan di sisi klien, BUKAN batas simpannya. Gambarnya dikecilkan
 *  dulu di browser, jadi yang mendarat di server hampir selalu ratusan KB;
 *  menolak foto kamera 12 MP sebelum sempat dikecilkan justru menghapus
 *  gunanya kompresi ini. Server tetap otoritas terakhirnya (MAX_IMAGE). */
const MAKS_PILIH = 20 * 1024 * 1024;

/**
 * The employee's own profile photo.
 *
 * Same control HR gets in the employee form, pointed at /api/me/photo instead of
 * /api/files — that endpoint takes the id from the session, so this page has no
 * way to aim an upload at somebody else even if the markup were tampered with.
 */
export function PhotoForm({
  name,
  photoKey,
}: {
  name: string;
  photoKey: string | null;
}) {
  const router = useRouter();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      // 1:1 512px — angka yang sama dipakai aplikasi ponsel untuk foto profil,
      // supaya foto dari browser dan dari aplikasi mendarat setara di R2
      fd.append("photo", await toWebp(file, { ratio: 1, width: 512, quality: 0.7 }));
      return fetch("/api/me/photo", { method: "POST", body: fd }).then(
        async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
          return data;
        },
      );
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
          maxBytes={MAKS_PILIH}
          disabled={upload.isPending}
          hint="JPG, PNG, atau WEBP · dikecilkan otomatis sebelum diunggah"
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
