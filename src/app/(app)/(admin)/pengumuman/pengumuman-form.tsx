"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { toWebp } from "@/lib/image";
import { FileDrop } from "@/components/file-drop";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Batas pilihan di sisi klien, BUKAN batas simpannya. Bannernya dikecilkan dulu
 *  di browser menjadi 16:9 1280px, jadi yang mendarat di server hampir selalu
 *  ratusan KB; menolak foto kamera 12 MP sebelum sempat dikecilkan justru
 *  menghapus gunanya kompresi ini. Server tetap otoritas terakhirnya (MAX_IMAGE
 *  di lib/r2.ts, yang tidak diimpor ke sini karena r2.ts modul server). */
const MAKS_PILIH = 20 * 1024 * 1024;

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

const KATEGORI = [
  { value: "Kebijakan", label: "Kebijakan" },
  { value: "Libur", label: "Libur" },
  { value: "Administrasi", label: "Administrasi" },
  { value: "Pelatihan", label: "Pelatihan" },
];

/**
 * Buat pengumuman. Hanya dipasang di halaman /pengumuman, yang seluruh grup
 * rutenya sudah dijaga (app)/(admin)/layout.tsx — dan rutenya sendiri memanggil
 * requireAdmin(), jadi menyembunyikan tombol ini bukan yang menegakkan haknya.
 */
export function PengumumanForm() {
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<File | null>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      // 16:9 1280 — dipotong memang disengaja di sini: bannernya ditampilkan
      // dalam bingkai 16:9 di sheet aplikasi, jadi rasio itu sudah pasti
      if (banner) {
        form.append(
          "banner",
          await toWebp(banner, { ratio: 16 / 9, width: 1280, quality: 0.75 }),
        );
      }
      const res = await fetch("/api/announcements", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Pengumuman gagal disimpan");
      return data;
    },
    onSuccess: () => {
      setOpen(false);
      setBanner(null);
      toast.success("Pengumuman diterbitkan");
      /**
       * Dua-duanya, dan keduanya perlu. `router.refresh()` menyegarkan komponen
       * servernya, tapi umpannya dipegang react-query: begitu query-nya ter-mount,
       * cache-nya menang atas `initialData` dari server, jadi tanpa invalidasi
       * pengumuman baru tidak akan muncul sampai halamannya dimuat ulang penuh.
       */
      void qc.invalidateQueries({ queryKey: ["feed", "pengumuman"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // input-nya ikut lepas saat dialognya tertutup, tapi state ini tidak —
        // tanpa baris ini banner yang batal dipakai ikut terbawa ke pembukaan berikutnya
        if (!v) {
          setBanner(null);
          save.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-3.5" aria-hidden />
          Buat pengumuman
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Buat pengumuman</DialogTitle>
          <DialogDescription>
            Tayang untuk karyawan di aplikasi begitu disimpan.
          </DialogDescription>
        </DialogHeader>

        <form
          id="pengumuman-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            // file-nya dipegang state, bukan input di dalam form: FileDrop yang
            // memilihnya, dan input aslinya sr-only di dalam <label> miliknya
            save.mutate(f);
          }}
        >
          <label className="text-[12.5px] font-medium">
            Judul
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              className={FIELD}
              placeholder="Mis. Penyesuaian jam kerja bulan September"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] font-medium">
              Kategori
              <SelectField
                name="category"
                defaultValue="Kebijakan"
                options={KATEGORI}
                ariaLabel="Kategori pengumuman"
                className="mt-1"
              />
            </label>
            <label className="text-[12.5px] font-medium">
              Ditujukan untuk
              <input
                name="audience"
                defaultValue="Semua karyawan"
                maxLength={80}
                className={FIELD}
              />
            </label>
          </div>

          <label className="text-[12.5px] font-medium">
            Isi
            <textarea
              name="body"
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              className="bg-card border-border-strong mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[13px]"
              placeholder="Tuliskan pengumuman selengkap mungkin…"
            />
          </label>

          <div className="text-[12.5px] font-medium">
            Banner (opsional)
            <FileDrop
              accept=".jpg,.jpeg,.png,.webp"
              maxBytes={MAKS_PILIH}
              value={banner}
              disabled={save.isPending}
              hint="JPG, PNG, atau WEBP · dipotong 16:9 dan dikecilkan otomatis"
              onFile={setBanner}
              className="mt-1"
            />
          </div>

          <label className="flex items-center gap-2 text-[12.5px] font-medium">
            <input type="checkbox" name="pinned" className="size-4" />
            Sematkan di urutan teratas
          </label>
        </form>

        <DialogFooter>
          <Button type="submit" form="pengumuman-form" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Terbitkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
