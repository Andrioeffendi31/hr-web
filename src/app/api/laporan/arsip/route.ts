import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { buatArsip, PERIODE_RE } from "@/lib/arsip";
import { todayWib } from "@/lib/hr";
import { r2Configured } from "@/lib/r2";

/**
 * Bangun arsip Excel satu periode, sekarang juga — tombol "Generate sekarang"
 * di /laporan, untuk periode yang terlewat atau yang perlu dibuat ulang.
 *
 * Sinkron, bukan antrean. Diukur, bukan dikira: satu bulan pada data yang ada
 * sekarang menghasilkan ±600 baris di seluruh sheet, dan exceljs menuliskannya
 * jauh di bawah satu detik. Antrean job untuk pekerjaan sedetik adalah mesin yang
 * harus dijaga tanpa ada yang dibayarnya.
 *
 * `maxDuration` di bawah adalah sabuk pengaman, bukan target. Kalau suatu hari ia
 * benar-benar tersentuh, itulah sinyal bahwa antreannya sudah jadi kebutuhan
 * nyata — bukan sebelum itu.
 */
export const maxDuration = 60;

const badan = z.object({
  periode: z.string().regex(PERIODE_RE, "Periode harus berformat YYYY-MM"),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = badan.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Periode tidak sah" },
      { status: 400 },
    );
  }
  const { periode } = parsed.data;

  /**
   * Bulan yang belum tiba tidak punya data untuk diarsipkan, dan arsip kosong
   * yang terlanjur dibuat akan dipercaya `db/purge.ts` sebagai izin menghapus.
   * Bulan BERJALAN boleh — sebagian isi lebih berguna daripada tidak ada, dan
   * jadwal akhir bulan akan menimpanya dengan yang utuh.
   */
  if (periode > todayWib().slice(0, 7)) {
    return Response.json(
      { error: "Periode belum berjalan — tidak ada yang bisa diarsipkan" },
      { status: 400 },
    );
  }

  if (!r2Configured()) {
    return Response.json(
      { error: "Object storage belum dikonfigurasi" },
      { status: 503 },
    );
  }

  try {
    const hasil = await buatArsip(periode, Number(admin.id));
    revalidatePath("/laporan");
    revalidatePath("/berkas");
    return Response.json({ ok: true, ...hasil });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
