import Link from "next/link";
import { ATT_LABEL, type AttStatus, initials } from "@/lib/hr";
import { cn } from "@/lib/utils";

/** Semantic tone → token pair. Mirrors the mockup's badge() helper. */
const TONE = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  primary: "bg-primary-subtle text-primary",
  neutral: "bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof TONE;

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-[3px] text-[11.5px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ATT_TONE: Record<AttStatus, Tone> = {
  hadir: "success",
  telat: "warning",
  wfh: "info",
  cuti: "neutral",
  izin: "neutral",
  sakit: "info",
  // "belum" bukan pelanggaran — orangnya mungkin baru di jalan. Yang merah adalah
  // hari kerja yang sudah lewat tanpa kabar.
  belum_absen: "warning",
  tanpa_keterangan: "danger",
  libur: "neutral",
  // netral, bukan peringatan: tidak ada yang perlu ditindaklanjuti dari hari
  // yang aplikasinya sendiri belum mencatat apa pun
  belum_dicatat: "neutral",
};

export const AttBadge = ({ status }: { status: AttStatus }) => (
  <Pill tone={ATT_TONE[status]}>{ATT_LABEL[status]}</Pill>
);

const REQ_TONE = {
  menunggu: "warning",
  // primary, not warning: "menunggu" is HR's queue and "revisi" is the employee's,
  // and two amber pills side by side in the same list say nothing about whose turn
  // it is
  revisi: "primary",
  disetujui: "success",
  ditolak: "danger",
  dibatalkan: "neutral",
} as const;

const REQ_LABEL = {
  menunggu: "Menunggu",
  revisi: "Perlu revisi",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan",
} as const;

export const ReqBadge = ({ status }: { status: keyof typeof REQ_TONE }) => (
  <Pill tone={REQ_TONE[status]}>{REQ_LABEL[status]}</Pill>
);

/**
 * Profile photo, initials as the fallback. Plain <img> on purpose: the photo is
 * streamed from /api/files, which is authorized per request — routing that
 * through the next/image optimizer would buy nothing and need a loader config.
 */
export function Avatar({
  name,
  photoKey,
  className,
}: {
  name: string;
  photoKey?: string | null;
  className?: string;
}) {
  const shape = cn(
    "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10.5px] font-semibold",
    className,
  );
  if (photoKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${photoKey}`}
        alt={`Foto ${name}`}
        className={cn(shape, "bg-muted object-cover")}
      />
    );
  }
  return (
    <span className={cn("bg-muted text-muted-foreground", shape)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function PageHead({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-0.5 text-[22px] font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground text-[13.5px]">{desc}</p>
      </div>
      {children && <div className="flex items-end gap-2">{children}</div>}
    </div>
  );
}

/** KPI tile. Renders as a link when `href` is given so the stat doubles as a
 *  filter, like the mockup's clickable stat cards. */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  href,
  active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  href?: string;
  active?: boolean;
}) {
  const valueColor = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
    primary: "text-primary",
    neutral: "text-foreground",
  }[tone];

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span
          className={cn("size-[7px] rounded-full", {
            "bg-success": tone === "success",
            "bg-warning": tone === "warning",
            "bg-danger": tone === "danger",
            "bg-info": tone === "info",
            "bg-primary": tone === "primary",
            "bg-border-strong": tone === "neutral",
          })}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "tnum text-[25px] font-bold tracking-tight",
            valueColor,
          )}
        >
          {value}
        </span>
        {sub && <span className="text-subtle text-[11.5px]">{sub}</span>}
      </div>
    </>
  );

  const cls = cn(
    "bg-card block rounded-xl border p-3.5 text-left shadow-sm transition-colors",
    href && "hover:border-border-strong",
    active && "border-primary/45 ring-primary-subtle ring-2",
  );

  return href ? (
    <Link
      href={href}
      className={cls}
      aria-current={active ? "true" : undefined}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card overflow-hidden rounded-[13px] border shadow-sm",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
          {title && <h2 className="text-[13.5px] font-semibold">{title}</h2>}
          <div className="ml-auto flex items-center gap-2">{action}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-4 py-10 text-center text-[13px]">
      {children}
    </p>
  );
}
