import { asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Download, Eye, FolderClosed } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { documents, employees } from "@/db/schema";
import { PageHead, Pill, type Tone } from "@/components/bits";
import { DataTable, type Column } from "@/components/data-table";
import { parsePaging, parseSort } from "@/lib/paging";
import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/file-preview";
import { previewKind, ukuranFile } from "@/lib/hr";
import { DeleteDocument, UploadDocument } from "./berkas-upload";

const FOLDERS = [
  { v: "personal", label: "Berkas Pribadi", tone: "primary" as Tone },
  { v: "kontrak", label: "Kontrak Kerja", tone: "info" as Tone },
  { v: "sertif", label: "Sertifikat & Pelatihan", tone: "success" as Tone },
  { v: "legal", label: "Dokumen Perusahaan", tone: "warning" as Tone },
] as const;

const EXT_TONE: Record<string, Tone> = {
  PDF: "danger",
  XLSX: "success",
  JPG: "info",
};

type Search = {
  folder?: string;
  owner?: string;
  page?: string;
  perPage?: string;
  sort?: string;
  dir?: string;
};

const SORTABLE = {
  nama: documents.name,
  ukuran: documents.sizeBytes,
  tanggal: documents.uploadedAt,
};

export default async function BerkasPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const folder = (FOLDERS.find((f) => f.v === sp.folder)?.v ?? "personal") as
    "personal" | "kontrak" | "sertif" | "legal";
  const ownerFilter = sp.owner ? Number(sp.owner) : null;
  const owner = alias(employees, "owner");

  const where = ownerFilter
    ? eq(documents.ownerId, ownerFilter)
    : eq(documents.folder, folder);

  const { page, perPage, offset } = parsePaging(sp);
  const sorting = parseSort(sp, SORTABLE, "tanggal");
  const orderColumn = sorting.column ?? documents.uploadedAt;
  const order =
    sorting.key === "tanggal" && !sp.dir
      ? desc(documents.uploadedAt)
      : sorting.dir === "desc"
        ? desc(orderColumn)
        : asc(orderColumn);

  const [counts, files, [total], [fileCount], staff] = await Promise.all([
    db
      .select({
        folder: documents.folder,
        n: count(),
        bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`.mapWith(
          Number,
        ),
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
        // R2 object key; "" on seeded rows that have no object behind them
        key: documents.url,
      })
      .from(documents)
      .leftJoin(owner, eq(owner.id, documents.ownerId))
      .where(where)
      .orderBy(order)
      .limit(perPage)
      .offset(offset),

    db
      .select({
        bytes: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)`.mapWith(
          Number,
        ),
      })
      .from(documents),

    db.select({ n: count() }).from(documents).where(where),

    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.name)),
  ]);

  const title = ownerFilter
    ? `Berkas ${files[0]?.ownerName ?? "karyawan"}`
    : FOLDERS.find((f) => f.v === folder)!.label;

  const columns: Column<(typeof files)[number]>[] = [
    {
      key: "nama",
      header: "Nama berkas",
      sortable: true,
      cell: (f) => (
        <span className="flex items-center gap-2.5">
          <Pill
            tone={EXT_TONE[f.ext] ?? "neutral"}
            className="tnum text-[9.5px]"
          >
            {f.ext}
          </Pill>
          <span className="truncate text-[13px] font-medium">{f.name}</span>
        </span>
      ),
    },
    {
      key: "pemilik",
      header: "Pemilik",
      className: "text-muted-foreground text-[12.5px]",
      cell: (f) => f.ownerName ?? "Perusahaan",
    },
    {
      key: "ukuran",
      header: "Ukuran",
      sortable: true,
      className: "tnum text-muted-foreground text-[12.5px]",
      cell: (f) => ukuranFile(f.sizeBytes),
    },
    {
      key: "tanggal",
      header: "Tanggal",
      sortable: true,
      className: "tnum text-muted-foreground text-[12.5px]",
      cell: (f) =>
        f.uploadedAt.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          timeZone: "Asia/Jakarta",
        }),
    },
    {
      key: "aksi",
      header: "Aksi",
      cell: (f) => (
        <span className="flex items-center gap-1.5">
          {f.key && previewKind(f.ext) && (
            <FilePreview
              name={f.name}
              src={`/api/files/${f.key}?inline=1`}
              downloadHref={`/api/files/${f.key}`}
              ext={f.ext}
              trigger={
                <button
                  type="button"
                  aria-label={`Pratinjau ${f.name}`}
                  className="text-subtle hover:text-primary hover:bg-accent flex size-8 items-center justify-center rounded-lg border transition-colors"
                >
                  <Eye className="size-4" aria-hidden />
                </button>
              }
            />
          )}
          {f.key ? (
            <a
              href={`/api/files/${f.key}`}
              download={f.name}
              aria-label={`Unduh ${f.name}`}
              className="text-subtle hover:text-primary hover:bg-accent flex size-8 items-center justify-center rounded-lg border transition-colors"
            >
              <Download className="size-4" aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Berkas contoh, belum ada file yang diunggah"
              aria-label={`Unduh ${f.name}`}
              className="text-subtle flex size-8 items-center justify-center rounded-lg border disabled:opacity-40"
            >
              <Download className="size-4" aria-hidden />
            </button>
          )}
          <DeleteDocument id={f.id} name={f.name} />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Berkas"
        desc={`Total terpakai ${ukuranFile(total.bytes)} · dokumen pribadi hanya terlihat oleh pemilik dan HR`}
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
                active
                  ? "border-primary/45 ring-primary-subtle ring-2"
                  : "hover:border-border-strong",
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
                <span className="block truncate text-[13px] font-medium">
                  {f.label}
                </span>
                <span className="text-subtle tnum block text-[11.5px]">
                  {c?.n ?? 0} berkas · {ukuranFile(c?.bytes ?? 0)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <DataTable
        title={title}
        action={
          <>
            {ownerFilter && (
              <Link
                href="/berkas"
                className="text-primary text-[12.5px] font-medium hover:underline"
              >
                Lihat semua folder
              </Link>
            )}
            <UploadDocument
              folder={folder}
              employees={staff.map((s) => ({
                value: String(s.id),
                label: s.name,
              }))}
            />
          </>
        }
        rows={files}
        columns={columns}
        total={fileCount.n}
        page={page}
        perPage={perPage}
        path="/berkas"
        sp={sp}
        sort={sorting.key}
        dir={sorting.dir}
        minWidth={640}
        empty="Belum ada berkas di folder ini."
        rowKey={(f) => f.id}
      />
    </>
  );
}
