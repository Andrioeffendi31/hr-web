"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Clock3,
  House,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "../../_lib/api";
import { formatJarak, menitDari, menitSekarangWib } from "../../_lib/format";
import { ambilLokasi, jarakMeter, terdekat, type Fix } from "../../_lib/geo";
import { useMe } from "../../_lib/hooks";
import { kecilkan } from "../../_lib/image";
import { Card, ErrorNote, Skeleton } from "../../_lib/ui";

export default function AbsenPage() {
  const { data: me, isPending, error, refetch } = useMe();
  const router = useRouter();
  const qc = useQueryClient();

  const [fix, setFix] = useState<Fix | null>(null);
  const [lokasiErr, setLokasiErr] = useState<string | null>(null);
  const [mencari, setMencari] = useState(true);
  const [officeId, setOfficeId] = useState<number | null>(null);
  const [wfh, setWfh] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [paksa, setPaksa] = useState<"late" | "early" | "away" | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [kirim, setKirim] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);

  const cari = useCallback(async () => {
    setMencari(true);
    setLokasiErr(null);
    try {
      setFix(await ambilLokasi());
    } catch (e) {
      setLokasiErr((e as Error).message);
    } finally {
      setMencari(false);
    }
  }, []);

  // pencarian pertama: state diisi dari callback, bukan langsung di badan efek
  useEffect(() => {
    ambilLokasi()
      .then(setFix)
      .catch((e: Error) => setLokasiErr(e.message))
      .finally(() => setMencari(false));
  }, []);

  useEffect(() => () => void (pratinjau && URL.revokeObjectURL(pratinjau)), [pratinjau]);

  const aksi = me?.today.clockIn ? "out" : "in";

  // Titik absen: saat masuk, yang terdekat (bisa diganti); saat keluar, yang
  // dipilih waktu masuk — server mengabaikan pilihan lain.
  const office = useMemo(() => {
    if (!me) return null;
    if (aksi === "out") return me.offices.find((o) => o.id === me.today.officeId) ?? null;
    if (officeId) return me.offices.find((o) => o.id === officeId) ?? null;
    if (fix && me.offices.length) return terdekat(me.offices, fix).office;
    return me.offices.find((o) => o.id === me.defaultOfficeId) ?? me.offices[0] ?? null;
  }, [me, aksi, officeId, fix]);

  if (isPending) return <Skeleton className="h-96" />;
  if (error || !me) return <ErrorNote message={error?.message ?? "Gagal memuat"} onRetry={() => refetch()} />;

  if (me.today.clockOut) {
    return (
      <div className="space-y-4 pt-6 text-center">
        <p className="text-lg font-semibold">Absensi hari ini sudah lengkap.</p>
        <Link href="/ios" className="text-sm font-semibold text-primary underline underline-offset-4">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const hariWfh = aksi === "out" && !me.today.officeId;
  const meter = fix && office ? jarakMeter(fix.lat, fix.lng, office.lat, office.lng) : null;
  const diLuar = !hariWfh && !wfh && meter !== null && office !== null && meter > office.radiusM;

  // Perkiraan aturan server (api/me/clock) supaya kolom alasan sudah tampil
  // sebelum menekan tombol. Server tetap yang memutuskan; `paksa` menangkap
  // kasus yang tidak terduga di sini.
  const sekarang = menitSekarangWib();
  const perluAlasan =
    paksa ??
    (aksi === "in" && !wfh && sekarang > menitDari(me.shift.start) + me.shift.toleranceMinutes
      ? "late"
      : aksi === "out" && sekarang < menitDari(me.shift.end)
        ? "early"
        : aksi === "out" && diLuar
          ? "away"
          : null);

  const labelAlasan = {
    late: { label: "Alasan terlambat", contoh: "Contoh: Ban motor bocor di perjalanan" },
    early: { label: "Alasan pulang lebih awal", contoh: "Contoh: Ada urusan keluarga yang mendesak" },
    away: { label: "Alasan absen keluar di luar kantor", contoh: "Contoh: Kunjungan ke klien di Tangerang" },
  } as const;

  const blokirMasuk = aksi === "in" && diLuar;
  const siap =
    !!fix &&
    !!foto &&
    !blokirMasuk &&
    (aksi === "out" || wfh || !!office) &&
    (!perluAlasan || alasan.trim().length >= 5);

  const petunjuk = !fix
    ? "Tunggu lokasi ditemukan"
    : blokirMasuk
      ? "Anda di luar radius kantor. Tandai WFH jika bekerja dari rumah."
      : !foto
        ? "Ambil foto selfie untuk melanjutkan"
        : perluAlasan && alasan.trim().length < 5
          ? "Isi alasan minimal 5 karakter"
          : null;

  async function submit() {
    if (!fix || !foto) return;
    setKirim(true);
    setServerErr(null);
    const form = new FormData();
    form.set("action", aksi);
    form.set("lat", String(fix.lat));
    form.set("lng", String(fix.lng));
    if (aksi === "in") {
      form.set("wfh", wfh ? "1" : "0");
      if (!wfh && office) form.set("locationId", String(office.id));
    }
    if (perluAlasan === "late") form.set("lateReason", alasan.trim());
    if (perluAlasan === "early") form.set("earlyReason", alasan.trim());
    if (perluAlasan === "away") form.set("awayReason", alasan.trim());
    form.set("selfie", foto);

    try {
      const res = await fetch("/api/me/clock", { method: "POST", body: form, credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ApiError(data.error ?? "Absen gagal", res.status);
      toast.success(aksi === "in" ? "Absen masuk tercatat." : "Absen keluar tercatat. Sampai jumpa!");
      await qc.invalidateQueries({ queryKey: ["ios"] });
      router.replace("/ios");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Tidak dapat terhubung ke server. Periksa koneksi.";
      if (/keterlambatan/i.test(msg)) setPaksa("late");
      else if (/pulang cepat/i.test(msg)) setPaksa("early");
      else if (/di luar kantor/i.test(msg)) setPaksa("away");
      setServerErr(msg);
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="-ml-2 flex items-center gap-1">
        <Link href="/ios" aria-label="Kembali" className="flex size-11 items-center justify-center rounded-xl">
          <ArrowLeft className="size-[22px]" />
        </Link>
        <h1 className="text-[17px] font-semibold">{aksi === "in" ? "Absen masuk" : "Absen keluar"}</h1>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Clock3 className="size-4" aria-hidden />
        Shift {me.shift.start}–{me.shift.end}
      </p>

      {/* Lokasi */}
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              !fix ? "bg-muted text-muted-foreground" : diLuar ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success",
            )}
          >
            {mencari ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : diLuar ? (
              <MapPinOff className="size-5" aria-hidden />
            ) : (
              <MapPin className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[15px] font-semibold", diLuar && "text-warning")}>
              {mencari && !fix
                ? "Mencari lokasi…"
                : !fix
                  ? "Lokasi belum ditemukan"
                  : hariWfh || wfh
                    ? "Bekerja dari rumah (WFH)"
                    : diLuar
                      ? "Di luar radius kantor"
                      : "Di dalam area kantor"}
            </p>
            {fix && office && !hariWfh && !wfh ? (
              <p className="text-sm text-muted-foreground">
                {formatJarak(meter!)} dari {office.name} · radius {office.radiusM} m
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={cari}
            disabled={mencari}
            aria-label="Perbarui lokasi"
            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-5", mencari && "animate-spin")} />
          </button>
        </div>

        {lokasiErr ? <p className="rounded-xl bg-danger-subtle px-3.5 py-2.5 text-sm text-danger">{lokasiErr}</p> : null}

        {aksi === "in" && !wfh && me.offices.length > 1 ? (
          <label className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <LocateFixed className="size-4" aria-hidden />
              Titik absen
            </span>
            <select
              value={office?.id ?? ""}
              onChange={(e) => setOfficeId(Number(e.target.value))}
              className="max-w-[60%] rounded-lg bg-transparent text-right text-base font-semibold"
            >
              {me.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : office && !hariWfh && !wfh ? (
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <LocateFixed className="size-4" aria-hidden />
              Titik absen
            </span>
            <span className="font-semibold">{office.name}</span>
          </div>
        ) : null}
      </Card>

      {/* WFH — hanya saat masuk; saat keluar server memakai pilihan pagi tadi */}
      {aksi === "in" ? (
        <Card className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <House className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Tandai sebagai WFH</p>
            <p className="text-xs text-muted-foreground text-pretty">
              {diLuar || wfh ? "Wajib aktif jika Anda di luar radius kantor" : "Aktifkan jika bekerja dari rumah hari ini"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={wfh}
            aria-label="Tandai sebagai WFH"
            onClick={() => setWfh((v) => !v)}
            className={cn(
              "relative h-8 w-[52px] shrink-0 rounded-full transition-colors",
              wfh ? "bg-primary" : "bg-muted ring-1 ring-border ring-inset",
            )}
          >
            <span
              className={cn(
                "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform",
                wfh && "translate-x-5",
              )}
            />
          </button>
        </Card>
      ) : null}

      {/* Alasan */}
      {perluAlasan ? (
        <Card className="space-y-2">
          <label htmlFor="alasan" className="flex gap-1 text-sm font-semibold">
            {labelAlasan[perluAlasan].label}
            <span className="font-normal text-muted-foreground">(wajib)</span>
          </label>
          <textarea
            id="alasan"
            rows={3}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder={labelAlasan[perluAlasan].contoh}
            className="w-full resize-none rounded-xl border border-input bg-muted/40 px-3.5 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <p className="text-xs text-muted-foreground">Admin akan meninjau alasan ini.</p>
        </Card>
      ) : null}

      {/* Selfie */}
      <Card className="space-y-3">
        <p className="text-sm font-semibold">Foto selfie</p>
        <input
          ref={kamera}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const kecil = await kecilkan(f, 1280, "selfie.jpg");
            setFoto(kecil);
            setPratinjau(URL.createObjectURL(kecil));
          }}
        />
        {pratinjau ? (
          <div className="relative overflow-hidden rounded-2xl outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob lokal */}
            <img src={pratinjau} alt="Pratinjau selfie" className="aspect-[3/4] w-full object-cover" />
            <button
              type="button"
              onClick={() => kamera.current?.click()}
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/65 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
            >
              <RefreshCw className="size-4" aria-hidden />
              Ambil ulang
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => kamera.current?.click()}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 text-muted-foreground"
          >
            <Camera className="size-7" aria-hidden />
            <span className="text-sm font-medium">Buka kamera depan</span>
          </button>
        )}
      </Card>

      {serverErr ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-3.5 py-3 text-sm text-danger">
          {serverErr}
        </p>
      ) : null}

      <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={submit}
          disabled={!siap || kirim}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground"
        >
          {kirim ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {kirim ? "Mengirim…" : aksi === "in" ? "Konfirmasi absen masuk" : "Konfirmasi absen keluar"}
        </button>
        {petunjuk && !kirim ? <p className="text-center text-xs text-muted-foreground">{petunjuk}</p> : null}
      </div>
    </div>
  );
}
