"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { shrinkImage } from "@/lib/image";

/** Batas pilihan di sisi klien, BUKAN batas simpannya. Bannernya dikecilkan dulu
 *  di browser, jadi yang mendarat di server hampir selalu ratusan KB; menolak foto
 *  kamera 12 MP sebelum sempat dikecilkan justru menghapus gunanya kompresi itu.
 *  Server tetap otoritas terakhirnya (MAX_IMAGE di lib/r2.ts, yang tidak diimpor
 *  ke sini karena r2.ts modul server). */
const MAKS_PILIH = 20 * 1024 * 1024;

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

const KATEGORI = [
  { value: "Kebijakan", label: "Kebijakan" },
  { value: "Libur", label: "Libur" },
  { value: "Administrasi", label: "Administrasi" },
  { value: "Pelatihan", label: "Pelatihan" },
];

export type PengumumanAwal = {
  id: number;
  title: string;
  body: string;
  category: string;
  audience: string;
  pinned: boolean;
  bannerKey: string | null;
};

/**
 * Buat pengumuman, dan ubah pengumuman.
 *
 * Satu komponen, dibedakan `initial`: keduanya hanya berbeda pada apa yang
 * dipakai sebagai isi awal, jadi memisahnya menjadi dua berkas hanya akan membuat
 * keduanya berbeda pelan-pelan — pola yang sama dipakai divisi-form.tsx.
 *
 * Haknya bukan tombol yang disembunyikan: seluruh grup rutenya dijaga
 * (app)/(admin)/layout.tsx, dan rutenya sendiri memanggil requireAdmin().
 */
export function PengumumanForm({ initial }: { initial?: PengumumanAwal }) {
  const ubah = Boolean(initial);
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<File | null>(null);
  // banner lama dibuang tanpa diganti — keadaan tersendiri, karena "tidak memilih
  // berkas baru" dan "minta hapus yang ada" adalah dua maksud yang berbeda
  const [buangBanner, setBuangBanner] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();

  const segarkan = () => {
    /**
     * Dua-duanya, dan keduanya perlu. `router.refresh()` menyegarkan komponen
     * servernya, tapi umpannya dipegang react-query: begitu query-nya ter-mount,
     * cache-nya menang atas `initialData` dari server, jadi tanpa invalidasi
     * perubahannya tidak muncul sampai halamannya dimuat ulang penuh.
     */
    void qc.invalidateQueries({ queryKey: ["feed", "pengumuman"] });
    router.refresh();
  };

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      if (banner) {
        /**
         * shrinkImage, bukan toWebp: bannernya ditampilkan utuh sesuai rasio
         * aslinya, jadi memotongnya di sini berarti membuang bagian gambar yang
         * tidak akan pernah bisa dikembalikan.
         */
        form.append("banner", await shrinkImage(banner, { maxWidth: 1600 }));
      }
      if (ubah) {
        form.append("id", String(initial!.id));
        if (buangBanner && !banner) form.append("removeBanner", "1");
      }
      const res = await fetch("/api/announcements", {
        method: ubah ? "PATCH" : "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Pengumuman gagal disimpan");
      return data;
    },
    onSuccess: () => {
      setOpen(false);
      setBanner(null);
      setBuangBanner(false);
      toast.success(ubah ? "Pengumuman diperbarui" : "Pengumuman diterbitkan");
      segarkan();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formId = `pengumuman-form-${initial?.id ?? "baru"}`;
  const bannerLama = initial?.bannerKey && !buangBanner && !banner;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // inputnya ikut lepas saat dialognya tertutup, tapi state ini tidak —
        // tanpa baris ini pilihan yang dibatalkan terbawa ke pembukaan berikutnya
        if (!v) {
          setBanner(null);
          setBuangBanner(false);
          save.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {ubah ? (
          <button
            type="button"
            className="text-subtle hover:text-foreground hover:bg-muted rounded-[8px] p-1.5"
            aria-label={`Ubah pengumuman ${initial!.title}`}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : (
          <Button>
            <Plus className="size-3.5" aria-hidden />
            Buat pengumuman
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {ubah ? "Ubah pengumuman" : "Buat pengumuman"}
          </DialogTitle>
          <DialogDescription>
            {ubah
              ? "Perubahan langsung terlihat karyawan di aplikasi."
              : "Tayang untuk karyawan di aplikasi begitu disimpan."}
          </DialogDescription>
        </DialogHeader>

        <form
          id={formId}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(new FormData(e.currentTarget));
          }}
        >
          <label className="text-[12.5px] font-medium">
            Judul
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              defaultValue={initial?.title}
              className={FIELD}
              placeholder="Mis. Penyesuaian jam kerja bulan September"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] font-medium">
              Kategori
              <SelectField
                name="category"
                defaultValue={initial?.category ?? "Kebijakan"}
                options={KATEGORI}
                ariaLabel="Kategori pengumuman"
                className="mt-1"
              />
            </label>
            <label className="text-[12.5px] font-medium">
              Ditujukan untuk
              <input
                name="audience"
                defaultValue={initial?.audience ?? "Semua karyawan"}
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
              defaultValue={initial?.body}
              className="bg-card border-border-strong mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[13px]"
              placeholder="Tuliskan pengumuman selengkap mungkin…"
            />
          </label>

          <div className="text-[12.5px] font-medium">
            Banner (opsional)
            {bannerLama && (
              <div className="mt-1 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${initial!.bannerKey}`}
                  alt=""
                  className="h-12 w-20 rounded-[7px] border object-cover"
                />
                <button
                  type="button"
                  className="text-danger text-[12px] font-medium"
                  onClick={() => setBuangBanner(true)}
                >
                  Hapus banner
                </button>
              </div>
            )}
            <FileDrop
              accept=".jpg,.jpeg,.png,.webp"
              maxBytes={MAKS_PILIH}
              value={banner}
              disabled={save.isPending}
              hint={
                bannerLama
                  ? "Pilih berkas untuk mengganti · JPG, PNG, atau WEBP"
                  : "JPG, PNG, atau WEBP · dikecilkan otomatis, tidak dipotong"
              }
              onFile={(f) => {
                setBanner(f);
                if (f) setBuangBanner(false);
              }}
              className="mt-1"
            />
          </div>

          <label className="flex items-center gap-2 text-[12.5px] font-medium">
            <input
              type="checkbox"
              name="pinned"
              defaultChecked={initial?.pinned}
              className="size-4"
            />
            Sematkan di urutan teratas
          </label>
        </form>

        <DialogFooter>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : ubah ? "Simpan" : "Terbitkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
