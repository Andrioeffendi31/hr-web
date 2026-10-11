"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, Bookmark, House, Settings, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sedangBekerja, useMe } from "../_lib/hooks";
import { kirimLokasi, pingJatuhTempo } from "../_lib/ping";
import { daftarkanSW, sinkronkanLangganan } from "../_lib/push";

const TABS = [
  { href: "/ios/kehadiran", label: "Kehadiran", icon: CalendarCheck2 },
  { href: "/ios/pengajuan", label: "Pengajuan", icon: Bookmark },
  { href: "/ios", label: "Beranda", icon: House },
  { href: "/ios/pengaturan", label: "Pengaturan", icon: Settings },
] as const;

const noop = () => () => {};
const LEWATI_KEY = "nanumhr.ios.lewati-pasang";

/** Dibuka dari Home Screen? Hanya di mode ini iOS memberi Web Push. */
function useStandalone() {
  return useSyncExternalStore(
    noop,
    () =>
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches,
    () => true,
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const standalone = useStandalone();
  const lewati = useSyncExternalStore(
    (cb) => {
      window.addEventListener(LEWATI_KEY, cb);
      return () => window.removeEventListener(LEWATI_KEY, cb);
    },
    () => sessionStorage.getItem(LEWATI_KEY) === "1",
    () => false,
  );
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const pingBerjalan = useRef(false);

  // service worker + langganan push yang sudah diizinkan, tiap aplikasi dibuka
  useEffect(() => {
    void daftarkanSW()
      .then(() => sinkronkanLangganan())
      .catch(() => {});
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "navigate" && typeof e.data.url === "string") {
        const u = new URL(e.data.url);
        // pengingat lokasi butuh efek ping di bawah berjalan lagi; muat ulang
        // penuh adalah cara paling pasti di aplikasi yang sudah terbuka
        if (u.searchParams.has("ping")) window.location.assign(u.pathname + u.search);
        else router.push(u.pathname + u.search);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [router]);

  /**
   * Ping lokasi saat aplikasi terbuka. Dua pemicu:
   *  - `?ping=1` — pengingat push 2-jaman diketuk: kirim dan beri tahu hasilnya;
   *  - aplikasi kembali ke layar dan ping terakhir sudah ≥ 90 menit: kirim diam-diam.
   */
  useEffect(() => {
    if (!me) return;
    const coba = async (diminta: boolean) => {
      if (pingBerjalan.current) return;
      if (!sedangBekerja(me)) {
        if (diminta) toast("Lokasi tidak perlu dikirim: Anda belum absen masuk atau sudah absen keluar.");
        return;
      }
      if (!diminta && !pingJatuhTempo()) return;
      pingBerjalan.current = true;
      const id = diminta ? toast.loading("Mengirim lokasi…") : undefined;
      const hasil = await kirimLokasi();
      pingBerjalan.current = false;
      qc.invalidateQueries({ queryKey: ["ios"] });
      if (!diminta && hasil.kind !== "gagal") return;
      if (hasil.kind === "ok")
        toast.success(
          hasil.outside ? "Lokasi terkirim. Anda tercatat di luar area kantor." : "Lokasi terkirim. Terima kasih.",
          { id },
        );
      else if (hasil.kind === "sudah") toast.success("Lokasi Anda sudah tercatat baru-baru ini.", { id });
      else toast.error(hasil.message, { id });
    };

    const url = new URL(window.location.href);
    if (url.searchParams.get("ping") === "1") {
      url.searchParams.delete("ping");
      window.history.replaceState(null, "", url.pathname + url.search);
      void coba(true);
    } else {
      void coba(false);
    }
    const onVis = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: ["ios", "me"] });
        void coba(false);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [me, qc]);

  if (!standalone && !lewati) {
    return (
      <PanduanPasang
        onLewati={() => {
          sessionStorage.setItem(LEWATI_KEY, "1");
          window.dispatchEvent(new Event(LEWATI_KEY));
        }}
      />
    );
  }

  const tanpaTab = pathname.startsWith("/ios/absen");

  return (
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      <main className={cn("mx-auto max-w-md px-5 pt-4", tanpaTab ? "pb-8" : "pb-32")}>
        {me?.profile.mustChangePassword ? <GantiSandi /> : children}
      </main>
      {tanpaTab ? null : (
        <nav
          aria-label="Navigasi utama"
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)]"
        >
          <ul className="mx-auto flex h-16 max-w-md items-stretch gap-1 rounded-full border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-xl">
            {TABS.map(({ href, label, icon: Icon }) => {
              const aktif = href === "/ios" ? pathname === "/ios" : pathname.startsWith(href);
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors",
                      aktif ? "bg-primary-subtle font-semibold text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-[22px]" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

function GantiSandi() {
  return (
    <div className="space-y-4 pt-10 text-center">
      <h1 className="font-heading text-2xl font-bold">Buat kata sandi baru dulu</h1>
      <p className="text-[15px] text-muted-foreground text-pretty">
        Akun Anda masih memakai kata sandi awal dari HR. Ganti dulu supaya bisa absen dan
        mengajukan cuti.
      </p>
      <a
        href="/ganti-sandi"
        className="inline-flex h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
      >
        Ganti kata sandi
      </a>
    </div>
  );
}

/**
 * Ditampilkan saat /ios dibuka di tab Safari biasa. Push notification, dan
 * karena itu pengingat lokasi, hanya bekerja sesudah aplikasinya dipasang.
 */
function PanduanPasang({ onLewati }: { onLewati: () => void }) {
  const langkah = [
    { icon: Share, teks: "Ketuk tombol Bagikan di bilah bawah Safari." },
    { icon: SquarePlus, teks: "Pilih “Tambahkan ke Layar Utama”, lalu ketuk Tambah." },
    { icon: House, teks: "Buka NanumHR dari ikonnya di Layar Utama, lalu masuk lagi." },
  ];
  return (
    <main className="min-h-dvh bg-background px-5 pt-[calc(env(safe-area-inset-top)+40px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="mx-auto max-w-md space-y-8">
        <div className="space-y-2">
          <h1 className="font-heading text-[28px] leading-tight font-bold tracking-tight text-balance">
            Pasang NanumHR di iPhone Anda
          </h1>
          <p className="text-[15px] text-muted-foreground text-pretty">
            Notifikasi dan pengingat lokasi hanya berjalan jika NanumHR dibuka dari Layar Utama,
            bukan dari Safari.
          </p>
        </div>
        <ol className="space-y-3">
          {langkah.map(({ icon: Icon, teks }, i) => (
            <li key={i} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-[15px]">
                <span className="font-semibold">{i + 1}. </span>
                {teks}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">Butuh iOS 16.4 atau yang lebih baru.</p>
        <button
          type="button"
          onClick={onLewati}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Lanjutkan di Safari tanpa notifikasi
        </button>
      </div>
    </main>
  );
}
