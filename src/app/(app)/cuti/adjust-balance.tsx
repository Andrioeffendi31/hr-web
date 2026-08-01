"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
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

/** Carry-over / correction to one employee's annual quota. Positive adds days
 *  (unused leave from last year), negative takes them away. */
export function AdjustBalance({
  employeeId,
  name,
  year,
  days,
}: {
  employeeId: number;
  name: string;
  year: number;
  days: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const m = useMutation({
    mutationFn: async (input: { days: number; note: string }) => {
      const res = await fetch("/api/leave-balance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, year, ...input }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? "Gagal menyimpan koreksi saldo");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Saldo cuti ${name} diperbarui`);
      setOpen(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={`Koreksi saldo cuti ${name}`}
        className="text-subtle hover:text-foreground hover:bg-accent -my-1 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        <Pencil className="size-3" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[380px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.mutate({
              days: Number(f.get("days")),
              note: String(f.get("note") ?? "").trim(),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">Koreksi saldo — {name}</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Sisa cuti tahun lalu atau koreksi manual untuk tahun {year}. Boleh
              negatif. Nilai ini menggantikan koreksi sebelumnya, bukan menambah.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <label className="text-[12px] font-medium">
              Jumlah hari
              <input
                name="days"
                type="number"
                required
                step={1}
                min={-30}
                max={30}
                defaultValue={days}
                className="bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]"
              />
            </label>
            <label className="text-[12px] font-medium">
              Catatan
              <input
                name="note"
                maxLength={200}
                placeholder="mis. carry-over 2025"
                className="bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]"
              />
            </label>
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" size="sm" disabled={m.isPending}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
