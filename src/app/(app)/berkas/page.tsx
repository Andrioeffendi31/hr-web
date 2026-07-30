import { count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Download, FolderClosed } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { documents, employees } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, type Tone } from "@/components/bits";
import { cn } from "@/lib/utils";

const FOLDERS = [
  { v: "personal", label: "Berkas Pribadi", tone: "primary" as Tone },
  { v: "kontrak", label: "Kontrak Kerja", tone: "info" as Tone },
  { v: "sertif", label: "Sertifikat & Pelatihan", tone: "success" as Tone },
  { v: "legal", label: "Dokumen Perusahaan", tone: "warning" as Tone },
] as const;

const EXT_TONE: Record<string, Tone> = { PDF: "danger", XLSX: "success", JPG: "info" };

const mb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.round(bytes / 1024)} KB`;

export default async function BerkasPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; owner?: string }>;
}) {
  const sp = await searchParams;
  const folder = (FOLDERS.find((f) => f.v === sp.folder)?.v ?? "personal") as
    | "personal"
    | "kontrak"
    | "sertif"
    | "legal";
  const ownerFilter = sp.owner ? Number(sp.owner) : null;
  const owner = alias(employees, "owner");

  const [counts, files, [total]] = await Promise.all([
    db
      .select({
        folder: documents.folder,
        n: count(),
        bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`.mapWith(Number),
      })
      .from(documents)
      .groupBy(documents.folder),

    db
      .select({
        id: documents.id,
        name: documents.name,
        ext: documents.ext,
        sizeBytes: documents.sizeBytes,
        uploadedAt: documents.uploadedAt,
        ownerName: owner.name,
      })
      .from(documents)
      .leftJoin(owner, eq(owner.id, documents.ownerId))
      .where(
        ownerFilter
          ? eq(documents.ownerId, ownerFilter)
          : eq(documents.folder, folder),
      )
      .orderBy(desc(documents.uploadedAt)),

    db
      .select({
        bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`.mapWith(Number),
      })
      .from(documents),
  ]);

  const title = ownerFilter
    ? `Berkas ${files[0]?.ownerName ?? "karyawan"}`
    : FOLDERS.find((f) => f.v === folder)!.label;

  return (
    <>
      <PageHead
        title="Berkas"
        desc={`Total terpakai ${mb(total.bytes)} · dokumen pribadi hanya terlihat oleh pemilik dan HR`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FOLDERS.map((f) => {
          const c = counts.find((x) => x.folder === f.v);
          const active = !ownerFilter && folder === f.v;
          return (
            <Link
              key={f.v}
              href={`/berkas?folder=${f.v}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "bg-card flex items-center gap-3 rounded-xl border p-3.5 shadow-sm transition-colors",
                active ? "border-primary/45 ring-primary-subtle ring-2" : "hover:border-border-strong",
              )}
            >
              <span
                className={cn(
                  "flex size-[34px] shrink-0 items-center justify-center rounded-[10px]",
                  {
                    primary: "bg-primary-subtle text-primary",
                    info: "bg-info-subtle text-info",
                    success: "bg-success-subtle text-success",
                    warning: "bg-warning-subtle text-warning",
                    danger: "bg-danger-subtle text-danger",
                    neutral: "bg-muted text-muted-foreground",
                  }[f.tone],
                )}
              >
                <FolderClosed className="size-[17px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{f.label}</span>
                <span className="text-subtle tnum block text-[11.5px]">
                  {c?.n ?? 0} berkas · {mb(c?.bytes ?? 0)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <Panel
        title={title}
        action={
          ownerFilter && (
            <Link
              href="/berkas"
              className="text-primary text-[12.5px] font-medium hover:underline"
            >
              Lihat semua folder
            </Link>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                <th className="px-4 py-2.5 font-semibold">Nama berkas</th>
                <th className="px-3 py-2.5 font-semibold">Pemilik</th>
                <th className="px-3 py-2.5 font-semibold">Ukuran</th>
                <th className="px-3 py-2.5 font-semibold">Tanggal</th>
                <th className="px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-surface-2 border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Pill tone={EXT_TONE[f.ext] ?? "neutral"} className="tnum text-[9.5px]">
                        {f.ext}
                      </Pill>
                      <span className="truncate text-[13px] font-medium">{f.name}</span>
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-[12.5px]">
                    {f.ownerName ?? "Perusahaan"}
                  </td>
                  <td className="tnum text-muted-foreground px-3 py-2.5 text-[12.5px]">
                    {mb(f.sizeBytes)}
                  </td>
                  <td className="tnum text-muted-foreground px-3 py-2.5 text-[12.5px]">
                    {f.uploadedAt.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      timeZone: "Asia/Jakarta",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      disabled
                      title="Object storage belum terhubung"
                      aria-label={`Unduh ${f.name}`}
                      className="text-subtle flex size-8 items-center justify-center rounded-lg border disabled:opacity-40"
                    >
                      <Download className="size-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {files.length === 0 && <Empty>Belum ada berkas di folder ini.</Empty>}
        </div>
      </Panel>
    </>
  );
}
