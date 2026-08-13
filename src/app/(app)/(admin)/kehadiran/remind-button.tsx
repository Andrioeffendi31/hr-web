"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Sends the "belum absen" reminder email (PRD §8). */
export function RemindButton({
  ids,
  date,
  label,
  compact,
}: {
  ids: number[];
  date: string;
  label: string;
  compact?: boolean;
}) {
  const m = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, date }),
      });
      if (!res.ok) throw new Error("Gagal mengirim pengingat");
      return res.json() as Promise<{ sent: number }>;
    },
    onSuccess: ({ sent }) =>
      toast.success(
        sent === 1
          ? "Pengingat terkirim"
          : `Pengingat terkirim ke ${sent} karyawan`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className={cn(
        "hover:bg-accent flex h-8 shrink-0 items-center rounded-lg border font-medium transition-colors disabled:opacity-50",
        compact
          ? "text-muted-foreground px-2.5 text-[11.5px]"
          : "bg-surface-2 px-2.5 text-[12px]",
      )}
    >
      {m.isPending ? "Mengirim…" : label}
    </button>
  );
}
