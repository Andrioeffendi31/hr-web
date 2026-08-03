"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FilePreview } from "@/components/file-preview";
import { acceptsFile, ekstensi, previewKind, ukuranFile } from "@/lib/hr";
import { cn } from "@/lib/utils";

/**
 * File picker that also takes a drop, with the client-side half of the checks
 * the server does anyway — an oversized file should not have to travel 100 MB
 * before being rejected. The server stays the only authority.
 *
 * The whole box is a <label> wrapping a visually hidden (not `hidden`) input, so
 * click and keyboard activation come from the platform: no role="button", no
 * tabIndex, no key handlers.
 *
 * With `children`, it only attaches drop behaviour to whatever is inside —
 * that is how a 32 px table-cell button gets drag & drop without a dropzone.
 */
export function FileDrop({
  accept,
  maxBytes,
  value,
  onFile,
  hint,
  disabled,
  className,
  children,
}: {
  accept: string;
  maxBytes: number;
  value?: File | null;
  onFile: (file: File | null) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (files.length > 1) toast.info("Hanya file pertama yang dipakai");
    if (!acceptsFile(file.name, accept)) {
      toast.error(hint ? `Tipe file tidak didukung — ${hint}` : "Tipe file tidak didukung");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`File terlalu besar (maks ${ukuranFile(maxBytes)})`);
      return;
    }
    if (file.size === 0) {
      toast.error("File kosong");
      return;
    }
    onFile(file);
  };

  const dropHandlers = disabled
    ? {}
    : {
        // without preventDefault the browser navigates to the dropped file
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        },
      };

  const input = (
    <input
      type="file"
      accept={accept}
      disabled={disabled}
      onChange={(e) => {
        take(e.currentTarget.files);
        // let the same file be picked again after being cleared
        e.currentTarget.value = "";
      }}
      className="sr-only"
    />
  );

  if (children) {
    return (
      <label
        {...dropHandlers}
        className={cn("relative block cursor-pointer", dragging && "ring-primary ring-2 rounded-md", className)}
      >
        {children}
        {input}
      </label>
    );
  }

  return (
    <div className={className}>
      <label
        {...dropHandlers}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-primary bg-primary-subtle"
            : "border-border-strong hover:bg-accent",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="text-subtle size-5" aria-hidden />
        <span className="text-[12.5px] font-medium">
          Tarik berkas ke sini atau klik untuk pilih
        </span>
        {hint && <span className="text-subtle text-[11px] font-normal">{hint}</span>}
        {input}
      </label>

      {value && (
        <SelectedFile file={value} onClear={disabled ? undefined : () => onFile(null)} />
      )}
    </div>
  );
}

/** Chosen-file row: thumbnail for an image, icon for anything else, and a
 *  preview trigger when the type can be rendered. */
function SelectedFile({ file, onClear }: { file: File; onClear?: () => void }) {
  const ext = ekstensi(file.name);
  const kind = previewKind(ext);

  // derived, not state: setting state from an effect would cascade a render.
  // The cleanup is keyed on the url it actually saw, so a recomputed memo
  // revokes the previous one — a 100 MB blob left behind sits in memory until
  // the tab reloads.
  const url = useMemo(() => (kind ? URL.createObjectURL(file) : null), [file, kind]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const thumb =
    kind === "image" && url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="bg-muted size-10 shrink-0 rounded-md border object-cover"
      />
    ) : (
      <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
        <FileText className="size-4" aria-hidden />
      </span>
    );

  return (
    <div className="bg-surface-2 mt-2 flex items-center gap-2.5 rounded-lg border p-2">
      {kind && url ? (
        <FilePreview
          name={file.name}
          src={url}
          ext={ext}
          trigger={
            <button
              type="button"
              aria-label={`Pratinjau ${file.name}`}
              className="focus-visible:ring-ring shrink-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
            >
              {thumb}
            </button>
          }
        />
      ) : (
        thumb
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{file.name}</span>
        <span className="text-subtle tnum block text-[11px]">
          {ukuranFile(file.size)}
          {kind && " · klik gambar untuk pratinjau"}
        </span>
      </span>

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Batalkan pilihan ${file.name}`}
          className="text-subtle hover:text-danger hover:bg-accent flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
