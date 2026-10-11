"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Clock3, Download, FileText, Loader2, Paperclip, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError, fileUrl, postForm, postJson, type RequestItem, type Requests } from "../../_lib/api";
import { hariIniWib } from "../../_lib/format";
import { ZoomImage } from "../../_lib/lightbox";
import { req } from "../../_lib/status";
import { Badge, Card, ErrorNote, FIELD, PageHeader, SectionTitle, Select, Skeleton } from "../../_lib/ui";

type Jenis = "cuti" | "lembur";
const TIPE_CUTI = ["Cuti Tahunan", "Cuti Sakit", "Izin Khusus", "Izin Setengah Hari"] as const;
type TipeCuti = (typeof TIPE_CUTI)[number];

/** Aturan yang sama dengan PATCH/PUT di api/me/requests. */
const bisaDiperbaiki = (r: RequestItem) => r.kind === "cuti" && (r.status === "menunggu" || r.status === "revisi");
const bisaDibatalkan = (r: RequestItem) =>
  r.status === "menunggu" || r.status === "revisi" || (r.kind === "cuti" && r.status === "menunggu_pimpinan");

export default function PengajuanPage() {
  // aksi cepat "Lembur" di Beranda membuka tab ini lewat ?jenis=lembur
  const awal = useSearchParams().get("jenis") === "lembur" ? "lembur" : "cuti";
  const [jenis, setJenis] = useState<Jenis>(awal);
  const [form, setForm] = useState<{ edit: RequestItem | null } | null>(null);
  const [lihat, setLihat] = useState<RequestItem | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["ios", "requests"],
    queryFn: () => api<Requests>("/api/me/requests"),
  });

  const items = data ? data[jenis] : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Pengajuan saya" subtitle="Kelola cuti dan lembur dalam satu tempat" />

      <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist">
        {(
          [
            ["cuti", "Cuti", CalendarDays],
            ["lembur", "Lembur", Clock3],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={jenis === k}
            onClick={() => setJenis(k)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium",
              jenis === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {jenis === "cuti" && data ? <KartuSaldo balance={data.balance} /> : null}

      <button
        type="button"
        onClick={() => setForm({ edit: null })}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.96]"
      >
        <Plus className="size-5" aria-hidden />
        {jenis === "cuti" ? "Ajukan cuti" : "Ajukan lembur"}
      </button>

      <div className="space-y-3">
        <SectionTitle aside={data ? `${items.length} pengajuan` : undefined}>Riwayat pengajuan</SectionTitle>
        {isPending ? (
          <Skeleton className="h-40" />
        ) : error || !data ? (
          <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-muted-foreground">
              Belum ada pengajuan {jenis}. Ketuk tombol di atas untuk membuat yang pertama.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {items.map((r) => {
              const s = req(r.status);
              return (
                <button key={r.id} type="button" onClick={() => setLihat(r)} className="flex w-full items-center gap-3.5 p-4 text-left">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    {r.kind === "cuti" ? <CalendarDays className="size-5" aria-hidden /> : <Clock3 className="size-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-[15px] font-semibold">{r.title}</span>
                    <span className="block text-[13px] text-muted-foreground tabular-nums">{r.detail}</span>
                    <span className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.attachment ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" aria-hidden />
                          Lampiran
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              );
            })}
          </Card>
        )}
      </div>

      <DetailPengajuan
        item={lihat}
        onClose={() => setLihat(null)}
        onEdit={(r) => {
          setLihat(null);
          setForm({ edit: r });
        }}
      />
      <FormPengajuan
        key={form?.edit?.id ?? `baru-${jenis}`}
        jenis={form?.edit?.kind ?? jenis}
        edit={form?.edit ?? null}
        delegates={data?.delegates ?? []}
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
      />
    </div>
  );
}

/**
 * Dua kartu sejajar seperti di desain: angka sisa cuti, dan kuota tahunan
 * sebagai kotak-kotak (satu kotak = satu hari) supaya "terpakai berapa" terbaca
 * sekilas tanpa menghitung.
 */
function KartuSaldo({ balance }: { balance: Requests["balance"] }) {
  const quota = balance?.quota ?? 0;
  const used = Math.min(balance?.used ?? 0, quota);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="flex min-h-44 flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold text-muted-foreground">Sisa cuti</p>
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
          </span>
        </div>
        <div className="space-y-1">
          <p className="flex items-end gap-1.5">
            <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{balance?.remaining ?? 0}</span>
            <span className="pb-0.5 text-[15px] text-muted-foreground">hari</span>
          </p>
          <p className="text-xs text-muted-foreground">dari {quota} hari kuota</p>
        </div>
      </Card>

      <Card className="flex min-h-44 flex-col justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Kuota tahunan</p>
          <p className="text-xs text-muted-foreground">Setiap kotak = 1 hari</p>
        </div>
        {quota > 0 ? (
          <div className="flex flex-wrap gap-1" role="img" aria-label={`Terpakai ${used} dari ${quota} hari`}>
            {Array.from({ length: quota }, (_, i) => (
              <span key={i} className={cn("size-3 rounded-[3px]", i < used ? "bg-primary" : "bg-muted ring-1 ring-border ring-inset")} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground text-pretty">Kuota belum diatur oleh HR</p>
        )}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-primary" aria-hidden />
            Terpakai {used} hari
          </p>
          <p className="flex items-center gap-1.5">
            <RefreshCw className="size-3" aria-hidden />
            Reset tiap tahun
          </p>
        </div>
      </Card>
    </div>
  );
}

function DetailPengajuan({
  item,
  onClose,
  onEdit,
}: {
  item: RequestItem | null;
  onClose: () => void;
  onEdit: (r: RequestItem) => void;
}) {
  const qc = useQueryClient();
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = item;
  const s = r ? req(r.status) : null;

  async function batalkan() {
    if (!r) return;
    setBusy(true);
    try {
      await postJson("/api/me/requests", { kind: r.kind, id: r.id }, "PATCH");
      await qc.invalidateQueries({ queryKey: ["ios"] });
      toast.success("Pengajuan dibatalkan.");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Gagal membatalkan.");
    } finally {
      setBusy(false);
      setKonfirmasi(false);
    }
  }

  const baris: [string, string | null | undefined][] = r
    ? [
        ["Waktu", r.detail],
        ["Alasan", r.reason],
        ["Pengganti tugas", r.delegateName],
        ["Catatan HR", r.note],
      ]
    : [];

  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        {r && s ? (
          <>
            <SheetHeader className="px-0">
              <SheetTitle className="text-lg">{r.title}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="divide-y divide-border rounded-2xl border border-border">
              {baris
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="space-y-0.5 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="text-[15px] text-pretty">{v}</p>
                  </div>
                ))}
            </div>

            {r.attachment && /\.(jpe?g|png|webp)$/i.test(r.attachment.key) ? (
              <ZoomImage
                src={fileUrl(r.attachment.key)}
                alt={r.attachment.name ?? "Lampiran"}
                className="rounded-2xl border border-border"
                imgClassName="max-h-64 w-full object-cover"
              />
            ) : r.attachment ? (
              <a
                href={fileUrl(r.attachment.key)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border p-3"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileText className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.attachment.name ?? "Lampiran"}</span>
                <span className="text-xs font-semibold text-primary">Buka</span>
              </a>
            ) : null}

            {r.suratToken && r.status === "disetujui" ? (
              <a
                href={`/api/surat/cuti/${r.suratToken}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-subtle font-semibold text-primary"
              >
                <Download className="size-5" aria-hidden />
                Unduh surat izin (PDF)
              </a>
            ) : null}

            <div className="space-y-2 pt-1">
              {bisaDiperbaiki(r) ? (
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground"
                >
                  {r.status === "revisi" ? "Perbaiki dan kirim ulang" : "Ubah pengajuan"}
                </button>
              ) : null}
              {bisaDibatalkan(r) ? (
                <button
                  type="button"
                  onClick={() => setKonfirmasi(true)}
                  className="h-12 w-full rounded-xl bg-danger-subtle font-semibold text-danger"
                >
                  Batalkan pengajuan
                </button>
              ) : null}
            </div>

            <AlertDialog open={konfirmasi} onOpenChange={setKonfirmasi}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Batalkan {r.title.toLowerCase()}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pengajuan ini akan ditarik dari antrean HR. Anda perlu mengajukan ulang jika masih membutuhkannya.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Jangan batalkan</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={busy} onClick={batalkan}>
                    Batalkan pengajuan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FormPengajuan({
  jenis,
  edit,
  delegates,
  open,
  onOpenChange,
}: {
  jenis: Jenis;
  edit: RequestItem | null;
  delegates: { id: number; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const hariIni = hariIniWib();
  const [tipe, setTipe] = useState<TipeCuti>(edit?.type ?? "Cuti Tahunan");
  const [mulai, setMulai] = useState(edit?.startDate ?? edit?.date ?? hariIni);
  const [selesai, setSelesai] = useState(edit?.endDate ?? hariIni);
  const [jamMulai, setJamMulai] = useState(edit?.startTime ?? (jenis === "lembur" ? "17:00" : "08:00"));
  const [jamSelesai, setJamSelesai] = useState(edit?.endTime ?? (jenis === "lembur" ? "19:00" : "12:00"));
  const [alasan, setAlasan] = useState(edit?.reason ?? "");
  const [pengganti, setPengganti] = useState<string>(edit?.delegateId ? String(edit.delegateId) : "");
  const [lampiran, setLampiran] = useState<File | null>(null);
  const [lampiranLama, setLampiranLama] = useState(edit?.attachment ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setengah = jenis === "cuti" && tipe === "Izin Setengah Hari";
  const pakaiJam = jenis === "lembur" || setengah;

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (jenis === "lembur") {
        await postJson("/api/me/requests", {
          kind: "lembur",
          date: mulai,
          startTime: jamMulai,
          endTime: jamSelesai,
          reason: alasan.trim(),
        });
      } else {
        // multipart: satu-satunya bentuk yang bisa membawa lampiran, dan dipahami
        // POST maupun PUT (lihat payload() di api/me/requests)
        const f = new FormData();
        if (edit) f.set("id", String(edit.id));
        else f.set("kind", "cuti");
        f.set("type", tipe);
        f.set("startDate", mulai);
        f.set("endDate", setengah ? mulai : selesai);
        f.set("reason", alasan.trim());
        if (pengganti) f.set("delegateId", pengganti);
        if (setengah) {
          f.set("startTime", jamMulai);
          f.set("endTime", jamSelesai);
        }
        if (lampiran) f.set("attachment", lampiran);
        else if (edit?.attachment && !lampiranLama) f.set("removeAttachment", "1");
        await postForm("/api/me/requests", f, edit ? "PUT" : "POST");
      }
      toast.success(edit ? "Pengajuan dikirim ulang." : jenis === "cuti" ? "Pengajuan cuti terkirim." : "Pengajuan lembur terkirim.");
      await qc.invalidateQueries({ queryKey: ["ios"] });
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Pengajuan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  const field = FIELD;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)]">
        <SheetHeader className="px-0">
          <SheetTitle className="text-lg">
            {edit ? "Perbaiki pengajuan cuti" : jenis === "cuti" ? "Ajukan cuti" : "Ajukan lembur"}
          </SheetTitle>
          <SheetDescription>
            {edit?.status === "revisi" && edit.note
              ? `Catatan HR: ${edit.note}`
              : jenis === "cuti"
                ? "HR akan meninjau pengajuan ini dan mengabari Anda lewat notifikasi."
                : "Lembur dihitung dari jam mulai sampai jam selesai."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={kirim} className="space-y-4">
          {jenis === "cuti" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Jenis</span>
              <Select value={tipe} onChange={(e) => setTipe(e.target.value as TipeCuti)}>
                {TIPE_CUTI.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </label>
          ) : null}

          <div className={cn("grid gap-3", jenis === "cuti" && !setengah ? "grid-cols-2" : "grid-cols-1")}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{jenis === "cuti" && !setengah ? "Mulai" : "Tanggal"}</span>
              <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} required className={field} />
            </label>
            {jenis === "cuti" && !setengah ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Selesai</span>
                <input type="date" value={selesai} min={mulai} onChange={(e) => setSelesai(e.target.value)} required className={field} />
              </label>
            ) : null}
          </div>

          {pakaiJam ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Jam mulai</span>
                <input type="time" value={jamMulai} onChange={(e) => setJamMulai(e.target.value)} required className={field} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Jam selesai</span>
                <input type="time" value={jamSelesai} onChange={(e) => setJamSelesai(e.target.value)} required className={field} />
              </label>
            </div>
          ) : null}

          {jenis === "cuti" && delegates.length ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Pengganti tugas <span className="font-normal text-muted-foreground">(opsional)</span>
              </span>
              <Select value={pengganti} onChange={(e) => setPengganti(e.target.value)}>
                <option value="">Tidak ada</option>
                {delegates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Alasan</span>
            <textarea
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              required
              minLength={5}
              placeholder={jenis === "cuti" ? "Contoh: Acara keluarga di luar kota" : "Contoh: Menyelesaikan laporan bulanan"}
              className="w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </label>

          {jenis === "cuti" ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                Lampiran <span className="font-normal text-muted-foreground">(opsional, mis. surat dokter)</span>
              </span>
              {lampiran || lampiranLama ? (
                <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{lampiran?.name ?? lampiranLama?.name ?? "Lampiran"}</span>
                  <button
                    type="button"
                    aria-label="Hapus lampiran"
                    onClick={() => {
                      setLampiran(null);
                      setLampiranLama(null);
                    }}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground">
                  <Paperclip className="size-4" aria-hidden />
                  Pilih file (PDF, foto, DOCX — maks 10 MB)
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.csv,image/*"
                    className="sr-only"
                    onChange={(e) => setLampiran(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          ) : null}

          {err ? (
            <p role="alert" className="rounded-xl bg-danger-subtle px-3.5 py-2.5 text-sm text-danger">
              {err}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || alasan.trim().length < 5}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {busy ? "Mengirim…" : edit ? "Kirim ulang pengajuan" : "Kirim pengajuan"}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
