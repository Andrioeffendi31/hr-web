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

type Division = {
  name: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  lateToleranceMinutes: number | null;
};

type Fallback = { shiftStart: string; shiftEnd: string; lateToleranceMinutes: number };

async function send(method: string, body: unknown) {
  const res = await fetch("/api/divisions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Permintaan gagal");
  return data;
}

/** `time` comes back as HH:mm:ss; the input wants HH:mm. */
const hhmm = (t: string | null) => t?.slice(0, 5) ?? "";

/**
 * Create when `initial` is absent, edit when present — the two forms differ only
 * in what they start with and whether the name is a rename, so they are one
 * component rather than two that drift apart.
 */
export function DivisiDialog({
  fallback,
  initial,
}: {
  fallback: Fallback;
  initial?: Division;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => send("POST", body),
    onSuccess: (_d, v) => {
      setOpen(false);
      toast.success(`Divisi ${v.name} disimpan`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const def = {
    start: fallback.shiftStart.slice(0, 5),
    end: fallback.shiftEnd.slice(0, 5),
    tol: fallback.lateToleranceMinutes,
  };

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
            Tambah divisi
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {initial ? `Ubah ${initial.name}` : "Divisi baru"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Kosongkan jam kerja untuk mengikuti jadwal default perusahaan ({def.start}–
            {def.end}, toleransi {def.tol} menit).
          </DialogDescription>
        </DialogHeader>

        <form
          id="divisi-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              name: String(f.get("name")).trim(),
              ...(initial ? { original: initial.name } : null),
              shiftStart: String(f.get("shiftStart") ?? ""),
              shiftEnd: String(f.get("shiftEnd") ?? ""),
              lateToleranceMinutes: String(f.get("lateToleranceMinutes") ?? ""),
            });
          }}
        >
          <label className="text-[12px] font-medium">
            Nama divisi
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={initial?.name ?? ""}
              className={FIELD}
            />
            {initial && (
              <span className="text-subtle mt-1 block text-[11px] font-normal">
                Mengganti nama ikut memindahkan semua karyawan di divisi ini.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-medium">
              Jam masuk
              <input
                name="shiftStart"
                type="time"
                defaultValue={hhmm(initial?.shiftStart ?? null)}
                className={FIELD}
              />
            </label>
            <label className="text-[12px] font-medium">
              Jam keluar
              <input
                name="shiftEnd"
                type="time"
                defaultValue={hhmm(initial?.shiftEnd ?? null)}
                className={FIELD}
              />
            </label>
          </div>

          <label className="text-[12px] font-medium">
            Toleransi keterlambatan (menit)
            <input
              name="lateToleranceMinutes"
              type="number"
              min={0}
              max={240}
              placeholder={`kosong = ${def.tol}`}
              defaultValue={initial?.lateToleranceMinutes ?? ""}
              className={FIELD}
            />
          </label>
        </form>

        <DialogFooter>
          <Button type="submit" form="divisi-form" size="sm" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDivisi({ name, headcount }: { name: string; headcount: number }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => send("DELETE", { name }),
    onSuccess: () => {
      toast.success(`Divisi ${name} dihapus`);
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
      title={`Hapus divisi ${name}?`}
      // the server refuses this anyway — saying so up front beats an error toast
      description={
        headcount > 0
          ? `Masih ada ${headcount} karyawan di divisi ini. Pindahkan mereka dulu sebelum menghapus.`
          : "Divisi ini belum punya karyawan, jadi aman dihapus."
      }
      confirmLabel="Hapus"
      destructive
      onConfirm={() => m.mutate()}
    />
  );
}
