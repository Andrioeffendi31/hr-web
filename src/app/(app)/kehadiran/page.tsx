import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import {
  attendance,
  attendanceEvents,
  divisions as divisionTable,
  employees,
  officeLocations,
  settings,
} from "@/db/schema";
import { AttBadge, Avatar, Empty, PageHead, Panel, Stat } from "@/components/bits";
import { DataTable, type Column } from "@/components/data-table";
import { DateField } from "@/components/date-field";
import { AbsenteePanel } from "./absentee-panel";
import { SelfieCell } from "./selfie-cell";
import { AttendanceDetail, type DayDetail } from "./detail-modal";
import { SelectField } from "@/components/select-field";
import {
  type AttStatus,
  jam,
  resolveShift,
  tanggalPanjang,
  todayWib,
} from "@/lib/hr";
import { FEED_PAGE, parsePaging, parseSort } from "@/lib/paging";
import { cn } from "@/lib/utils";

type Search = {
  date?: string;
  tab?: "today" | "recap";
  div?: string;
  status?: string;
  open?: string;
  page?: string;
  perPage?: string;
  sort?: string;
  dir?: string;
};

const SORTABLE = {
  nama: employees.name,
  divisi: employees.division,
  masuk: attendance.clockIn,
};

// Status filtering is driven by the stat cards above the table — they double as
// the filter control, so there's no separate status <select>.
function href(base: Search, patch: Search) {
  const p = new URLSearchParams();
  const merged = { ...base, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
  return `/kehadiran${p.size ? `?${p}` : ""}`;
}

export default async function KehadiranPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? todayWib();
  const tab = sp.tab === "recap" ? "recap" : "today";
  const divFilter = sp.div ?? "all";
  const statusFilter = sp.status ?? "all";
  const monthStart = `${date.slice(0, 7)}-01`;

  const [cfg] = await db.select().from(settings).limit(1);

  // shift columns ride along: the page header has to state which schedule the
  // hadir/telat column was judged against, and that now depends on the filter
  const divisions = await db
    .select({
      division: divisionTable.name,
      shiftStart: divisionTable.shiftStart,
      shiftEnd: divisionTable.shiftEnd,
      lateToleranceMinutes: divisionTable.lateToleranceMinutes,
    })
    .from(divisionTable)
    .orderBy(asc(divisionTable.name));

  /**
   * The schedule to print in the header.
   *
   * With one filtered division that is simply theirs. With "semua divisi" there
   * is no single answer, so it names the company default and says how many
   * divisions depart from it — better than printing 08:00–17:00 as if it applied
   * to everyone when it no longer does.
   */
  const picked = divisions.find((d) => d.division === divFilter) ?? null;
  const shift = resolveShift(picked, cfg);
  const overrides = divisions.filter(
    (d) => d.shiftStart || d.lateToleranceMinutes !== null,
  ).length;
  const shiftDesc =
    picked || overrides === 0
      ? `shift ${shift.start}–${shift.end} · toleransi ${shift.toleranceMinutes} menit`
      : `shift default ${shift.start}–${shift.end} · toleransi ${shift.toleranceMinutes} menit · ${overrides} divisi punya jam sendiri`;

  // Status lives in SQL now: with pagination the page can no longer derive the
  // stat cards or the status filter from the rows it happens to have fetched.
  const statusText = sql`coalesce(${attendance.status}::text, 'belum_absen')`;
  const GROUP_SQL = {
    hadir: sql`${statusText} in ('hadir','wfh')`,
    telat: sql`${statusText} = 'telat'`,
    cuti: sql`${statusText} in ('cuti','izin','sakit')`,
    belum: sql`${statusText} = 'belum_absen'`,
  } as const;

  const divWhere =
    divFilter === "all" ? undefined : eq(employees.division, divFilter);
  const baseWhere = and(eq(employees.active, true), divWhere);
  const groupWhere = GROUP_SQL[statusFilter as keyof typeof GROUP_SQL];
  const boardWhere = and(baseWhere, groupWhere);

  const { page, perPage, offset } = parsePaging(sp);
  const sorting = parseSort(sp, SORTABLE, "nama");
  const orderColumn = sorting.column ?? employees.name;
  const order = sorting.dir === "desc" ? desc(orderColumn) : asc(orderColumn);

  const boardSelect = {
    id: employees.id,
    name: employees.name,
    nik: employees.nik,
    division: employees.division,
    photoUrl: employees.photoUrl,
    attendanceId: attendance.id,
    status: attendance.status,
    clockIn: attendance.clockIn,
    clockOut: attendance.clockOut,
    location: attendance.location,
    selfieUrl: attendance.selfieUrl,
  };
  const [[counts], visibleRaw, [boardTotal], absenteeRows, [absenteeTotal], onLeaveRaw] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
          hadir: sql<number>`count(*) filter (where ${GROUP_SQL.hadir})`.mapWith(Number),
          telat: sql<number>`count(*) filter (where ${GROUP_SQL.telat})`.mapWith(Number),
          cuti: sql<number>`count(*) filter (where ${GROUP_SQL.cuti})`.mapWith(Number),
          belum: sql<number>`count(*) filter (where ${GROUP_SQL.belum})`.mapWith(Number),
        })
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(baseWhere),

      db
        .select(boardSelect)
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(boardWhere)
        .orderBy(order)
        .limit(perPage)
        .offset(offset),

      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(boardWhere),

      db
        .select({ id: employees.id, name: employees.name, division: employees.division })
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(and(baseWhere, GROUP_SQL.belum))
        .orderBy(asc(employees.name))
        .limit(FEED_PAGE),

      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(and(baseWhere, GROUP_SQL.belum)),

      db
        .select({
          id: employees.id,
          name: employees.name,
          division: employees.division,
          location: attendance.location,
          status: attendance.status,
        })
        .from(employees)
        .leftJoin(
          attendance,
          and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
        )
        .where(and(baseWhere, GROUP_SQL.cuti))
        .orderBy(asc(employees.name))
        .limit(50),
    ]);

  const visible = visibleRaw.map((r) => ({
    ...r,
    status: (r.status ?? "belum_absen") as AttStatus,
  }));
  const onLeave = onLeaveRaw.map((r) => ({
    ...r,
    status: (r.status ?? "belum_absen") as AttStatus,
  }));

  // Day detail — queried only while the modal is open, like /karyawan does.
  // An unknown ?open= leaves `detail` null and the list renders as usual.
  const openId = sp.open ? Number(sp.open) : null;
  let detail: DayDetail | null = null;
  if (openId) {
    const [row] = await db
      .select({
        attendanceId: attendance.id,
        employeeId: employees.id,
        name: employees.name,
        nik: employees.nik,
        division: employees.division,
        photoUrl: employees.photoUrl,
        date: attendance.date,
        clockIn: attendance.clockIn,
        clockOut: attendance.clockOut,
        status: attendance.status,
        location: attendance.location,
        selfieUrl: attendance.selfieUrl,
        officeName: officeLocations.name,
        officeLat: officeLocations.lat,
        officeLng: officeLocations.lng,
        officeRadius: officeLocations.radiusM,
      })
      .from(attendance)
      .innerJoin(employees, eq(employees.id, attendance.employeeId))
      // the office this day was punched against — left, because a WFH day and any
      // row from before locations existed simply has none
      .leftJoin(officeLocations, eq(officeLocations.id, attendance.locationId))
      .where(eq(attendance.id, openId))
      .limit(1);

    if (row) {
      const events = await db
        .select({
          id: attendanceEvents.id,
          kind: attendanceEvents.kind,
          at: attendanceEvents.at,
          location: attendanceEvents.location,
          lat: attendanceEvents.lat,
          lng: attendanceEvents.lng,
          photoUrl: attendanceEvents.photoUrl,
          note: attendanceEvents.note,
        })
        .from(attendanceEvents)
        .where(eq(attendanceEvents.attendanceId, openId))
        .orderBy(asc(attendanceEvents.at));

      detail = {
        ...row,
        status: row.status as AttStatus,
        events,
        office: row.officeLat
          ? {
              name: row.officeName!,
              lat: Number(row.officeLat),
              lng: Number(row.officeLng),
              radius: row.officeRadius!,
            }
          : null,
      };
    }
  }

  // Monthly recap — aggregated in SQL so the page stays fast at scale (PRD §9)
  const recap =
    tab === "recap"
      ? await db
          .select({
            id: employees.id,
            name: employees.name,
            division: employees.division,
            hadir: sql<number>`count(*) filter (where ${attendance.status} in ('hadir','wfh'))`.mapWith(Number),
            telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
            cuti: sql<number>`count(*) filter (where ${attendance.status} in ('cuti','izin','sakit'))`.mapWith(Number),
            absen: sql<number>`count(*) filter (where ${attendance.status} = 'belum_absen')`.mapWith(Number),
            hari: sql<number>`count(*)`.mapWith(Number),
          })
          .from(employees)
          .leftJoin(
            attendance,
            and(
              eq(attendance.employeeId, employees.id),
              gte(attendance.date, monthStart),
              lte(attendance.date, date),
            ),
          )
          .where(
            and(
              eq(employees.active, true),
              divFilter === "all" ? undefined : eq(employees.division, divFilter),
            ),
          )
          .groupBy(employees.id, employees.name, employees.division)
          .orderBy(order)
          .limit(perPage)
          .offset(offset)
      : [];

  // the recap groups by employee, so its total is simply the head-count
  const recapTotal = counts.total;

  const base: Search = { date, tab, div: divFilter, status: statusFilter };

  const boardColumns: Column<(typeof visible)[number]>[] = [
    {
      key: "nama",
      header: "Karyawan",
      sortable: true,
      cell: (r) => (
        <Link
          href={
            r.attendanceId
              ? href(base, { open: String(r.attendanceId) })
              : `/karyawan?open=${r.id}`
          }
          scroll={false}
          className="flex items-center gap-2.5 hover:underline"
        >
          <Avatar name={r.name} photoKey={r.photoUrl} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{r.name}</span>
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
      key: "masuk",
      header: "Masuk",
      sortable: true,
      className: "tnum text-[12.5px]",
      cell: (r) => jam(r.clockIn),
    },
    {
      key: "keluar",
      header: "Keluar",
      className: "tnum text-[12.5px]",
      cell: (r) => jam(r.clockOut),
    },
    {
      key: "lokasi",
      header: "Lokasi",
      className: "text-muted-foreground text-[12.5px]",
      cell: (r) =>
        r.location ? (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{r.location}</span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "selfie",
      header: "Selfie",
      cell: (r) => (
        <SelfieCell
          employeeId={r.id}
          name={r.name}
          date={date}
          selfieKey={r.selfieUrl}
          hasAttendance={r.attendanceId !== null}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <AttBadge status={r.status} />,
    },
  ];

  const recapColumns: Column<(typeof recap)[number]>[] = [
    {
      key: "nama",
      header: "Karyawan",
      sortable: true,
      cell: (r) => (
        <>
          <span className="block text-[13px] font-medium">{r.name}</span>
          <span className="text-subtle block text-[11px]">{r.division}</span>
        </>
      ),
    },
    {
      key: "hadir",
      header: "Hadir",
      className: "tnum text-success text-[13px]",
      cell: (r) => r.hadir,
    },
    {
      key: "telat",
      header: "Telat",
      className: "tnum text-warning text-[13px]",
      cell: (r) => r.telat,
    },
    {
      key: "cuti",
      header: "Cuti",
      className: "tnum text-muted-foreground text-[13px]",
      cell: (r) => r.cuti,
    },
    {
      key: "absen",
      header: "Absen",
      className: "tnum text-danger text-[13px]",
      cell: (r) => r.absen,
    },
    {
      key: "tingkat",
      header: "Tingkat kehadiran",
      cell: (r) => {
        const pct = r.hari ? Math.round(((r.hadir + r.telat) / r.hari) * 100) : 0;
        return (
          <div className="flex items-center gap-2.5">
            <div
              className="bg-muted h-1.5 w-full max-w-[120px] overflow-hidden rounded-full"
              role="img"
              aria-label={`Tingkat kehadiran ${pct} persen`}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  pct >= 95 ? "bg-success" : pct >= 85 ? "bg-warning" : "bg-danger",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tnum text-[12.5px] font-semibold">{pct}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHead
        title="Kehadiran Karyawan"
        desc={`${tanggalPanjang(date)} · ${shiftDesc}`}
      >
        <form className="flex items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          {divFilter !== "all" && <input type="hidden" name="div" value={divFilter} />}
          <div>
            <label
              htmlFor="tanggal"
              className="text-muted-foreground mb-1 block text-[11px] font-medium"
            >
              Tanggal
            </label>
            <DateField id="tanggal" name="date" defaultValue={date} autoSubmit />
          </div>
          <a
            href={`/api/export/kehadiran?date=${date}&div=${divFilter}`}
            className="bg-card border-border-strong hover:bg-accent flex h-9 items-center rounded-[9px] border px-3.5 text-[13px] font-medium transition-colors"
          >
            Ekspor
          </a>
        </form>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Total karyawan"
          value={counts.total}
          sub="aktif"
          href={href(base, { status: "all" })}
          active={statusFilter === "all"}
        />
        <Stat
          label="Hadir"
          value={counts.hadir}
          sub="termasuk WFH"
          tone="success"
          href={href(base, { status: "hadir" })}
          active={statusFilter === "hadir"}
        />
        <Stat
          label="Terlambat"
          value={counts.telat}
          sub="lewat toleransi"
          tone="warning"
          href={href(base, { status: "telat" })}
          active={statusFilter === "telat"}
        />
        <Stat
          label="Cuti / izin / sakit"
          value={counts.cuti}
          sub="disetujui"
          href={href(base, { status: "cuti" })}
          active={statusFilter === "cuti"}
        />
        <Stat
          label="Belum absen"
          value={counts.belum}
          sub="perlu diingatkan"
          tone="danger"
          href={href(base, { status: "belum" })}
          active={statusFilter === "belum"}
        />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Panel className="min-w-0 flex-1 basis-[560px]">
          <div className="flex flex-wrap items-center gap-2.5 border-b px-4 py-3">
            <div className="bg-muted flex gap-0.5 rounded-[9px] p-[3px]">
              {(
                [
                  ["today", "Papan hari ini"],
                  ["recap", "Rekap bulanan"],
                ] as const
              ).map(([v, label]) => (
                <Link
                  key={v}
                  href={href(base, { tab: v })}
                  className={cn(
                    "rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    tab === v
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form className="ml-auto flex items-center gap-2">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="tab" value={tab} />
              <input type="hidden" name="status" value={statusFilter} />
              <label htmlFor="div" className="sr-only">
                Filter divisi
              </label>
              <SelectField
                id="div"
                name="div"
                defaultValue={divFilter}
                ariaLabel="Filter divisi"
                autoSubmit
                className="bg-surface-2 data-[size=default]:h-8 rounded-lg text-[12.5px]"
                options={[
                  { value: "all", label: "Semua divisi" },
                  ...divisions.map((d) => ({ value: d.division, label: d.division })),
                ]}
              />
            </form>
          </div>

          {tab === "today" ? (
            <DataTable
              rows={visible}
              columns={boardColumns}
              total={boardTotal.n}
              page={page}
              perPage={perPage}
              path="/kehadiran"
              sp={sp}
              sort={sorting.key}
              dir={sorting.dir}
              minWidth={720}
              empty="Tidak ada data untuk filter ini."
              rowKey={(r) => r.id}
              className="rounded-none border-0 shadow-none"
            />
          ) : (
            <DataTable
              rows={recap}
              columns={recapColumns}
              total={recapTotal}
              page={page}
              perPage={perPage}
              path="/kehadiran"
              sp={sp}
              sort={sorting.key}
              dir={sorting.dir}
              minWidth={720}
              empty="Tidak ada data untuk filter ini."
              rowKey={(r) => r.id}
              className="rounded-none border-0 shadow-none"
            />
          )}
        </Panel>

        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[290px]">
          <AbsenteePanel
            date={date}
            div={divFilter}
            initial={absenteeRows}
            total={absenteeTotal.n}
          />

          <Panel title={`Sedang cuti / izin (${counts.cuti})`}>
            {onLeave.length === 0 ? (
              <Empty>Tidak ada yang cuti hari ini.</Empty>
            ) : (
              <ul className="divide-y">
                {onLeave.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {a.name}
                      </span>
                      <span className="text-subtle block truncate text-[11px]">
                        {a.location ?? a.division}
                      </span>
                    </span>
                    <AttBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {detail && <AttendanceDetail detail={detail} backHref={href(base, {})} />}
    </>
  );
}

