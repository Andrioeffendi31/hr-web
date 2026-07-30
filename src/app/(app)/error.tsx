"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Page-level failures. Database outages are detected in layout.tsx instead —
 *  a boundary cannot catch what its own sibling layout throws, and production
 *  redacts error.message before it reaches the client. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error(error), [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-lg font-semibold">Gagal memuat halaman</h1>
      <p className="text-muted-foreground mt-2 text-[13.5px] leading-relaxed">
        Terjadi kesalahan saat menyiapkan data halaman ini.
      </p>
      {error.digest && (
        <p className="text-subtle mt-2 font-mono text-[11.5px]">
          Kode kesalahan: {error.digest}
        </p>
      )}
      <Button onClick={reset} className="mt-5 h-9">
        Coba lagi
      </Button>
    </div>
  );
}
