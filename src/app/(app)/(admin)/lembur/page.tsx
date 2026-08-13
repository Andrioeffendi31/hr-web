import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, overtimeRequests, settings } from "@/db/schema";
import { PageHead, Pill, ReqBadge, Stat } from "@/components/bits";
import { DataTable, type Column } from "@/components/data-table";
import { DecideButtons } from "@/components/decide-buttons";
import { durasi, initials, jam, tanggalPendek, todayWib } from "@/lib/hr";
import { parsePaging, parseSort } from "@/lib/paging";

type Search = { page?: string; perPage?: string; sort?: string; dir?: string };

const SORTABLE = {
  tanggal: overtimeRequests.date,
  nama: employees.name,
  durasi: overtimeRequests.minutes,
  status: overtimeRequests.status,
};

export default async function LemburPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [cfg] = await db.select().from(settings).limit(1);

  const { page, perPage, offset } = parsePaging(sp);
  const sorting = parseSort(sp, SORTABLE, "tanggal");
  const orderColumn = sorting.column ?? overtimeRequests.date;
  // newest-first stays the default; an explicit ?dir wins
  const order =
    sorting.key === "tanggal" && !sp.dir
      ? desc(overtimeRequests.date)
      : sorting.dir === "desc"
        ? desc(orderColumn)
        : asc(orderColumn);

  const [rows, pending, month, [totalRow]] = await Promise.all([
    db
      .select({
        id: overtimeRequests.id,
        date: overtimeRequests.date,
        startTime: overtimeRequests.startTime,
        endTime: overtimeRequests.endTime,
        minutes: overtimeRequests.minutes,
        kind: overtimeRequests.kind,
        reason: overtimeRequests.reason,
        status: overtimeRequests.status,
        decisionNote: overtimeRequests.decisionNote,
        name: employees.name,
        employeeId: employees.id,
        division: employees.division,
      })
      .from(overtimeRequests)
      .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
      .orderBy(order)
      .limit(perPage)
      .offset(offset),

    db
      .select({ n: count() })
      .from(overtimeRequests)
      .where(eq(overtimeRequests.status, "menunggu")),

    db
      .select({
        minutes:
          sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(
            Number,
          ),
        people:
          sql<number>`count(distinct ${overtimeRequests.employeeId})`.mapWith(
            Number,
          ),
      })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.status, "disetujui"),
          gte(overtimeRequests.date, monthStart),
        ),
      ),

    db.select({ n: count() }).from(overtimeRequests),
  ]);

  const total = totalRow.n;
  const hours = Math.round(month[0].minutes / 60);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "nama",
      header: "Karyawan",
      sortable: true,
      className: "align-top py-3",
      cell: (r) => (
        <>
          <div className="flex items-center gap-2.5">
            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold">
              {initials(r.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {r.name}
              </span>
              <span className="text-subtle block text-[11px]">
                {r.division ?? "Tanpa divisi"}
              </span>
            </span>
          </div>
          <p className="text-muted-foreground mt-1.5 max-w-[220px] text-[11.5px] leading-snug">
            {r.reason}
          </p>
          {r.decisionNote && (
            <p className="text-danger mt-1 max-w-[220px] text-[11.5px]">
              {r.decisionNote}
            </p>
          )}
        </>
      ),
    },
    {
      key: "tanggal",
      header: "Tanggal",
      sortable: true,
      className: "tnum align-top py-3 text-[12.5px]",
      cell: (r) => tanggalPendek(r.date),
    },
    {
      key: "jam",
      header: "Jam",
      className: "tnum align-top py-3 text-[12.5px]",
      cell: (r) => `${jam(r.startTime)}–${jam(r.endTime)}`,
    },
    {
      key: "durasi",
      header: "Durasi",
      sortable: true,
      className: "tnum align-top py-3 text-[12.5px] font-medium",
      cell: (r) => durasi(r.minutes),
    },
    {
      key: "tipe",
      header: "Tipe",
      className: "align-top py-3",
      cell: (r) => (
        <Pill tone={r.kind === "Hari libur" ? "info" : "neutral"}>
          {r.kind}
        </Pill>
      ),
    },
    {
      key: "status",
      header: "Aksi",
      sortable: true,
      className: "align-top py-3",
      cell: (r) =>
        r.status === "menunggu" ? (
          <DecideButtons kind="lembur" id={r.id} name={r.name} />
        ) : (
          <ReqBadge status={r.status} />
        ),
    },
  ];

  return (
    <>
      <PageHead
        title="Lembur"
        desc={`Pencatatan jam lembur · batas ${cfg.weeklyOvertimeCapHours} jam/minggu`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Menunggu persetujuan"
          value={pending[0].n}
          sub="pengajuan"
          tone="warning"
        />
        <Stat
          label="Jam lembur bulan ini"
          value={hours}
          sub={`jam · ${month[0].people} karyawan`}
        />
      </div>

      <DataTable
        title="Semua pengajuan lembur"
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        perPage={perPage}
        path="/lembur"
        sp={sp}
        sort={sorting.key}
        dir={sorting.dir}
        minWidth={760}
        empty="Belum ada pengajuan lembur."
        rowKey={(r) => r.id}
      />
    </>
  );
}
