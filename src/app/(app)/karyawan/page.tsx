import { and, asc, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db";
import { attendance, employees, overtimeRequests } from "@/db/schema";
import { AttBadge, Empty, PageHead, Panel, Pill } from "@/components/bits";
import { EmployeeDrawer } from "./drawer";
import { EmployeeForm } from "./employee-form";
import { Button } from "@/components/ui/button";
import { type AttStatus, initials, tanggalPendek, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";

type Search = { q?: string; div?: string; status?: string; open?: string };

const STATUS = ["aktif", "nonaktif", "semua"] as const;

export default async function KaryawanPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const divFilter = sp.div ?? "all";
  const statusFilter = STATUS.find((s) => s === sp.status) ?? "aktif";
  const openId = sp.open ? Number(sp.open) : null;
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;

  const manager = alias(employees, "manager");

  const [divisions, allEmployees] = await Promise.all([
    db
      .selectDistinct({ division: employees.division })
      .from(employees)
      .orderBy(asc(employees.division)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.name)),
  ]);

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      nik: employees.nik,
      division: employees.division,
      position: employees.position,
      contractType: employees.contractType,
      joinedAt: employees.joinedAt,
      active: employees.active,
      status: attendance.status,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(eq(attendance.employeeId, employees.id), eq(attendance.date, today)),
    )
    .where(
      and(
        divFilter === "all" ? undefined : eq(employees.division, divFilter),
        q ? ilike(employees.name, `%${q}%`) : undefined,
        statusFilter === "semua"
          ? undefined
          : eq(employees.active, statusFilter === "aktif"),
      ),
    )
    .orderBy(asc(employees.name));

  // Drawer detail — only queried when a row is open, so the list stays cheap.
  let detail = null;
  if (openId) {
    const [emp] = await db
      .select({
        id: employees.id,
        name: employees.name,
        nik: employees.nik,
        email: employees.email,
        division: employees.division,
        position: employees.position,
        contractType: employees.contractType,
        joinedAt: employees.joinedAt,
        workLocation: employees.workLocation,
        active: employees.active,
        role: employees.role,
        managerId: employees.managerId,
        managerName: manager.name,
      })
      .from(employees)
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(eq(employees.id, openId))
      .limit(1);

    if (emp) {
      const [[stats], log, [otAgg], [balance], [todayRow]] = await Promise.all([
        db
          .select({
            hadir: sql<number>`count(*) filter (where ${attendance.status} in ('hadir','wfh'))`.mapWith(Number),
            telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
          })
          .from(attendance)
          .where(
            and(
              eq(attendance.employeeId, openId),
              gte(attendance.date, monthStart),
            ),
          ),
        db
          .select({
            date: attendance.date,
            clockIn: attendance.clockIn,
            clockOut: attendance.clockOut,
            status: attendance.status,
          })
          .from(attendance)
          .where(eq(attendance.employeeId, openId))
          .orderBy(desc(attendance.date))
          .limit(5),
        db
          .select({
            minutes: sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(Number),
          })
          .from(overtimeRequests)
          .where(
            and(
              eq(overtimeRequests.employeeId, openId),
              eq(overtimeRequests.status, "disetujui"),
              gte(overtimeRequests.date, monthStart),
            ),
          ),
        leaveBalances(Number(today.slice(0, 4)), openId),
        db
          .select({ status: attendance.status })
          .from(attendance)
          .where(and(eq(attendance.employeeId, openId), eq(attendance.date, today)))
          .limit(1),
      ]);

      detail = {
        ...emp,
        hadir: stats.hadir,
        telat: stats.telat,
        sisaCuti: balance?.remaining ?? 0,
        jamLembur: Math.round(otAgg.minutes / 60),
        todayStatus: (todayRow?.status ?? "belum_absen") as AttStatus,
        log: log.map((l) => ({ ...l, status: l.status as AttStatus })),
      };
    }
  }

  const params = (extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (divFilter !== "all") p.set("div", divFilter);
    if (statusFilter !== "aktif") p.set("status", statusFilter);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    return p;
  };
  const backHref = () => {
    const p = params();
    return `/karyawan${p.size ? `?${p}` : ""}`;
  };
  const divisionNames = divisions.map((d) => d.division);

  return (
    <>
      <PageHead title="Data Karyawan" desc={`${rows.length} karyawan ditampilkan`}>
        <form className="flex items-end gap-2">
          <div>
            <label
              htmlFor="q"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Cari nama
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Nama karyawan…"
              className="bg-card border-border-strong h-9 rounded-[9px] border px-2.5 text-[13px]"
            />
          </div>
          <div>
            <label
              htmlFor="div"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Divisi
            </label>
            <select
              id="div"
              name="div"
              defaultValue={divFilter}
              className="bg-card border-border-strong h-9 rounded-[9px] border px-2 text-[13px]"
            >
              <option value="all">Semua divisi</option>
              {divisions.map((d) => (
                <option key={d.division} value={d.division}>
                  {d.division}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="status"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusFilter}
              className="bg-card border-border-strong h-9 rounded-[9px] border px-2 text-[13px]"
            >
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
              <option value="semua">Semua</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-surface-2 border-border-strong hover:bg-accent h-9 rounded-[9px] border px-3.5 text-[13px] font-medium transition-colors"
          >
            Terapkan
          </button>
        </form>

        <EmployeeForm
          divisions={divisionNames}
          managers={allEmployees}
          trigger={<Button className="h-9">Tambah karyawan</Button>}
        />
      </PageHead>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="bg-surface-2 text-subtle border-b text-[11px] font-semibold tracking-[0.05em] uppercase">
                <th className="px-4 py-2.5 font-semibold">Karyawan</th>
                <th className="px-3 py-2.5 font-semibold">Divisi</th>
                <th className="px-3 py-2.5 font-semibold">Jabatan</th>
                <th className="px-3 py-2.5 font-semibold">Tipe</th>
                <th className="px-3 py-2.5 font-semibold">Mulai kerja</th>
                <th className="px-4 py-2.5 font-semibold">Hari ini</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`?${params({ open: String(r.id) })}`}
                      scroll={false}
                      className="flex items-center gap-2.5 hover:underline"
                    >
                      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {r.name}
                          {!r.active && (
                            <span className="text-subtle ml-1.5 text-[11px] font-normal">
                              (nonaktif)
                            </span>
                          )}
                        </span>
                        <span className="text-subtle tnum block text-[11px]">
                          {r.nik}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-[12.5px]">
                    {r.division}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px]">{r.position}</td>
                  <td className="px-3 py-2.5">
                    <Pill tone={r.contractType === "Tetap" ? "success" : "neutral"}>
                      {r.contractType}
                    </Pill>
                  </td>
                  <td className="tnum text-muted-foreground px-3 py-2.5 text-[12.5px]">
                    {tanggalPendek(r.joinedAt)} {r.joinedAt.slice(0, 4)}
                  </td>
                  <td className="px-4 py-2.5">
                    <AttBadge status={(r.status ?? "belum_absen") as AttStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Tidak ada karyawan yang cocok.</Empty>}
        </div>
      </Panel>

      {detail && (
        <EmployeeDrawer
          detail={detail}
          backHref={backHref()}
          divisions={divisionNames}
          managers={allEmployees}
        />
      )}
    </>
  );
}
