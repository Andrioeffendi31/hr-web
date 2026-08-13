"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PinButton({ id, pinned }: { id: number; pinned: boolean }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/announcements/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned: !pinned }),
      });
      if (!res.ok) throw new Error("Gagal memperbarui pengumuman");
      return res.json();
    },
    onSuccess: () => {
      toast.success(pinned ? "Sematan dilepas" : "Pengumuman disematkan");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      aria-pressed={pinned}
      aria-label={pinned ? "Lepas sematan pengumuman" : "Sematkan pengumuman"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
        pinned
          ? "border-primary/45 bg-primary-subtle text-primary"
          : "bg-surface-2 text-subtle hover:text-foreground",
      )}
    >
      <Pin className={cn("size-4", pinned && "fill-current")} aria-hidden />
    </button>
  );
}
