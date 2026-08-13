import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { divisions, employees, settings } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, Stat } from "@/components/bits";
import { resolveShift } from "@/lib/hr";
import { DeleteDivisi, DivisiDialog } from "./divisi-form";

/**
 * Divisions and their shifts.
 *
 * A division exists to answer one question the company-wide schedule could not:
 * when is *this* team late. Everything else about a division is already carried
 * by the employee rows that name it.
 */
export default async function DivisiPage() {
  await requireAdmin();

  const [rows, [cfg]] = await Promise.all([
    db
      .select({
        name: divisions.name,
        shiftStart: divisions.shiftStart,
        shiftEnd: divisions.shiftEnd,
        lateToleranceMinutes: divisions.lateToleranceMinutes,
        headcount: count(employees.id),
      })
      .from(divisions)
      .leftJoin(employees, eq(employees.division, divisions.name))
      .groupBy(divisions.name)
      .orderBy(asc(divisions.name)),
    db.select().from(settings).where(eq(settings.id, 1)).limit(1),
  ]);

  const fallback = {
    shiftStart: cfg?.shiftStart ?? "08:00:00",
    shiftEnd: cfg?.shiftEnd ?? "17:00:00",
    lateToleranceMinutes: cfg?.lateToleranceMinutes ?? 15,
  };
  const custom = rows.filter(
    (r) => r.shiftStart || r.lateToleranceMinutes !== null,
  );
  const def = resolveShift(null, fallback);

  return (
    <>
      <PageHead
        title="Divisi"
        desc={`Jam kerja per divisi. Yang dikosongkan mengikuti jadwal default perusahaan (${def.start}–${def.end}, toleransi ${def.toleranceMinutes} menit).`}
      >
        <DivisiDialog fallback={fallback} />
      </PageHead>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Divisi" value={rows.length} sub="terdaftar" />
        <Stat
          label="Jam kerja sendiri"
          value={custom.length}
          sub="beda dari default"
          tone={custom.length > 0 ? "info" : "neutral"}
        />
        <Stat
          label="Belum ada karyawan"
          value={rows.filter((r) => r.headcount === 0).length}
          sub="divisi kosong"
        />
      </div>

      <Panel title="Daftar divisi">
        {rows.length === 0 ? (
          <Empty>
            Belum ada divisi. Tambahkan minimal satu sebelum menambah karyawan.
          </Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const shift = resolveShift(r, fallback);
              const inherits = !r.shiftStart && r.lateToleranceMinutes === null;
              return (
                <li
                  key={r.name}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {r.name}
                    </span>
                    <span className="text-subtle tnum text-[11.5px]">
                      {shift.start}–{shift.end} · toleransi{" "}
                      {shift.toleranceMinutes} menit
                    </span>
                  </span>
                  <Pill tone={inherits ? "neutral" : "info"}>
                    {inherits ? "Ikut default" : "Jam sendiri"}
                  </Pill>
                  <span className="text-subtle tnum w-20 shrink-0 text-right text-[11.5px]">
                    {r.headcount} orang
                  </span>
                  <DivisiDialog fallback={fallback} initial={r} />
                  <DeleteDivisi name={r.name} headcount={r.headcount} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
