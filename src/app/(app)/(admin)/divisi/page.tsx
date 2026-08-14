import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { divisions, employees, settings } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, Stat } from "@/components/bits";
import { HARI_KERJA_DEFAULT, NAMA_HARI, resolveShift } from "@/lib/hr";
import { DeleteDivisi, DivisiDialog } from "./divisi-form";

/** "Senin–Jumat" kalau berurutan, "Sen/Rab/Jum" kalau tidak. Dua hari berdampingan
 *  yang bukan rentang lebih mudah dibaca sebagai daftar daripada sebagai rentang. */
function hariLabel(days: readonly number[] | null) {
  const d = [...(days ?? HARI_KERJA_DEFAULT)].sort((a, b) => a - b);
  const berurutan = d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  if (d.length === 0) return "tanpa hari kerja";
  if (d.length > 2 && berurutan)
    return `${NAMA_HARI[d[0]]}–${NAMA_HARI[d[d.length - 1]]}`;
  return d.map((n) => NAMA_HARI[n].slice(0, 3)).join("/");
}

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
        workDays: divisions.workDays,
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
    (r) => r.shiftStart || r.lateToleranceMinutes !== null || r.workDays,
  );
  const def = resolveShift(null, fallback);

  return (
    <>
      <PageHead
        title="Divisi"
        desc={`Jam dan hari kerja per divisi. Yang dikosongkan mengikuti default perusahaan (${def.start}–${def.end}, toleransi ${def.toleranceMinutes} menit, ${hariLabel(null)}).`}
      >
        <DivisiDialog fallback={fallback} />
      </PageHead>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Divisi" value={rows.length} sub="terdaftar" />
        <Stat
          label="Jadwal sendiri"
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
              const inherits =
                !r.shiftStart && r.lateToleranceMinutes === null && !r.workDays;
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
                      {shift.toleranceMinutes} menit · {hariLabel(r.workDays)}
                    </span>
                  </span>
                  <Pill tone={inherits ? "neutral" : "info"}>
                    {inherits ? "Ikut default" : "Jadwal sendiri"}
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
