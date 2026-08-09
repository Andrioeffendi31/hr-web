"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
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
import { FileDrop } from "@/components/file-drop";

/** Mirrors MAX_MOBILE_DOC in api/me/documents — the employee upload is proxied
 *  through the route handler rather than presigned like the admin flow, so the
 *  ceiling is much lower than HR's 100 MB. */
const MAX_MB = 10;

/**
 * Upload one of your own documents.
 *
 * Posts to /api/me/documents, which files it under `personal` owned by the
 * session's employee — there is deliberately no folder picker and no owner
 * field, because an employee cannot file into Kontrak or on somebody's behalf.
 */
export function UploadBerkas() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const up = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/me/documents", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah");
      return data;
    },
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      toast.success("Berkas tersimpan");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="size-3.5" aria-hidden />
          Unggah berkas
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Unggah berkas</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Tersimpan sebagai berkas pribadi — hanya Anda dan tim HR yang bisa
            melihatnya.
          </DialogDescription>
        </DialogHeader>

        <FileDrop
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv"
          maxBytes={MAX_MB * 1024 * 1024}
          value={file}
          onFile={setFile}
          disabled={up.isPending}
          hint={`PDF, gambar atau dokumen · maks ${MAX_MB} MB`}
        />

        <DialogFooter>
          <Button
            size="sm"
            disabled={!file || up.isPending}
            onClick={() => file && up.mutate(file)}
          >
            {up.isPending ? "Mengunggah…" : "Unggah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
