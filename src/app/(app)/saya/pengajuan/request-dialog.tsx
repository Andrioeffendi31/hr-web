"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateField } from "@/components/date-field";
import { FileDrop } from "@/components/file-drop";
import { SelectField } from "@/components/select-field";
import { ukuranFile } from "@/lib/hr";
import type { RequestItem } from "./pengajuan";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "text-[12px] font-medium";
/** Mirrors MAX_ATTACHMENT in lib/r2.ts, restated here because that module pulls
 *  in the S3 client and has no business in a browser bundle. The server rejects
 *  anything larger regardless — this only saves a doomed upload. */
const MAX_ATTACHMENT_MB = 10;

/**
 * One dialog, three modes — exactly the three the mobile sheet has:
 *
 *  · `request === null`     → file a new one
 *  · status menunggu/revisi → reopen it in the form that created it and resubmit
 *  · anything else          → read-only; a decided request is history
 *
 * Keeping them together is what stops the revision form drifting from the form
 * that produced the row it is revising.
 */
export function RequestDialog({
  kind,
  request,
  delegates,
  onClose,
}: {
  kind: "cuti" | "lembur";
  request: RequestItem | null;
  delegates: { id: number; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  // the employee cleared the existing attachment without picking a new one
  const [dropped, setDropped] = useState(false);

  const editable =
    !request || request.status === "menunggu" || request.status === "revisi";
  const isEdit = Boolean(request) && editable;
  // overtime has no PUT endpoint: revising it would mean re-counting the weekly
  // cap while excluding the row being edited. Cancel and refile, same as mobile.
  const canSubmit = editable && (kind === "cuti" || !request);

  const done = async (msg: string) => {
    toast.success(msg);
    await qc.invalidateQueries({ queryKey: ["requests"] });
    await qc.invalidateQueries({ queryKey: ["me"] });
    onClose();
  };

  const send = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = new FormData(form);
      f.append("kind", kind);
      if (isEdit) f.append("id", String(request!.id));
      if (file) f.append("attachment", file);
      if (dropped && !file) f.append("removeAttachment", "1");

      // leave carries a file so it goes multipart; overtime has nothing to
      // attach and stays JSON — the endpoint reads either
      const init: RequestInit =
        kind === "cuti"
          ? { method: isEdit ? "PUT" : "POST", body: f }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(f)),
            };

      const res = await fetch("/api/me/requests", init);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      // the server owns the rules — balance, working days, the weekly cap — so
      // its refusal is shown verbatim rather than paraphrased here
      if (!res.ok) throw new Error(data.error ?? "Pengajuan gagal");
      return data;
    },
    onSuccess: () => done(isEdit ? "Revisi terkirim" : "Pengajuan terkirim"),
    onError: (e: Error) => toast.error(e.message),
  });

  const batal = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/me/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: request!.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal membatalkan");
      return data;
    },
    onSuccess: () => done("Pengajuan dibatalkan"),
    onError: (e: Error) => toast.error(e.message),
  });

  const title = request
    ? editable
      ? `Ubah ${kind}`
      : `Detail ${kind}`
    : kind === "cuti"
      ? "Ajukan cuti"
      : "Ajukan lembur";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {request?.status === "revisi"
              ? `HR meminta revisi: ${request.note}`
              : !editable
                ? request?.note
                : kind === "cuti"
                  ? "Durasi dihitung server dalam hari kerja."
                  : "Batas lembur mengikuti kebijakan perusahaan."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="request-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate(e.currentTarget);
          }}
        >
          <fieldset disabled={!editable} className="flex flex-col gap-3">
            {kind === "cuti" ? (
              <>
                <label className={LABEL}>
                  Jenis cuti
                  <SelectField
                    name="type"
                    defaultValue={request?.type ?? "Cuti Tahunan"}
                    ariaLabel="Jenis cuti"
                    className="mt-1 h-9 w-full"
                    options={[
                      { value: "Cuti Tahunan", label: "Cuti Tahunan" },
                      { value: "Cuti Sakit", label: "Cuti Sakit" },
                      { value: "Izin Khusus", label: "Izin Khusus" },
                    ]}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className={LABEL}>
                    <label htmlFor="startDate">Mulai</label>
                    <DateField
                      id="startDate"
                      name="startDate"
                      defaultValue={request?.startDate}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div className={LABEL}>
                    <label htmlFor="endDate">Selesai</label>
                    <DateField
                      id="endDate"
                      name="endDate"
                      defaultValue={request?.endDate}
                      className="mt-1 w-full"
                    />
                  </div>
                </div>

                <label className={LABEL}>
                  Pengganti selama cuti (opsional)
                  <SelectField
                    name="delegateId"
                    defaultValue={
                      request?.delegateId ? String(request.delegateId) : ""
                    }
                    ariaLabel="Pengganti"
                    className="mt-1 h-9 w-full"
                    options={[
                      { value: "", label: "Tidak ada" },
                      ...delegates.map((d) => ({
                        value: String(d.id),
                        label: d.name,
                      })),
                    ]}
                  />
                </label>
              </>
            ) : (
              <>
                <div className={LABEL}>
                  <label htmlFor="date">Tanggal</label>
                  <DateField
                    id="date"
                    name="date"
                    defaultValue={request?.date}
                    className="mt-1 w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={LABEL}>
                    Jam mulai
                    <input
                      name="startTime"
                      type="time"
                      defaultValue={request?.startTime ?? "17:30"}
                      className={FIELD}
                    />
                  </label>
                  <label className={LABEL}>
                    Jam selesai
                    <input
                      name="endTime"
                      type="time"
                      defaultValue={request?.endTime ?? "20:30"}
                      className={FIELD}
                    />
                  </label>
                </div>
              </>
            )}

            <label className={LABEL}>
              Alasan
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={500}
                rows={3}
                defaultValue={request?.reason}
                className="bg-card border-border-strong mt-1 w-full rounded-[9px] border px-2.5 py-2 text-[13px]"
              />
            </label>
          </fieldset>

          {kind === "cuti" && (
            <div className={LABEL}>
              Lampiran{" "}
              {request?.type === "Cuti Sakit" ? "(surat dokter)" : "(opsional)"}
              {request?.attachment && !dropped && !file ? (
                <div className="bg-surface-2 mt-1 flex items-center gap-2 rounded-[9px] border p-2.5 text-[12.5px]">
                  <a
                    href={`/api/files/${request.attachment.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {request.attachment.name}
                  </a>
                  {request.attachment.size && (
                    <span className="text-subtle tnum shrink-0 text-[11px]">
                      {ukuranFile(request.attachment.size)}
                    </span>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setDropped(true)}
                      className="text-danger shrink-0 text-[11.5px] font-medium"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              ) : (
                editable && (
                  <FileDrop
                    accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv"
                    maxBytes={MAX_ATTACHMENT_MB * 1024 * 1024}
                    value={file}
                    onFile={setFile}
                    hint={`PDF, gambar atau dokumen · maks ${MAX_ATTACHMENT_MB} MB`}
                    className="mt-1"
                  />
                )
              )}
            </div>
          )}
        </form>

        <DialogFooter className="gap-2">
          {request && editable && (
            <ConfirmDialog
              trigger={
                <Button variant="destructive" disabled={batal.isPending}>
                  Batalkan
                </Button>
              }
              title="Batalkan pengajuan?"
              description="Pengajuan ini ditarik dari antrian HR dan tidak bisa dikembalikan."
              confirmLabel="Batalkan"
              destructive
              onConfirm={() => batal.mutate()}
            />
          )}
          {canSubmit ? (
            <Button type="submit" form="request-form" disabled={send.isPending}>
              {send.isPending
                ? "Mengirim…"
                : isEdit
                  ? "Kirim revisi"
                  : "Kirim pengajuan"}
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
