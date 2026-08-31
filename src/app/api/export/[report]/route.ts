import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { todayWib } from "@/lib/hr";
import { LAPORAN, type ReportKey } from "@/lib/laporan";
import { toCsv } from "@/lib/csv";

/**
 * Unduh satu laporan sebagai CSV.
 *
 * Kuerinya sendiri tidak lagi tinggal di sini — lihat `lib/laporan.ts`. Route ini
 * hanya menjawab tiga hal: siapa yang boleh, rentang mana, dan dalam bentuk apa.
 * Pindahnya bukan demi kerapian: arsip bulanan (`lib/arsip.ts`) memanggil kueri
 * yang sama tanpa request dan tanpa sesi, dan satu-satunya cara menjamin Excel
 * arsip sama dengan CSV di layar adalah dengan tidak punya salinan kedua.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ report: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const { report } = await ctx.params;
  if (!Object.prototype.hasOwnProperty.call(LAPORAN, report)) {
    return Response.json({ error: "Laporan tidak dikenal" }, { status: 404 });
  }

  const url = new URL(req.url);
  const today = todayWib();
  const from = url.searchParams.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") ?? today;
  const div = url.searchParams.get("div");

  /**
   * `?date=` HANYA untuk laporan kehadiran: papan harian mengirimnya untuk
   * mengekspor satu hari, sedangkan /laporan mengirim `?from=&to=`. Laporan lain
   * tidak pernah menerimanya dan tidak boleh mulai menerimanya sekarang —
   * memperlakukannya seragam akan diam-diam mempersempit rentang setiap ekspor
   * lain yang kebetulan membawa parameter itu.
   */
  const date = report === "kehadiran" ? url.searchParams.get("date") : null;
  const d1 = date ?? from;
  const d2 = date ?? to;

  const { headers, rows } = await LAPORAN[report as ReportKey]({
    from: d1,
    to: d2,
    div,
  });

  const filename =
    report === "kehadiran"
      ? d1 === d2
        ? `kehadiran-${d1}.csv`
        : `kehadiran-${d1}-${d2}.csv`
      : `${report}-${from}-${to}.csv`;

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "report.export",
    entity: report,
    detail: `${rows.length} baris · ${filename}`,
  });

  return new Response(toCsv(headers, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
