"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError, postJson, type Requests } from "../../_lib/api";
import { hariIniWib } from "../../_lib/format";
import { req } from "../../_lib/status";
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "../../_lib/ui";

type Jenis = "cuti" | "lembur";
const TIPE_CUTI = ["Cuti Tahunan", "Cuti Sakit", "Izin Khusus", "Izin Setengah Hari"] as const;

export default function PengajuanPage() {
  const [jenis, setJenis] = useState<Jenis>("cuti");
  const [buka, setBuka] = useState(false);
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

      {jenis === "cuti" && data?.balance ? (
        <Card className="flex items-end justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Sisa cuti</p>
            <p className="flex items-end gap-1.5">
              <span className="text-4xl leading-none font-bold tabular-nums">{data.balance.remaining}</span>
              <span className="text-[15px] text-muted-foreground">hari</span>
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Terpakai {data.balance.used} dari {data.balance.quota} hari
          </p>
        </Card>
      ) : null}

      <button
        type="button"
        onClick={() => setBuka(true)}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
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
                <div key={r.id} className="flex items-start gap-3.5 p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    {r.kind === "cuti" ? <CalendarDays className="size-5" aria-hidden /> : <Clock3 className="size-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[15px] font-semibold">{r.title}</p>
                    <p className="text-[13px] text-muted-foreground tabular-nums">{r.detail}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {r.note ? <span className="truncate text-xs text-muted-foreground">{r.note}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <FormPengajuan jenis={jenis} open={buka} onOpenChange={setBuka} />
    </div>
  );
}

function FormPengajuan({
  jenis,
  open,
  onOpenChange,
}: {
  jenis: Jenis;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const hariIni = hariIniWib();
  const [tipe, setTipe] = useState<(typeof TIPE_CUTI)[number]>("Cuti Tahunan");
  const [mulai, setMulai] = useState(hariIni);
  const [selesai, setSelesai] = useState(hariIni);
  const [jamMulai, setJamMulai] = useState("17:00");
  const [jamSelesai, setJamSelesai] = useState("19:00");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setengah = jenis === "cuti" && tipe === "Izin Setengah Hari";
  const pakaiJam = jenis === "lembur" || setengah;

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body =
      jenis === "lembur"
        ? { kind: "lembur", date: mulai, startTime: jamMulai, endTime: jamSelesai, reason: alasan.trim() }
        : {
            kind: "cuti",
            type: tipe,
            startDate: mulai,
            endDate: setengah ? mulai : selesai,
            reason: alasan.trim(),
            ...(setengah ? { startTime: jamMulai, endTime: jamSelesai } : {}),
          };
    try {
      await postJson("/api/me/requests", body);
      toast.success(jenis === "cuti" ? "Pengajuan cuti terkirim." : "Pengajuan lembur terkirim.");
      await qc.invalidateQueries({ queryKey: ["ios"] });
      setAlasan("");
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Pengajuan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-lg">{jenis === "cuti" ? "Ajukan cuti" : "Ajukan lembur"}</SheetTitle>
          <SheetDescription>
            {jenis === "cuti"
              ? "HR akan meninjau pengajuan ini dan mengabari Anda lewat notifikasi."
              : "Lembur dihitung dari jam mulai sampai jam selesai."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={kirim} className="space-y-4">
          {jenis === "cuti" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Jenis</span>
              <select value={tipe} onChange={(e) => setTipe(e.target.value as typeof tipe)} className={field}>
                {TIPE_CUTI.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
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
                <input
                  type="date"
                  value={selesai}
                  min={mulai}
                  onChange={(e) => setSelesai(e.target.value)}
                  required
                  className={field}
                />
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
                <input
                  type="time"
                  value={jamSelesai}
                  onChange={(e) => setJamSelesai(e.target.value)}
                  required
                  className={field}
                />
              </label>
            </div>
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
            {busy ? "Mengirim…" : "Kirim pengajuan"}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
