import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { attendance, officeLocations } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, Stat } from "@/components/bits";
import { DeleteLokasi, LokasiDialog } from "./lokasi-form";

/**
 * The office points clock-in is measured against (PRD §6.8).
 *
 * This used to be three columns on the settings row, which meant one office for
 * the whole company and no way for a branch or warehouse to exist. The employee
 * picks one of these at clock-in and the server re-checks the geofence against
 * whichever they picked.
 */
export default async function LokasiPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: officeLocations.id,
      name: officeLocations.name,
      lat: officeLocations.lat,
      lng: officeLocations.lng,
      radiusM: officeLocations.radiusM,
      active: officeLocations.active,
      punches: count(attendance.id),
    })
    .from(officeLocations)
    .leftJoin(attendance, eq(attendance.locationId, officeLocations.id))
    .groupBy(officeLocations.id)
    .orderBy(asc(officeLocations.name));

  const active = rows.filter((r) => r.active);

  return (
    <>
      <PageHead
        title="Lokasi Absen"
        desc="Titik kantor yang bisa dipilih karyawan saat absen masuk. Absen keluar otomatis mengikuti pilihan saat masuk."
      >
        <LokasiDialog />
      </PageHead>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Lokasi aktif" value={active.length} sub="bisa dipilih karyawan" />
        <Stat
          label="Nonaktif"
          value={rows.length - active.length}
          sub="disembunyikan dari aplikasi"
        />
        <Stat
          label="Radius rata-rata"
          value={
            active.length
              ? Math.round(active.reduce((s, r) => s + r.radiusM, 0) / active.length)
              : 0
          }
          sub="meter"
        />
      </div>

      {active.length === 0 && rows.length > 0 && (
        <p className="border-warning/40 bg-warning/10 text-warning mb-4 rounded-[11px] border px-4 py-2.5 text-[12.5px]">
          Tidak ada lokasi aktif — karyawan hanya bisa absen dengan menandai WFH.
        </p>
      )}

      <Panel title="Daftar lokasi">
        {rows.length === 0 ? (
          <Empty>Belum ada lokasi absen. Tambahkan minimal satu titik kantor.</Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.name}</span>
                  <span className="text-subtle tnum text-[11.5px]">
                    {Number(r.lat).toFixed(6)}, {Number(r.lng).toFixed(6)} · radius{" "}
                    {r.radiusM} m
                  </span>
                </span>
                <a
                  href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary shrink-0 text-[11.5px] font-medium hover:underline"
                >
                  Peta
                </a>
                <Pill tone={r.active ? "success" : "neutral"}>
                  {r.active ? "Aktif" : "Nonaktif"}
                </Pill>
                <span className="text-subtle tnum w-20 shrink-0 text-right text-[11.5px]">
                  {r.punches} absen
                </span>
                <LokasiDialog initial={r} />
                <DeleteLokasi id={r.id} name={r.name} punches={r.punches} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
