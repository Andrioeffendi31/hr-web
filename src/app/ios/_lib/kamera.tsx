"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, SwitchCamera } from "lucide-react";

/**
 * Kamera selfie langsung di halaman — sengaja BUKAN `<input type="file">`.
 *
 * Atribut `capture` pada input file hanyalah petunjuk: Safari iOS tetap bisa
 * menawarkan "Perpustakaan Foto" dan "Pilih File", sehingga foto lama dari galeri
 * bisa dipakai untuk absen. getUserMedia hanya bisa menghasilkan bingkai dari
 * kamera yang sedang menyala, jadi tidak ada jalan masuk untuk file apa pun.
 *
 * Batasnya jujur: ini penjaga di sisi klien. Server tetap hanya menerima file;
 * yang ditutup di sini adalah jalur biasa, bukan klien yang dimodifikasi.
 */
export function KameraSelfie({
  foto,
  onFoto,
}: {
  /** URL pratinjau foto yang sudah diambil, atau null */
  foto: string | null;
  onFoto: (file: File) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [memulai, setMemulai] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // pasang stream ke <video>, dan selalu matikan kamera saat stream diganti atau
  // layar ditinggalkan — lampu kamera yang tetap menyala membuat orang curiga
  useEffect(() => {
    if (!stream) return;
    if (video.current) {
      video.current.srcObject = stream;
      void video.current.play().catch(() => {});
    }
    const mati = () => stream.getTracks().forEach((t) => t.stop());
    const onVis = () => document.visibilityState === "hidden" && mati();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      mati();
    };
  }, [stream]);

  async function nyalakan() {
    setGalat(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setGalat("Kamera tidak tersedia di browser ini. Buka NanumHR dari Layar Utama iPhone dengan iOS terbaru.");
      return;
    }
    setMemulai(true);
    try {
      setStream(
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        }),
      );
    } catch (e) {
      const nama = (e as DOMException).name;
      setGalat(
        nama === "NotAllowedError"
          ? "Izin kamera ditolak. Buka Pengaturan iPhone › NanumHR (atau Safari) › Kamera, lalu pilih Izinkan."
          : "Kamera tidak bisa dibuka. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.",
      );
    } finally {
      setMemulai(false);
    }
  }

  async function jepret() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const skala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * skala);
    c.height = Math.round(v.videoHeight * skala);
    // disimpan TIDAK dicerminkan: pratinjau di layar memang dibalik supaya terasa
    // seperti cermin, tapi bukti absen harus sama dengan wajah aslinya
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return;
    onFoto(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
    setStream(null);
  }

  const bingkai = "relative overflow-hidden rounded-2xl outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";

  if (stream) {
    return (
      <div className={`${bingkai} bg-black`}>
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full -scale-x-100 object-cover"
          aria-label="Pratinjau kamera depan"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/60 to-transparent pt-10 pb-5">
          <button
            type="button"
            onClick={jepret}
            aria-label="Ambil foto"
            className="flex size-[72px] items-center justify-center rounded-full border-4 border-white/90 transition-transform active:scale-95"
          >
            <span className="size-14 rounded-full bg-white" />
          </button>
        </div>
      </div>
    );
  }

  if (foto) {
    return (
      <div className={bingkai}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob lokal */}
        <img src={foto} alt="Foto selfie yang akan dikirim" className="aspect-[3/4] w-full object-cover" />
        <button
          type="button"
          onClick={nyalakan}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/65 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
        >
          {memulai ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          Ambil ulang
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={nyalakan}
        disabled={memulai}
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 text-muted-foreground"
      >
        {memulai ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <Camera className="size-7" aria-hidden />}
        <span className="text-sm font-medium">{memulai ? "Membuka kamera…" : "Buka kamera depan"}</span>
        <span className="text-xs">Foto diambil langsung, tidak dari galeri</span>
      </button>
      {galat ? (
        <p role="alert" className="flex gap-2 rounded-xl bg-danger-subtle px-3.5 py-2.5 text-sm text-danger">
          <SwitchCamera className="mt-0.5 size-4 shrink-0" aria-hidden />
          {galat}
        </p>
      ) : null}
    </div>
  );
}
