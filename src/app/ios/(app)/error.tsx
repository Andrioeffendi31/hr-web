"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/**
 * Batas galat PWA. Tanpa ini, satu galat render di layar mana pun jatuh ke
 * halaman bawaan Next ("This page couldn't load") yang berbahasa Inggris dan
 * tidak menawarkan jalan kembali ke Beranda.
 */
export default function IosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ios]", error);
  }, [error]);

  return (
    <div className="space-y-5 pt-16 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning-subtle text-warning">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-bold">Layar ini gagal dimuat</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Coba muat ulang. Jika masih gagal, kembali ke Beranda dan laporkan ke HR.
        </p>
        {error.digest ? <p className="font-mono text-xs text-muted-foreground">Kode: {error.digest}</p> : null}
      </div>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Coba lagi
        </button>
        <Link href="/ios" className="flex h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold">
          Ke Beranda
        </Link>
      </div>
    </div>
  );
}
