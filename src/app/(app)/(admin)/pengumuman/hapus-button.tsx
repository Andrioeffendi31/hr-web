"use client";

import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSegarkanPengumuman } from "./segarkan";

/** Hapus pengumuman. Bannernya ikut terhapus dari object storage oleh rutenya,
 *  dan `announcement_reads` oleh ON DELETE CASCADE. */
export function HapusButton({ id, title }: { id: number; title: string }) {
  const segarkan = useSegarkanPengumuman();

  const hapus = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Pengumuman gagal dihapus");
      return data;
    },
    onSuccess: () => {
      toast.success("Pengumuman dihapus");
      segarkan();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={hapus.isPending}
          className="text-subtle hover:text-danger hover:bg-muted rounded-[8px] p-1.5"
          aria-label={`Hapus pengumuman ${title}`}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      }
      title="Hapus pengumuman?"
      description={
        <>
          <span className="font-medium">{title}</span> akan hilang dari aplikasi
          karyawan, beserta bannernya. Tindakan ini tidak bisa dibatalkan.
        </>
      }
      confirmLabel="Hapus"
      destructive
      onConfirm={() => hapus.mutate()}
    />
  );
}
