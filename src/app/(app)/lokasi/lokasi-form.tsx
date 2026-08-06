"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

type Location = {
  id: number;
  name: string;
  lat: string;
  lng: string;
  radiusM: number;
  active: boolean;
};

async function send(method: string, body: unknown) {
  const res = await fetch("/api/locations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Permintaan gagal");
  return data;
}

export function LokasiDialog({ initial }: { initial?: Location }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => send("POST", body),
    onSuccess: (_d, v) => {
      setOpen(false);
      toast.success(`Lokasi ${v.name} disimpan`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <button
            aria-label={`Ubah ${initial.name}`}
            className="text-subtle hover:text-foreground hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : (
          <Button size="sm">
            <Plus className="size-3.5" aria-hidden />
            Tambah lokasi
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {initial ? `Ubah ${initial.name}` : "Lokasi absen baru"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Buka Google Maps, klik kanan pada titik kantor, lalu salin koordinatnya.
          </DialogDescription>
        </DialogHeader>

        <form
          id="lokasi-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              ...(initial ? { id: initial.id } : null),
              name: String(f.get("name")).trim(),
              lat: String(f.get("lat")),
              lng: String(f.get("lng")),
              radiusM: String(f.get("radiusM")),
              active: f.get("active") === "on",
            });
          }}
        >
          <label className="text-[12px] font-medium">
            Nama lokasi
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Kantor Pusat"
              defaultValue={initial?.name ?? ""}
              className={FIELD}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-medium">
              Latitude
              <input
                name="lat"
                type="number"
                step="0.000001"
                min={-90}
                max={90}
                required
                defaultValue={initial?.lat ?? ""}
                className={FIELD}
              />
            </label>
            <label className="text-[12px] font-medium">
              Longitude
              <input
                name="lng"
                type="number"
                step="0.000001"
                min={-180}
                max={180}
                required
                defaultValue={initial?.lng ?? ""}
                className={FIELD}
              />
            </label>
          </div>

          <label className="text-[12px] font-medium">
            Radius geofence (meter)
            <input
              name="radiusM"
              type="number"
              min={25}
              max={5000}
              required
              defaultValue={initial?.radiusM ?? 150}
              className={FIELD}
            />
            <span className="text-subtle mt-1 block text-[11px] font-normal">
              Terlalu kecil dan pergeseran GPS biasa akan menolak absen yang sah.
            </span>
          </label>

          <label className="flex items-center gap-2 text-[12.5px]">
            <input
              name="active"
              type="checkbox"
              defaultChecked={initial?.active ?? true}
              className="size-4"
            />
            Aktif — muncul sebagai pilihan di aplikasi karyawan
          </label>
        </form>

        <DialogFooter>
          <Button type="submit" form="lokasi-form" size="sm" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteLokasi({
  id,
  name,
  punches,
}: {
  id: number;
  name: string;
  punches: number;
}) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => send("DELETE", { id }),
    onSuccess: () => {
      toast.success(`Lokasi ${name} dihapus`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      trigger={
        <button
          aria-label={`Hapus ${name}`}
          disabled={m.isPending}
          className="text-subtle hover:text-danger hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      }
      title={`Hapus lokasi ${name}?`}
      // deletion is refused server-side once there is history — the point of the
      // location is to explain why a punch counted, and that has to keep resolving
      description={
        punches > 0
          ? `Sudah ada ${punches} absensi di lokasi ini, jadi tidak bisa dihapus. Nonaktifkan lewat tombol ubah supaya hilang dari pilihan karyawan tapi riwayatnya tetap utuh.`
          : "Lokasi ini belum pernah dipakai absen, jadi aman dihapus."
      }
      confirmLabel="Hapus"
      destructive
      onConfirm={() => m.mutate()}
    />
  );
}
