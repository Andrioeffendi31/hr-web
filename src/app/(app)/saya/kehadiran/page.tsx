import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttBadge, Empty, PageHead, Panel, Stat } from "@/components/bits";
import { SelectField } from "@/components/select-field";
import { type AttStatus, jam, tanggalPanjang, todayWib } from "@/lib/hr";
import { bulanKaryawan } from "@/lib/kehadiran";

export const metadata = { title: "Kehadiran Saya — NanumHR" };

/** The last 12 months, newest first — the same window the mobile picker offers. */
function lastMonths(n: number) {
  const now = new Date(`${todayWib()}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const value = d.toISOString().slice(0, 7);
    return {
      value,
      label: new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(d),
    };
  });
}

/**
 * The employee's own attendance log.
 *
 * A server component reading drizzle rather than calling `/api/me/attendance`:
 * that route exists so a phone can get the month in one authenticated round trip,
 * but this page already runs inside the same process as `auth()` and `db`, and
 * fetching our own HTTP endpoint would be a self-call for nothing. The `where`
 * clause below is the same ownership rule `withMe` enforces there.
 */
export default async function KehadiranSayaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;
  const months = lastMonths(12);
  const month = months.some((m) => m.value === sp.month)
    ? sp.month!
    : todayWib().slice(0, 7);

  const { days, stats } = await bulanKaryawan(Number(session.user.id), month);

  return (
    <>
      <PageHead title="Kehadiran Saya" desc="Riwayat absensi Anda per bulan.">
        <form>
          <SelectField
            name="month"
            defaultValue={month}
            ariaLabel="Pilih bulan"
            autoSubmit
            options={months}
          />
        </form>
      </PageHead>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Hadir" value={stats.hadir} sub="hari" tone="success" />
        <Stat label="Terlambat" value={stats.telat} sub="hari" tone="warning" />
        <Stat label="Cuti / izin / sakit" value={stats.cuti} sub="hari" />
        <Stat
          label="Tanpa keterangan"
          value={stats.tanpaKeterangan}
          sub="hari"
          tone="danger"
        />
      </div>

      <Panel title={months.find((mm) => mm.value === month)?.label}>
        {days.length === 0 ? (
          <Empty>Belum ada catatan kehadiran di bulan ini.</Empty>
        ) : (
          <ul className="divide-y">
            {days.map((r) => (
              <li key={r.date}>
                <Link
                  href={`/saya/kehadiran/${r.date}`}
                  className="hover:bg-accent flex items-center gap-3 px-4 py-2.5 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {tanggalPanjang(r.date)}
                    </span>
                    <span className="text-subtle tnum text-[11.5px]">
                      {r.clockIn
                        ? `${jam(r.clockIn)} – ${jam(r.clockOut)}`
                        : "—"}
                      {(r.note ?? r.location) && ` · ${r.note ?? r.location}`}
                    </span>
                  </span>
                  <AttBadge status={r.status as AttStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
