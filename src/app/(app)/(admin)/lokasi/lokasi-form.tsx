"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Crosshair, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Peta } from "@/components/peta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

type Location = {
  id: number;
  name: string;
  lat: string;
  lng: string;
  radiusM: number;
  active: boolean;
};

type Hit = { nama: string; lat: number; lng: number };

/**
 * Nominatim (OpenStreetMap) — same reason as the tiles: no key, no billing. Its
 * usage policy caps this at one request per keystroke-burst, so the search only
 * fires on submit, never on every character.
 */
async function cariAlamat(q: string): Promise<Hit[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Pencarian lokasi gagal");
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((d) => ({
    nama: d.display_name,
    lat: Number(d.lat),
    lng: Number(d.lon),
  }));
}

async function send(method: string, body: unknown) {
  const res = await fetch("/api/locations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Permintaan gagal");
  return data;
}

export function LokasiDialog({ initial }: { initial?: Location }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // The coordinate lives in state now because two controls write it — the map and
  // the number fields — and each has to show what the other did.
  const blank = {
    lat: initial?.lat ?? "",
    lng: initial?.lng ?? "",
    radiusM: String(initial?.radiusM ?? 150),
  };
  const [f, setF] = useState(blank);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  // A half-typed or swapped coordinate is normal while editing, so the map only
  // gets one it can actually plot — latitude beyond ±90 makes MapLibre throw.
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  const titik =
    f.lat !== "" && f.lng !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  const radiusM = Math.min(5000, Math.max(25, Number(f.radiusM) || 150));

  /**
   * The value has to be read here, not inside the updater: React runs a lazy
   * `setState(fn)` during the *next* render, by which point it has nulled the
   * synthetic event's `currentTarget` — reading it there threw on every keystroke
   * and took the page down with the error boundary.
   */
  const ubah =
    (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setF((s) => ({ ...s, [k]: v }));
    };

  const pakai = (lat: number, lng: number) => {
    setF((s) => ({ ...s, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
    setHits([]);
  };

  const cari = useMutation({
    mutationFn: cariAlamat,
    onSuccess: (h) => {
      setHits(h);
      if (!h.length) toast.error("Lokasi tidak ditemukan");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => send("POST", body),
    onSuccess: (_d, v) => {
      setOpen(false);
      toast.success(`Lokasi ${v.name} disimpan`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // the dialog used to forget an abandoned edit because its inputs
        // unmounted; state has to be told
        if (!o) {
          setF(blank);
          setQ("");
          setHits([]);
        }
      }}
    >
      <DialogTrigger asChild>
        {initial ? (
          <button
            aria-label={`Ubah ${initial.name}`}
            className="text-subtle hover:text-foreground hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : (
          <Button size="sm">
            <Plus className="size-3.5" aria-hidden />
            Tambah lokasi
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {initial ? `Ubah ${initial.name}` : "Lokasi absen baru"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Cari alamatnya, pakai lokasi perangkat, atau ketuk peta — lalu atur
            radiusnya. Koordinat bisa juga diketik manual.
          </DialogDescription>
        </DialogHeader>

        <form
          id="lokasi-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            save.mutate({
              ...(initial ? { id: initial.id } : null),
              name: String(f.get("name")).trim(),
              lat: String(f.get("lat")),
              lng: String(f.get("lng")),
              radiusM: String(f.get("radiusM")),
              active: f.get("active") === "on",
            });
          }}
        >
          <label className="text-[12px] font-medium">
            Nama lokasi
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Kantor Pusat"
              defaultValue={initial?.name ?? ""}
              className={FIELD}
            />
          </label>

          <div className="relative">
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                // Enter inside a form submits it; here it means "search"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (q.trim().length > 2) cari.mutate(q.trim());
                }}
                placeholder="Cari alamat atau nama tempat…"
                className={`${FIELD} mt-0`}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 shrink-0"
                disabled={cari.isPending || q.trim().length < 3}
                onClick={() => cari.mutate(q.trim())}
              >
                <Search className="size-3.5" aria-hidden />
                {cari.isPending ? "Mencari…" : "Cari"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 shrink-0"
                title="Pakai lokasi saya sekarang"
                onClick={() =>
                  navigator.geolocation.getCurrentPosition(
                    (p) => pakai(p.coords.latitude, p.coords.longitude),
                    // denied permission is the common case and the browser gives
                    // no second chance, so say what to do about it
                    (e) =>
                      toast.error(
                        e.code === e.PERMISSION_DENIED
                          ? "Izin lokasi ditolak — aktifkan di pengaturan browser."
                          : "Tidak bisa membaca lokasi perangkat.",
                      ),
                    { enableHighAccuracy: true, timeout: 10_000 },
                  )
                }
              >
                <Crosshair className="size-3.5" aria-hidden />
                <span className="sr-only">Lokasi saya</span>
              </Button>
            </div>
            {hits.length > 0 && (
              <ul className="bg-card absolute inset-x-0 top-10 z-20 max-h-44 overflow-auto rounded-[9px] border shadow-lg">
                {hits.map((h) => (
                  <li key={`${h.lat},${h.lng}`}>
                    <button
                      type="button"
                      onClick={() => pakai(h.lat, h.lng)}
                      className="hover:bg-accent block w-full px-2.5 py-2 text-left text-[12px] leading-snug"
                    >
                      {h.nama}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="h-[220px] overflow-hidden rounded-[11px] border">
            <Peta
              points={titik ? [{ ...titik, tone: "kantor" }] : []}
              circles={titik ? [{ ...titik, radiusM }] : []}
              onPick={pakai}
            />
          </div>
          {!titik && (
            <p className="text-subtle -mt-1 text-[11px]">
              {f.lat === "" && f.lng === ""
                ? "Belum ada titik — cari alamat atau ketuk peta untuk menandai kantor."
                : "Koordinat di luar jangkauan (lat −90…90, lng −180…180), jadi belum bisa ditampilkan."}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] font-medium">
              Latitude
              <input
                name="lat"
                type="number"
                step="0.000001"
                min={-90}
                max={90}
                required
                value={f.lat}
                onChange={ubah("lat")}
                className={FIELD}
              />
            </label>
            <label className="text-[12px] font-medium">
              Longitude
              <input
                name="lng"
                type="number"
                step="0.000001"
                min={-180}
                max={180}
                required
                value={f.lng}
                onChange={ubah("lng")}
                className={FIELD}
              />
            </label>
          </div>

          <label className="text-[12px] font-medium">
            Radius geofence (meter)
            <input
              name="radiusM"
              type="number"
              min={25}
              max={5000}
              required
              value={f.radiusM}
              onChange={ubah("radiusM")}
              className={FIELD}
            />
            <span className="text-subtle mt-1 block text-[11px] font-normal">
              Terlalu kecil dan pergeseran GPS biasa akan menolak absen yang sah.
              Lingkaran di peta adalah radius sebenarnya.
            </span>
          </label>

          <label className="flex items-center gap-2 text-[12.5px]">
            <input
              name="active"
              type="checkbox"
              defaultChecked={initial?.active ?? true}
              className="size-4"
            />
            Aktif — muncul sebagai pilihan di aplikasi karyawan
          </label>
        </form>

        <DialogFooter>
          <Button type="submit" form="lokasi-form" size="sm" disabled={save.isPending}>
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteLokasi({
  id,
  name,
  punches,
}: {
  id: number;
  name: string;
  punches: number;
}) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => send("DELETE", { id }),
    onSuccess: () => {
      toast.success(`Lokasi ${name} dihapus`);
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
      title={`Hapus lokasi ${name}?`}
      // deletion is refused server-side once there is history — the point of the
      // location is to explain why a punch counted, and that has to keep resolving
      description={
        punches > 0
          ? `Sudah ada ${punches} absensi di lokasi ini, jadi tidak bisa dihapus. Nonaktifkan lewat tombol ubah supaya hilang dari pilihan karyawan tapi riwayatnya tetap utuh.`
          : "Lokasi ini belum pernah dipakai absen, jadi aman dihapus."
      }
      confirmLabel="Hapus"
      destructive
      onConfirm={() => m.mutate()}
    />
  );
}
