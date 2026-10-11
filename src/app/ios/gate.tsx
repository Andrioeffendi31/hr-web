"use client";

import { useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
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
  children,
}: {
  kind: "ios" | "mac" | "other";
  bebas: boolean;
  children: React.ReactNode;
}) {
  const ipad = useSyncExternalStore(
    noop,
    () => navigator.maxTouchPoints > 1,
    () => true,
  );
  if (bebas || kind === "ios" || (kind === "mac" && ipad)) return children;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
          <Smartphone className="size-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold text-balance">
            NanumHR untuk iPhone
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            Alamat ini khusus untuk iPhone dan iPad. Buka di Safari pada perangkat
            iOS Anda, lalu pasang ke Home Screen.
          </p>
        </div>
        <a
          href={PLAY_STORE}
          className="inline-block text-sm font-medium text-primary underline underline-offset-4"
        >
          Pakai Android? Unduh NanumHR di Google Play
        </a>
      </div>
    </main>
  );
}
