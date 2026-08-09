"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/date-field";
import { Panel } from "@/components/bits";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileDrop } from "@/components/file-drop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

async function post(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Permintaan gagal");
  return data;
}

export function DeleteHoliday({ date, name }: { date: string; name: string }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () =>
      post("/api/holidays", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      }),
    onSuccess: () => {
      toast.success(`${name} dihapus`);
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
      title={`Hapus ${name}?`}
      description={`Tanggal ${date} kembali dihitung sebagai hari kerja, termasuk pada perhitungan saldo cuti.`}
      confirmLabel="Hapus"
      destructive
      onConfirm={() => m.mutate()}
    />
  );
}

type Suggestion = { date: string; name: string; collective: boolean; exists: boolean };

/** Add one, import a CSV, or pull the national calendar for review. */
export function HolidayTools({ year }: { year: number }) {
  const router = useRouter();
  const [csv, setCsv] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  // bumping this remounts the date picker, which form.reset() cannot clear
  const [formKey, setFormKey] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const done = (msg: string) => {
    toast.success(msg);
    router.refresh();
  };

  const add = useMutation({
    mutationFn: (body: { date: string; name: string; collective: boolean }) =>
      post("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (_d, v) => {
      setFormKey((k) => k + 1);
      done(`${v.name} disimpan`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return post("/api/holidays/import", { method: "POST", body: fd }) as Promise<{
        imported: number;
        skipped: number;
        errors: { line: number; message: string }[];
      }>;
    },
    onSuccess: (r) => {
      done(`${r.imported} hari libur diimpor, ${r.skipped} baris dilewati`);
      setCsv(null);
      for (const e of r.errors.slice(0, 5)) {
        toast.error(`Baris ${e.line}: ${e.message}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggest = useMutation({
    mutationFn: () =>
      post(`/api/holidays/suggest?year=${year}`, { method: "GET" }) as Promise<{
        items: Suggestion[];
      }>,
    onSuccess: (r) => {
      setSuggestions(r.items);
      setPicked(new Set(r.items.filter((i) => !i.exists).map((i) => i.date)));
      if (r.items.length === 0) toast.info(`Tidak ada data libur untuk ${year}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSuggestions = useMutation({
    mutationFn: () =>
      post("/api/holidays/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          (suggestions ?? [])
            .filter((s) => picked.has(s.date))
            .map(({ date, name, collective }) => ({ date, name, collective })),
        ),
      }) as Promise<{ imported: number }>,
    onSuccess: (r) => {
      setSuggestions(null);
      done(`${r.imported} hari libur disimpan`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (date: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
      <Panel title="Tambah hari libur">
        <form
          key={formKey}
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const date = String(f.get("date") ?? "");
            if (!date) {
              toast.error("Tanggal wajib dipilih");
              return;
            }
            add.mutate({
              date,
              name: String(f.get("name")).trim(),
              collective: f.get("collective") === "on",
            });
          }}
        >
          <div className="text-[12px] font-medium">
            <label htmlFor="holiday-date">Tanggal</label>
            <DateField
              id="holiday-date"
              name="date"
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              className="mt-1 w-full"
            />
          </div>
          <label className="text-[12px] font-medium">
            Nama hari libur
            <input name="name" required maxLength={120} className={FIELD} />
          </label>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input name="collective" type="checkbox" className="size-4" />
            Cuti bersama (memotong saldo cuti tahunan)
          </label>
          <Button type="submit" size="sm" disabled={add.isPending}>
            Simpan
          </Button>
        </form>
      </Panel>

      <Panel title="Import & isi otomatis">
        <div className="flex flex-col gap-3 p-4">
          <a
            href="/api/holidays/template"
            className="text-primary inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
          >
            <Download className="size-3.5" aria-hidden />
            Unduh template CSV (buka di Excel)
          </a>
          <div className="text-[12px] font-medium">
            Import file CSV
            <FileDrop
              accept=".csv"
              maxBytes={256 * 1024}
              value={csv}
              disabled={importCsv.isPending}
              hint="CSV · maksimal 256 KB"
              className="mt-1"
              onFile={(f) => {
                setCsv(f);
                if (f) importCsv.mutate(f);
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={suggest.isPending}
            onClick={() => suggest.mutate()}
          >
            {suggest.isPending ? "Mengambil…" : `Ambil libur nasional ${year}`}
          </Button>
          <p className="text-subtle text-[11px] leading-snug">
            Hasilnya ditinjau dulu sebelum disimpan. Penetapan cuti bersama resmi tetap
            mengacu SKB 3 Menteri.
          </p>
        </div>
      </Panel>

      <Dialog open={suggestions !== null} onOpenChange={(o) => !o && setSuggestions(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Libur nasional {year}</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Centang yang ingin disimpan. Tandai ulang cuti bersama bila perlu.
            </DialogDescription>
          </DialogHeader>

          <ul className="divide-y">
            {(suggestions ?? []).map((s) => (
              <li key={s.date} className="flex items-center gap-2.5 py-2">
                <input
                  type="checkbox"
                  checked={picked.has(s.date)}
                  onChange={() => toggle(s.date)}
                  aria-label={`Simpan ${s.name}`}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{s.name}</span>
                  <span className="text-subtle tnum text-[11px]">
                    {s.date}
                    {s.exists && " · sudah ada"}
                  </span>
                </span>
                <label className="text-subtle flex shrink-0 items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    checked={s.collective}
                    onChange={() =>
                      setSuggestions((prev) =>
                        (prev ?? []).map((p) =>
                          p.date === s.date ? { ...p, collective: !p.collective } : p,
                        ),
                      )
                    }
                    className="size-3.5"
                  />
                  cuti bersama
                </label>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              size="sm"
              disabled={saveSuggestions.isPending || picked.size === 0}
              onClick={() => saveSuggestions.mutate()}
            >
              Simpan terpilih ({picked.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
