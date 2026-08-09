import { desc, eq, isNull, or } from "drizzle-orm";
import { Download, Eye } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, type Tone } from "@/components/bits";
import { FilePreview } from "@/components/file-preview";
import { previewKind, tanggalPendek, ukuranFile } from "@/lib/hr";
import { UploadBerkas } from "./upload";

export const metadata = { title: "Berkas Saya — Ruang HR" };

const FOLDER_LABEL: Record<string, string> = {
  personal: "Berkas Pribadi",
  kontrak: "Kontrak Kerja",
  sertif: "Sertifikat & Pelatihan",
  legal: "Dokumen Perusahaan",
};

const EXT_TONE: Record<string, Tone> = { PDF: "danger", XLSX: "success", JPG: "info" };

/**
 * The employee's own documents, plus the company-wide ones.
 *
 * The `or(ownerId = me, ownerId is null)` below IS the privacy rule — the same
 * one /api/me/documents enforces — not a UI filter over a wider query. Bytes
 * still leave through /api/files/[...key], which re-checks ownership per
 * download, so a guessed key gets nobody anywhere.
 */
export default async function BerkasSayaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await db
    .select()
    .from(documents)
    .where(
      or(eq(documents.ownerId, Number(session.user.id)), isNull(documents.ownerId)),
    )
    .orderBy(desc(documents.uploadedAt))
    .limit(100);

  return (
    <>
      <PageHead
        title="Berkas Saya"
        desc="Dokumen pribadi Anda dan dokumen perusahaan."
      >
        <UploadBerkas />
      </PageHead>

      <Panel title={`${rows.length} berkas`}>
        {rows.length === 0 ? (
          <Empty>Belum ada berkas untuk Anda.</Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Pill tone={EXT_TONE[r.ext] ?? "neutral"}>{r.ext}</Pill>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.name}</span>
                  <span className="text-subtle text-[11.5px]">
                    {FOLDER_LABEL[r.folder] ?? r.folder} ·{" "}
                    {r.ownerId ? "berkas pribadi" : "dokumen perusahaan"} ·{" "}
                    {ukuranFile(r.sizeBytes)} ·{" "}
                    {tanggalPendek(r.uploadedAt.toISOString().slice(0, 10))}
                  </span>
                </span>
                {previewKind(r.ext) && (
                  <FilePreview
                    name={r.name}
                    ext={r.ext}
                    src={`/api/files/${r.url}?inline=1`}
                    downloadHref={`/api/files/${r.url}`}
                    trigger={
                      <button
                        type="button"
                        aria-label={`Pratinjau ${r.name}`}
                        className="text-subtle hover:text-foreground hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                      >
                        <Eye className="size-4" aria-hidden />
                      </button>
                    }
                  />
                )}
                <a
                  href={`/api/files/${r.url}`}
                  download={r.name}
                  aria-label={`Unduh ${r.name}`}
                  className="text-subtle hover:text-foreground hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                >
                  <Download className="size-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-subtle mt-3 text-[11.5px]">
        Berkas pribadi hanya dapat dilihat oleh Anda dan tim HR.
      </p>
    </>
  );
}
