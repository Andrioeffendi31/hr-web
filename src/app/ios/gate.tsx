"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import qrcode from "qrcode-generator";
import { Check, Copy, House, Share, SquarePlus } from "lucide-react";
import { PLAY_STORE } from "./_lib/shared";

const noop = () => () => {};

/**
 * Hanya iPhone/iPad yang boleh masuk. `kind` dihitung server dari user-agent;
 * "mac" bisa berarti iPad (iPadOS mengaku Mac) sehingga titik sentuh yang
 * memutuskan. Di mode development semua perangkat diizinkan supaya PWA bisa
 * dikerjakan dari laptop — begitu juga selama saklar PWA_KUNCI_IOS mati.
 */
export function IosGate({
  kind,
  bebas,
  perusahaan,
  children,
}: {
  kind: "ios" | "mac" | "other";
  bebas: boolean;
  perusahaan: string;
  children: React.ReactNode;
}) {
  const ipad = useSyncExternalStore(
    noop,
    () => navigator.maxTouchPoints > 1,
    () => true,
  );
  if (bebas || kind === "ios" || (kind === "mac" && ipad)) return children;
  return <HalamanKhususIphone perusahaan={perusahaan} />;
}

/**
 * Halaman untuk pengunjung yang bukan iPhone/iPad — hampir selalu orang di
 * laptop (Android sudah dialihkan ke Google Play oleh server). Karena itu
 * tindakan utamanya kode QR: dipindai kamera iPhone, alamatnya langsung terbuka
 * di Safari tanpa perlu diketik.
 */
function HalamanKhususIphone({ perusahaan }: { perusahaan: string }) {
  const alamat = useSyncExternalStore(
    noop,
    () => `${window.location.origin}/ios`,
    () => "",
  );
  const [disalin, setDisalin] = useState(false);

  const qrSvg = useMemo(() => {
    if (!alamat) return "";
    const qr = qrcode(0, "M");
    qr.addData(alamat);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [alamat]);

  const langkah = [
    { icon: Share, teks: "Buka alamat ini di Safari, lalu ketuk Bagikan" },
    { icon: SquarePlus, teks: "Pilih “Tambahkan ke Layar Utama”" },
    { icon: House, teks: "Buka NanumHR dari Layar Utama dan masuk" },
  ];

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-12 sm:py-16">
        <div className="grid items-center gap-10 rounded-[32px] border border-border bg-card p-6 text-center sm:p-10 md:grid-cols-[1fr_auto] md:gap-14 md:text-left">
          {/* Kiri: identitas, penjelasan, langkah */}
          <div className="space-y-8">
            <div className="flex flex-col items-center gap-3 md:flex-row md:gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- ikon aplikasi statis */}
              <img
                src="/ios/icon-192.png"
                alt="NanumHR"
                width={56}
                height={56}
                className="size-14 rounded-[16px] outline-1 -outline-offset-1 outline-black/10"
              />
              <div>
                <p className="font-heading text-lg leading-tight font-semibold">NanumHR</p>
                <p className="text-sm text-muted-foreground">{perusahaan}</p>
              </div>
            </div>

            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary">
                Khusus iPhone &amp; iPad
              </span>
              <h1 className="font-heading text-[32px] leading-[1.1] font-bold tracking-tight text-balance sm:text-[40px]">
                Buka NanumHR di iPhone Anda
              </h1>
              <p className="mx-auto max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base md:mx-0">
                Versi web NanumHR untuk karyawan berjalan di iPhone dan iPad, supaya absen dengan selfie,
                notifikasi, dan pengingat lokasi bekerja dengan benar.
              </p>
            </div>

            <ol className="mx-auto w-fit space-y-3 text-left md:mx-0">
              {langkah.map(({ icon: Icon, teks }, i) => (
                <li key={teks} className="flex items-center gap-3.5">
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Icon className="size-[18px]" aria-hidden />
                    <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground tabular-nums">
                      {i + 1}
                    </span>
                  </span>
                  <span className="text-[15px]">{teks}</span>
                </li>
              ))}
            </ol>

            <div className="h-px bg-border" />

            {/* Android */}
            <div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
              <a
                href={PLAY_STORE}
                className="inline-flex h-14 shrink-0 items-center gap-3 rounded-xl bg-black px-4 whitespace-nowrap text-white transition-transform duration-150 ease-out active:scale-[0.96]"
                aria-label="Unduh NanumHR di Google Play"
              >
                <LogoGooglePlay className="size-7" />
                <span className="flex flex-col text-left leading-none">
                  <span className="text-[10px] font-medium tracking-wide uppercase">Tersedia di</span>
                  <span className="pt-1 text-lg font-semibold tracking-tight">Google Play</span>
                </span>
              </a>
              <p className="text-sm text-muted-foreground text-pretty">
                Pakai Android? Pasang aplikasi NanumHR dari Google Play.
              </p>
            </div>
          </div>

          {/* Kanan: QR untuk dipindai iPhone */}
          <div className="mx-auto w-full max-w-[280px] space-y-4 text-center">
            <div className="rounded-3xl border border-border bg-white p-5">
              {qrSvg ? (
                <div
                  role="img"
                  aria-label={`Kode QR menuju ${alamat}`}
                  className="aspect-square w-full text-black [&_svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold">Pindai dengan kamera iPhone</p>
              <p className="text-sm text-muted-foreground">Alamatnya langsung terbuka di Safari.</p>
            </div>
            <button
              type="button"
              disabled={!alamat}
              onClick={async () => {
                await navigator.clipboard?.writeText(alamat).catch(() => {});
                setDisalin(true);
                window.setTimeout(() => setDisalin(false), 2000);
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium transition-[background-color] duration-150 hover:bg-muted"
            >
              {disalin ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : (
                <Copy className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{disalin ? "Tautan disalin" : alamat.replace(/^https?:\/\//, "") || "Memuat…"}</span>
            </button>
          </div>
        </div>
      </div>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {perusahaan}
      </footer>
    </main>
  );
}

/** Logo Google Play empat warna (segitiga "play"). */
function LogoGooglePlay({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#00D7FE" d="M3.61 1.81 13.79 12 3.61 22.19a1.4 1.4 0 0 1-.61-1.2V3.01c0-.5.23-.94.61-1.2Z" />
      <path fill="#FFCE00" d="m17.15 15.36-3.36-3.36 3.36-3.36 3.97 2.26c1.17.67 1.17 1.53 0 2.2l-3.97 2.26Z" />
      <path fill="#FF3A44" d="M17.15 15.36 13.79 12 3.61 22.19c.42.43 1.07.48 1.82.06l11.72-6.89Z" />
      <path fill="#00F076" d="M17.15 8.64 5.43 1.75c-.75-.42-1.4-.37-1.82.06L13.79 12l3.36-3.36Z" />
    </svg>
  );
}
