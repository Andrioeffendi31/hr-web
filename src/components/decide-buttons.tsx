"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Action = "disetujui" | "ditolak" | "revisi";

async function decide(input: {
  kind: "cuti" | "lembur";
  id: number;
  action: Action;
  note?: string;
}) {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(error ?? "Gagal memproses pengajuan");
  }
  return res.json();
}

const VERB: Record<Action, string> = {
  disetujui: "disetujui",
  ditolak: "ditolak",
  revisi: "dikembalikan untuk revisi",
};

/** Approve / reject / request-revision. Buttons disable while in flight so a
 *  double-click can't double-decide. */
export function DecideButtons({
  kind,
  id,
  name,
  allowRevision,
}: {
  kind: "cuti" | "lembur";
  id: number;
  name: string;
  allowRevision?: boolean;
}) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: decide,
    onSuccess: (_data, vars) => {
      toast.success(`Pengajuan ${name} ${VERB[vars.action]}`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = (action: Action, note?: string) =>
    m.mutate({ kind, id, action, note });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={m.isPending}
        onClick={() => run("disetujui")}
        className="h-8 text-[12.5px]"
      >
        Setujui
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={m.isPending}
        onClick={() => {
          const note = window.prompt(`Alasan penolakan untuk ${name}:`);
          if (note === null) return;
          if (!note.trim()) {
            toast.error("Alasan penolakan wajib diisi");
            return;
          }
          run("ditolak", note.trim());
        }}
        className="text-danger hover:text-danger h-8 text-[12.5px]"
      >
        Tolak
      </Button>
      {allowRevision && (
        <Button
          size="sm"
          variant="ghost"
          disabled={m.isPending}
          onClick={() => {
            const note = window.prompt(`Apa yang perlu direvisi ${name}?`);
            if (note === null) return;
            run("revisi", note.trim() || undefined);
          }}
          className="text-muted-foreground h-8 text-[12.5px]"
        >
          Minta revisi
        </Button>
      )}
    </div>
  );
}
