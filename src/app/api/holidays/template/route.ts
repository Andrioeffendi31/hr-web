import { requireAdmin } from "@/auth";
import { toCsv } from "@/lib/csv";
import { todayWib } from "@/lib/hr";

/** Blank-ish CSV HR fills in from the SKB 3 Menteri and re-uploads. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const year = todayWib().slice(0, 4);
  const csv = toCsv(
    ["tanggal", "nama", "cuti_bersama"],
    [
      [`${year}-01-01`, "Tahun Baru Masehi", "tidak"],
      [`${year}-08-17`, "Hari Kemerdekaan RI", "tidak"],
      [`${year}-08-18`, "Cuti Bersama Kemerdekaan", "ya"],
    ],
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="template-hari-libur-${year}.csv"`,
    },
  });
}
