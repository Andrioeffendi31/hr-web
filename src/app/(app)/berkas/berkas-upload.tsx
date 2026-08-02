"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ComboboxField } from "@/components/combobox-field";
import { SelectField, type Option } from "@/components/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Permintaan gagal");
  return data;
}

const FOLDER_OPTIONS: Option[] = [
  { value: "personal", label: "Berkas Pribadi" },
  { value: "kontrak", label: "Kontrak Kerja" },
  { value: "sertif", label: "Sertifikat & Pelatihan" },
  { value: "legal", label: "Dokumen Perusahaan" },
];

/** Upload straight into a folder. Owner is optional: empty = dokumen perusahaan
 *  yang terlihat semua karyawan. */
export function UploadDocument({
  folder,
  employees,
}: {
  folder: string;
  employees: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (fd: FormData) => send("/api/files", { method: "POST", body: fd }),
    onSuccess: () => {
      setOpen(false);
      toast.success("Berkas diunggah");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Upload className="size-3.5" aria-hidden />
          Unggah berkas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!(fd.get("file") as File | null)?.size) {
              toast.error("Pilih file dulu");
              return;
            }
            if (!fd.get("ownerId")) fd.delete("ownerId");
            fd.set("kind", "doc");
            upload.mutate(fd);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">Unggah berkas</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              PDF, CSV, XLSX, DOCX, JPG, atau PNG · maksimal 4 MB.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <label className="text-[12px] font-medium">
              File
              <input
                ref={fileRef}
                name="file"
                type="file"
                required
                accept=".pdf,.csv,.xlsx,.docx,.jpg,.jpeg,.png"
                className="text-muted-foreground mt-1 block w-full text-[12px] file:mr-2 file:rounded-[7px] file:border file:px-2 file:py-1 file:text-[12px]"
              />
            </label>

            <div className="text-[12px] font-medium">
              <label htmlFor="doc-folder">Folder</label>
              <SelectField
                id="doc-folder"
                name="folder"
                defaultValue={folder}
                options={FOLDER_OPTIONS}
                className="mt-1 w-full"
              />
            </div>

            <div className="text-[12px] font-medium">
              <label htmlFor="doc-owner">Pemilik</label>
              <ComboboxField
                id="doc-owner"
                name="ownerId"
                options={employees}
                clearLabel="Dokumen perusahaan (semua karyawan)"
                placeholder="Dokumen perusahaan"
                searchPlaceholder="Cari karyawan…"
                emptyText="Karyawan tidak ditemukan."
                className="mt-1 w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" size="sm" disabled={upload.isPending}>
              {upload.isPending ? "Mengunggah…" : "Unggah"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDocument({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () =>
      send("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => {
      toast.success(`${name} dihapus`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <button
      type="button"
      aria-label={`Hapus ${name}`}
      disabled={m.isPending}
      onClick={() => window.confirm(`Hapus ${name}?`) && m.mutate()}
      className="text-subtle hover:text-danger hover:bg-accent flex size-8 items-center justify-center rounded-lg border transition-colors"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
