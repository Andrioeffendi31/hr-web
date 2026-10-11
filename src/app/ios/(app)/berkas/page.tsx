"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError, fileUrl, postForm, postJson, type Documents } from "../../_lib/api";
import { kecilkan } from "../../_lib/image";
import { Lightbox } from "../../_lib/lightbox";

/** berkas yang dibuka sebagai pratinjau layar penuh, bukan diunduh */
const GAMBAR = /\.(jpe?g|png|webp)$/i;
import { BackHeader, Card, ErrorNote, Skeleton } from "../../_lib/ui";

const FOLDER: Record<string, string> = {
  personal: "Unggahan saya",
  kontrak: "Kontrak",
  sertif: "Sertifikat",
  legal: "Dokumen perusahaan",
};

export default function BerkasPage() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [unggah, setUnggah] = useState(false);
  const [hapus, setHapus] = useState<Documents["items"][number] | null>(null);
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "documents"],
    queryFn: () => api<Documents>("/api/me/documents"),
  });

  async function kirim(file: File) {
    setUnggah(true);
    try {
      const form = new FormData();
      // foto dikecilkan seperti di app Android; PDF dan dokumen dikirim apa adanya
      form.set("file", file.type.startsWith("image/") ? await kecilkan(file, 2000, file.name.replace(/\.\w+$/, ".jpg")) : file);
      await postForm("/api/me/documents", form);
      await qc.invalidateQueries({ queryKey: ["ios", "documents"] });
      toast.success("Berkas terunggah.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Berkas gagal diunggah.");
    } finally {
      setUnggah(false);
    }
  }

  async function hapusBerkas(id: number) {
    try {
      await postJson("/api/me/documents", { id }, "DELETE");
      await qc.invalidateQueries({ queryKey: ["ios", "documents"] });
      toast.success("Berkas dihapus.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Berkas gagal dihapus.");
    }
  }

  const grup = data
    ? Object.entries(
        data.items.reduce<Record<string, Documents["items"]>>((acc, d) => {
          (acc[d.folder] ??= []).push(d);
          return acc;
        }, {}),
      )
    : [];

  return (
    <div className="space-y-6">
      <BackHeader href="/ios/pengaturan" title="Berkas saya" />

      {isPending ? (
        <Skeleton className="h-72" />
      ) : error || !data ? (
        <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ruang terpakai</p>
                <p className="text-xl font-bold tabular-nums">
                  {data.storage.terpakai} <span className="text-sm font-normal text-muted-foreground">dari {data.storage.kuota}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Sisa {data.storage.sisa}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (data.storage.usedBytes / Math.max(1, data.storage.quotaBytes)) * 100)}%` }}
              />
            </div>
          </Card>

          <input
            ref={input}
            type="file"
            accept=".pdf,.docx,.xlsx,.csv,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void kirim(f);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={unggah}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
          >
            {unggah ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}
            {unggah ? "Mengunggah…" : "Unggah berkas"}
          </button>
          <p className="-mt-3 text-center text-xs text-muted-foreground">PDF, DOCX, XLSX, CSV, atau foto. Maksimal 10 MB.</p>

          {grup.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-muted-foreground">
                Belum ada berkas. Kontrak dan sertifikat dari HR akan muncul di sini.
              </p>
            </Card>
          ) : (
            grup.map(([folder, items]) => (
              <section key={folder} className="space-y-2.5">
                <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{FOLDER[folder] ?? folder}</h2>
                <Card className="divide-y divide-border p-0">
                  {items.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                      {GAMBAR.test(d.key) ? (
                        <button
                          type="button"
                          onClick={() => setFoto({ src: fileUrl(d.key), alt: d.name })}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- dilayani /api/files dengan sesi */}
                          <img
                            src={fileUrl(d.key)}
                            alt=""
                            className="size-10 shrink-0 rounded-xl object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium">{d.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {d.size} · {d.uploadedAt}
                            </span>
                          </span>
                        </button>
                      ) : (
                        <a href={fileUrl(d.key)} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <FileText className="size-4" aria-hidden />
                            <span className="text-[9px] font-bold">{d.ext}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium">{d.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {d.size} · {d.uploadedAt}
                            </span>
                          </span>
                        </a>
                      )}
                      {d.mine ? (
                        <button
                          type="button"
                          onClick={() => setHapus(d)}
                          aria-label={`Hapus ${d.name}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-danger"
                        >
                          <Trash2 className="size-[18px]" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </Card>
              </section>
            ))
          )}
        </>
      )}

      <Lightbox src={foto?.src ?? ""} alt={foto?.alt ?? ""} open={!!foto} onOpenChange={(o) => !o && setFoto(null)} />

      <AlertDialog open={!!hapus} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus “{hapus?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Berkas ini akan dihapus permanen dan tidak bisa dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (hapus) void hapusBerkas(hapus.id);
                setHapus(null);
              }}
            >
              Hapus berkas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
