import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "./api";
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

/** Foto profil dari /api/files, atau inisial bila belum ada foto. */
export function Avatar({
  photoKey,
  initials,
  size = 44,
  className,
}: {
  photoKey?: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.34) };
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
      style={style}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
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
