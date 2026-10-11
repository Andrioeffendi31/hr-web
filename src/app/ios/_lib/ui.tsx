import { cn } from "@/lib/utils";
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
