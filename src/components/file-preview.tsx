"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { previewKind } from "@/lib/hr";

/**
 * Renders an image or a PDF in place, so checking a contract does not mean
 * downloading it first. PDFs use the browser's own viewer in an <iframe> —
 * pdf.js would be ~1 MB of JS for something every browser already ships.
 *
 * That viewer can be blocked (kiosk mode, extensions, a future X-Frame-Options
 * on the object host), so "Buka di tab baru" is always offered: a preview that
 * fails must not become a dead end.
 *
 * Callers must not render this for a type previewKind() rejects; the guard here
 * is a backstop, not the check.
 */
export function FilePreview({
  trigger,
  name,
  src,
  ext,
  downloadHref,
}: {
  trigger: React.ReactNode;
  name: string;
  src: string;
  ext: string;
  /** omitted for a local file that has not been uploaded yet */
  downloadHref?: string;
}) {
  const kind = previewKind(ext);
  if (!kind) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-[15px]">
            {name}
          </DialogTitle>
        </DialogHeader>

        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Pratinjau ${name}`}
            className="bg-muted max-h-[70vh] w-full rounded-lg border object-contain"
          />
        ) : (
          <iframe
            src={src}
            title={`Pratinjau ${name}`}
            className="bg-muted h-[70vh] w-full rounded-lg border"
          />
        )}

        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              Buka di tab baru
            </a>
          </Button>
          {downloadHref && (
            <Button asChild>
              <a href={downloadHref} download={name}>
                <Download className="size-3.5" aria-hidden />
                Unduh
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
