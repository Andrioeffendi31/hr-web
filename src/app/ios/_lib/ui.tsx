import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "./api";
import { ZoomImage } from "./lightbox";
import { toneClass, type Tone } from "./status";

/** Komponen kecil PWA. Mengikuti desain canvas: kartu radius 24, padding 16. */

export function Card({ className, ...p }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-3xl border border-border bg-card p-4 shadow-sm", className)}
      {...p}
    />
  );
}

export function Badge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-semibold",
        toneClass(tone),
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-1.5">
      <h1 className="font-heading text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-[15px] text-muted-foreground text-pretty">{subtitle}</p> : null}
    </header>
  );
}

export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-3xl bg-muted", className)} />;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="space-y-3 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-semibold text-primary underline underline-offset-4"
        >
          Coba lagi
        </button>
      ) : null}
    </Card>
  );
}

/**
 * Warna latar inisial, tetap per orang (dari inisialnya), seperti di desain dan
 * app Android: AZ magenta, AF ungu, DK hijau. Semuanya cukup gelap untuk teks putih.
 */
const WARNA_INISIAL = ["#3B6FB8", "#A33A68", "#6A45CF", "#2E7A68", "#B4562A", "#7A4FB0", "#2F6F8F"];
const warnaInisial = (s: string) =>
  WARNA_INISIAL[[...s].reduce((h, c) => h + c.charCodeAt(0), 0) % WARNA_INISIAL.length];

/** Foto profil dari /api/files, atau inisial bila belum ada foto. */
export function Avatar({
  photoKey,
  initials,
  size = 44,
  className,
  zoom,
  name,
}: {
  photoKey?: string | null;
  initials: string;
  size?: number;
  className?: string;
  /** ketuk untuk membuka foto layar penuh. Jangan dipakai di dalam <Link>:
   *  tombol di dalam tautan tidak sah dan ketukannya ambigu. */
  zoom?: boolean;
  /** keterangan di pratinjau layar penuh */
  name?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.34) };
  if (photoKey && zoom)
    return (
      <ZoomImage
        src={fileUrl(photoKey)}
        alt={name ? `Foto ${name}` : "Foto profil"}
        style={style}
        className={cn("shrink-0 rounded-full", className)}
        imgClassName="size-full object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      >
        <span className="sr-only">{initials}</span>
      </ZoomImage>
    );
  if (photoKey)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dilayani /api/files dengan sesi
      <img
        src={fileUrl(photoKey)}
        alt=""
        style={style}
        className={cn(
          "shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
          className,
        )}
      />
    );
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: warnaInisial(initials) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** Judul sub-halaman dengan tombol kembali. */
export function BackHeader({ href, title }: { href: string; title: string }) {
  return (
    <div className="-ml-2 flex items-center gap-1">
      <Link href={href} aria-label="Kembali" className="flex size-11 items-center justify-center rounded-xl">
        <ArrowLeft className="size-[22px]" />
      </Link>
      <h1 className="text-[17px] font-semibold">{title}</h1>
    </div>
  );
}

/** Baris tautan bergaya daftar pengaturan. */
export function RowLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        {desc ? <span className="block text-[13px] text-muted-foreground text-pretty">{desc}</span> : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * Satu gaya untuk semua field PWA — input teks, tanggal, jam, dan select.
 *
 * `appearance-none` wajib: tanpanya Safari iOS menggambar <select> dan input
 * tanggal/jam dengan gaya native-nya sendiri, sehingga radius dan padding dari
 * kelas ini kalah dan field-nya tampak berbeda dari input di sebelahnya. Nilai
 * tanggal/jam di iOS juga dirata-tengah secara bawaan; dibuat rata kiri supaya
 * sejajar dengan label dan field lain.
 */
export const FIELD =
  "h-12 w-full appearance-none rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60 [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:leading-[2.75rem]";

/** <select> native (pemilih roda iOS tetap dipakai) dengan tampilan field yang sama. */
export function Select({ className, children, ...p }: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select {...p} className={cn(FIELD, "pr-10", className)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
