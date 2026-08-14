import { jam, todayWib } from "@/lib/hr";
import { bulanKaryawan } from "@/lib/kehadiran";
import { Bad, withMe } from "@/lib/me";

/** "Kehadiran Saya" (PRD-Mobile §6.2): own log for one month, plus the counts
 *  the stat cards show. Aturan statusnya ada di lib/kehadiran.ts — dipakai bersama
 *  dengan halaman web /saya/kehadiran. */
export const GET = withMe(async (me, req) => {
  const month =
    new URL(req.url).searchParams.get("month") ?? todayWib().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Bad("Bulan harus YYYY-MM");

  const { days, stats } = await bulanKaryawan(me.id, month);

  return Response.json({
    month,
    stats,
    days: days.map((r) => ({
      ...r,
      in: jam(r.clockIn),
      out: jam(r.clockOut),
      note: r.note ?? r.location ?? "",
    })),
  });
});
