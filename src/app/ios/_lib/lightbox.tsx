"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pratinjau gambar layar penuh. Latar hitam, gambar utuh (object-contain),
 * tutup lewat tombol ×, ketuk di luar gambar, atau Escape. Muncul dengan fade
 * 150 ms — pembuka singkat, penutup tidak ditunda.
 */
export function Lightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/95 data-open:animate-in data-open:fade-in-0 data-open:duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-100" />
        <Dialog.Content
          className="fixed inset-0 z-[61] flex items-center justify-center outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.96] data-open:duration-150"
          onClick={() => onOpenChange(false)}
        >
          <Dialog.Title className="sr-only">{alt || "Pratinjau gambar"}</Dialog.Title>
          {/* eslint-disable-next-line @next/next/no-img-element -- dilayani /api/files dengan sesi */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-96px)] max-w-full object-contain"
          />
          {alt ? (
            <p className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+20px)] px-6 text-center text-sm text-white/80">
              {alt}
            </p>
          ) : null}
          <Dialog.Close
            aria-label="Tutup pratinjau"
            className="absolute top-[calc(env(safe-area-inset-top)+12px)] right-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <X className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Gambar yang bisa diketuk untuk dibuka layar penuh. */
export function ZoomImage({
  src,
  alt,
  className,
  imgClassName,
  style,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
  /** lapisan di atas gambar (label, dsb.) — tidak menangkap ketukan */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Perbesar ${alt}`}
        style={style}
        className={cn("relative block w-full overflow-hidden", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dilayani /api/files dengan sesi */}
        <img src={src} alt={alt} className={imgClassName} />
        {children}
      </button>
      <Lightbox src={src} alt={alt} open={open} onOpenChange={setOpen} />
    </>
  );
}
