import { and, asc, count, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db";
import { attendance, employees, overtimeRequests } from "@/db/schema";
import { AttBadge, Avatar, PageHead, Pill } from "@/components/bits";
import { DataTable, type Column } from "@/components/data-table";
import { EmployeeDetail } from "./detail-modal";
import { EmployeeForm } from "./employee-form";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { SelectField } from "@/components/select-field";
import { type AttStatus, tanggalPendek, todayWib } from "@/lib/hr";
import { leaveBalances } from "@/lib/leave";
import { parsePaging, parseSort } from "@/lib/paging";

type Search = {
  q?: string;
  div?: string;
  status?: string;
  open?: string;
  page?: string;
  perPage?: string;
  sort?: string;
  dir?: string;
};

/** whitelist for ?sort= — anything else falls back to name A-Z */
const SORTABLE = {
  nama: employees.name,
  divisi: employees.division,
  jabatan: employees.position,
  mulai: employees.joinedAt,
};

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

  const where = and(
    divFilter === "all" ? undefined : eq(employees.division, divFilter),
    q ? ilike(employees.name, `%${q}%`) : undefined,
    statusFilter === "semua"
      ? undefined
      : eq(employees.active, statusFilter === "aktif"),
  );

  const { page, perPage, offset } = parsePaging(sp);
  const sorting = parseSort(sp, SORTABLE, "nama");
  const orderColumn = sorting.column ?? employees.name;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        nik: employees.nik,
        email: employees.email,
        role: employees.role,
        division: employees.division,
        position: employees.position,
        contractType: employees.contractType,
        joinedAt: employees.joinedAt,
        workLocation: employees.workLocation,
        managerId: employees.managerId,
        active: employees.active,
        photoUrl: employees.photoUrl,
        status: attendance.status,
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(eq(attendance.employeeId, employees.id), eq(attendance.date, today)),
      )
      .where(where)
      .orderBy(sorting.dir === "desc" ? desc(orderColumn) : asc(orderColumn))
      .limit(perPage)
      .offset(offset),
    db.select({ n: count() }).from(employees).where(where),
  ]);
  const total = totalRow.n;

  // Detail modal — only queried when a row is open, so the list stays cheap.
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
        photoUrl: employees.photoUrl,
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

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "nama",
      header: "Karyawan",
      sortable: true,
      cell: (r) => (
        <Link
          href={`?${params({ open: String(r.id) })}`}
          scroll={false}
          className="flex items-center gap-2.5 hover:underline"
        >
          <Avatar name={r.name} photoKey={r.photoUrl} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">
              {r.name}
              {!r.active && (
                <span className="text-subtle ml-1.5 text-[11px] font-normal">
                  (nonaktif)
                </span>
              )}
            </span>
            <span className="text-subtle tnum block text-[11px]">{r.nik}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "divisi",
      header: "Divisi",
      sortable: true,
      className: "text-muted-foreground text-[12.5px]",
      cell: (r) => r.division,
    },
    {
      key: "jabatan",
      header: "Jabatan",
      sortable: true,
      className: "text-[12.5px]",
      cell: (r) => r.position,
    },
    {
      key: "tipe",
      header: "Tipe",
      cell: (r) => (
        <Pill tone={r.contractType === "Tetap" ? "success" : "neutral"}>
          {r.contractType}
        </Pill>
      ),
    },
    {
      key: "mulai",
      header: "Mulai kerja",
      sortable: true,
      className: "tnum text-muted-foreground text-[12.5px]",
      cell: (r) => `${tanggalPendek(r.joinedAt)} ${r.joinedAt.slice(0, 4)}`,
    },
    {
      key: "hariini",
      header: "Hari ini",
      cell: (r) => <AttBadge status={(r.status ?? "belum_absen") as AttStatus} />,
    },
    {
      key: "aksi",
      header: "Aksi",
      sticky: true,
      cell: (r) => (
        <EmployeeForm
          divisions={divisionNames}
          managers={allEmployees}
          initial={{
            id: r.id,
            nik: r.nik,
            name: r.name,
            email: r.email,
            role: r.role,
            division: r.division,
            position: r.position,
            contractType: r.contractType,
            joinedAt: r.joinedAt,
            workLocation: r.workLocation,
            managerId: r.managerId,
            active: r.active,
            photoUrl: r.photoUrl,
          }}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Ubah data ${r.name}`}
              title={`Ubah data ${r.name}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <>
      <PageHead title="Data Karyawan" desc={`${total} karyawan`}>
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
            <SelectField
              id="div"
              name="div"
              defaultValue={divFilter}
              autoSubmit
              options={[
                { value: "all", label: "Semua divisi" },
                ...divisions.map((d) => ({ value: d.division, label: d.division })),
              ]}
            />
          </div>
          <div>
            <label
              htmlFor="status"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Status
            </label>
            <SelectField
              id="status"
              name="status"
              defaultValue={statusFilter}
              autoSubmit
              options={[
                { value: "aktif", label: "Aktif" },
                { value: "nonaktif", label: "Nonaktif" },
                { value: "semua", label: "Semua" },
              ]}
            />
          </div>
          {/* the name box still needs Enter/submit; the pickers submit themselves */}
          <button
            type="submit"
            className="bg-surface-2 border-border-strong hover:bg-accent h-9 rounded-[9px] border px-3.5 text-[13px] font-medium transition-colors"
          >
            Cari
          </button>
        </form>

        <EmployeeForm
          divisions={divisionNames}
          managers={allEmployees}
          trigger={<Button className="h-9">Tambah karyawan</Button>}
        />
      </PageHead>

      <DataTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        path="/karyawan"
        sp={sp}
        sort={sorting.key}
        dir={sorting.dir}
        minWidth={860}
        empty="Tidak ada karyawan yang cocok."
        rowKey={(r) => r.id}
      />

      {detail && (
        <EmployeeDetail
          detail={detail}
          backHref={backHref()}
          divisions={divisionNames}
          managers={allEmployees}
        />
      )}
    </>
  );
}
