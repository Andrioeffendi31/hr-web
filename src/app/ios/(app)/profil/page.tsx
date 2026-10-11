"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, postForm, postJson } from "../../_lib/api";
import { tanggalPanjang } from "../../_lib/format";
import { useMe } from "../../_lib/hooks";
import { kecilkan } from "../../_lib/image";
import { Avatar, BackHeader, Card, ErrorNote, FIELD, Skeleton } from "../../_lib/ui";

export default function ProfilPage() {
  const { data: me, isPending, error, refetch } = useMe();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [unggah, setUnggah] = useState(false);

  if (isPending) return <Skeleton className="h-96" />;
  if (error || !me) return <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />;
  const p = me.profile;

  async function gantiFoto(file: File) {
    setUnggah(true);
    try {
      const form = new FormData();
      form.set("photo", await kecilkan(file, 800, "profil.jpg"));
      await postForm("/api/me/photo", form);
      await qc.invalidateQueries({ queryKey: ["ios"] });
      toast.success("Foto profil diperbarui.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Foto gagal diunggah.");
    } finally {
      setUnggah(false);
    }
  }

  // Data kepegawaian diisi HR; karyawan hanya boleh mengubah kontak pribadinya
  // (lihat api/me/profile), jadi bagian ini sengaja hanya-baca.
  const kepegawaian: [string, string | null][] = [
    ["NIK", p.nik],
    ["Jabatan", p.position || null],
    ["Divisi", p.division || null],
    ["Status kerja", p.contractType],
    ["Bergabung", p.joinedAt ? tanggalPanjang(p.joinedAt.slice(0, 10)) : null],
    ["Lokasi kerja", p.workLocation || null],
    ["Email", p.email],
  ];
  const pribadi: [string, string | null][] = [
    ["Tempat, tanggal lahir", [p.birthPlace, p.birthDate ? tanggalPanjang(p.birthDate.slice(0, 10)) : null].filter(Boolean).join(", ") || null],
    ["Jenis kelamin", p.gender],
    ["Agama", p.religion],
  ];

  return (
    <div className="space-y-6">
      <BackHeader href="/ios/pengaturan" title="Profil saya" />

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <Avatar photoKey={p.photoKey} initials={p.initials} name={p.name} size={96} zoom />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={unggah}
            aria-label="Ganti foto profil"
            className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground"
          >
            {unggah ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void gantiFoto(f);
            }}
          />
        </div>
        <div>
          <p className="font-heading text-xl font-bold">{p.name}</p>
          <p className="text-sm text-muted-foreground">{p.position || "Karyawan"}</p>
        </div>
      </div>

      <Daftar judul="Kepegawaian" baris={kepegawaian} catatan="Diatur oleh HR. Hubungi HR jika ada yang keliru." />
      <Daftar judul="Data pribadi" baris={pribadi} />
      <FormKontak
        awal={{
          phone: p.phone ?? "",
          address: p.address ?? "",
          emergencyName: p.emergencyName ?? "",
          emergencyPhone: p.emergencyPhone ?? "",
        }}
      />
    </div>
  );
}

function Daftar({ judul, baris, catatan }: { judul: string; baris: [string, string | null][]; catatan?: string }) {
  return (
    <section className="space-y-2.5">
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">{judul}</h2>
      <Card className="divide-y divide-border p-0">
        {baris.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-4 py-3">
            <span className="shrink-0 text-sm text-muted-foreground">{k}</span>
            <span className="min-w-0 text-right text-sm font-medium break-words">{v ?? "—"}</span>
          </div>
        ))}
      </Card>
      {catatan ? <p className="px-1 text-xs text-muted-foreground">{catatan}</p> : null}
    </section>
  );
}

type Kontak = { phone: string; address: string; emergencyName: string; emergencyPhone: string };

function FormKontak({ awal }: { awal: Kontak }) {
  const qc = useQueryClient();
  const [v, setV] = useState(awal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const berubah = (Object.keys(v) as (keyof Kontak)[]).some((k) => v[k] !== awal[k]);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await postJson("/api/me/profile", v, "PATCH");
      await qc.invalidateQueries({ queryKey: ["ios", "me"] });
      toast.success("Kontak tersimpan.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  const field = FIELD;
  const set = (k: keyof Kontak) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section className="space-y-2.5">
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Kontak</h2>
      <Card>
        <form onSubmit={simpan} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nomor telepon</span>
            <input type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} placeholder="08123456789" className={field} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Alamat</span>
            <textarea
              rows={3}
              value={v.address}
              onChange={set("address")}
              className="w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Kontak darurat</span>
            <input value={v.emergencyName} onChange={set("emergencyName")} placeholder="Nama dan hubungan, mis. Siti (istri)" className={field} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Telepon kontak darurat</span>
            <input type="tel" inputMode="tel" value={v.emergencyPhone} onChange={set("emergencyPhone")} placeholder="08123456789" className={field} />
          </label>
          {err ? <p role="alert" className="rounded-xl bg-danger-subtle px-3.5 py-2.5 text-sm text-danger">{err}</p> : null}
          <button
            type="submit"
            disabled={!berubah || busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {busy ? "Menyimpan…" : "Simpan kontak"}
          </button>
        </form>
      </Card>
    </section>
  );
}
