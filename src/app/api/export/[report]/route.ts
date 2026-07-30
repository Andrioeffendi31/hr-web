import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  auditLog,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { ATT_LABEL, durasi, jam, todayWib } from "@/lib/hr";

/** Excel-safe CSV: BOM so Excel reads UTF-8, CRLF line endings, quotes doubled. */
function toCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return "﻿" + lines.join("\r\n");
}

const REPORTS = new Set([
  "kehadiran",
  "keterlambatan",
  "cuti",
  "lembur",
  "divisi",
  "karyawan",
]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ report: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const { report } = await ctx.params;
  if (!REPORTS.has(report)) {
    return Response.json({ error: "Laporan tidak dikenal" }, { status: 404 });
  }

  const url = new URL(req.url);
  const today = todayWib();
  const date = url.searchParams.get("date") ?? today;
  const from = url.searchParams.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") ?? today;
  const div = url.searchParams.get("div");
  const divWhere = div && div !== "all" ? eq(employees.division, div) : undefined;

  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];
  let filename = `${report}-${from}-${to}.csv`;

  if (report === "kehadiran") {
    filename = `kehadiran-${date}.csv`;
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        position: employees.position,
        clockIn: attendance.clockIn,
        clockOut: attendance.clockOut,
        status: attendance.status,
        location: attendance.location,
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)),
      )
      .where(and(eq(employees.active, true), divWhere))
      .orderBy(asc(employees.name));

    headers = ["NIK", "Nama", "Divisi", "Jabatan", "Masuk", "Keluar", "Status", "Lokasi"];
    rows = data.map((r) => [
      r.nik,
      r.name,
      r.division,
      r.position,
      jam(r.clockIn),
      jam(r.clockOut),
      ATT_LABEL[(r.status ?? "belum_absen") as keyof typeof ATT_LABEL],
      r.location ?? "",
    ]);
  }

  if (report === "keterlambatan") {
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
        hari: sql<number>`count(${attendance.id})`.mapWith(Number),
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(
          eq(attendance.employeeId, employees.id),
          gte(attendance.date, from),
          lte(attendance.date, to),
        ),
      )
      .where(and(eq(employees.active, true), divWhere))
      .groupBy(employees.id, employees.nik, employees.name, employees.division)
      .orderBy(asc(employees.name));

    headers = ["NIK", "Nama", "Divisi", "Jumlah terlambat", "Hari tercatat"];
    rows = data.map((r) => [r.nik, r.name, r.division, r.telat, r.hari]);
  }

  if (report === "cuti") {
    const delegate = alias(employees, "delegate");
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        status: leaveRequests.status,
        reason: leaveRequests.reason,
        delegateName: delegate.name,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
      .where(
        and(
          gte(leaveRequests.startDate, from),
          lte(leaveRequests.startDate, to),
          divWhere,
        ),
      )
      .orderBy(asc(leaveRequests.startDate));

    headers = [
      "NIK", "Nama", "Divisi", "Jenis", "Mulai", "Selesai",
      "Hari kerja", "Status", "Pengganti", "Alasan",
    ];
    rows = data.map((r) => [
      r.nik, r.name, r.division, r.type, r.startDate, r.endDate,
      r.days, r.status, r.delegateName ?? "", r.reason,
    ]);
  }

  if (report === "lembur") {
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        date: overtimeRequests.date,
        startTime: overtimeRequests.startTime,
        endTime: overtimeRequests.endTime,
        minutes: overtimeRequests.minutes,
        kind: overtimeRequests.kind,
        cost: overtimeRequests.estimatedCost,
        status: overtimeRequests.status,
      })
      .from(overtimeRequests)
      .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
      .where(
        and(gte(overtimeRequests.date, from), lte(overtimeRequests.date, to), divWhere),
      )
      .orderBy(asc(overtimeRequests.date));

    headers = [
      "NIK", "Nama", "Divisi", "Tanggal", "Mulai", "Selesai",
      "Durasi", "Tipe", "Estimasi biaya (Rp)", "Status",
    ];
    rows = data.map((r) => [
      r.nik, r.name, r.division, r.date, jam(r.startTime), jam(r.endTime),
      durasi(r.minutes), r.kind, r.cost, r.status,
    ]);
  }

  if (report === "divisi") {
    const data = await db
      .select({
        division: employees.division,
        hadir: sql<number>`count(*) filter (where ${attendance.status} in ('hadir','wfh'))`.mapWith(Number),
        telat: sql<number>`count(*) filter (where ${attendance.status} = 'telat')`.mapWith(Number),
        cuti: sql<number>`count(*) filter (where ${attendance.status} in ('cuti','izin','sakit'))`.mapWith(Number),
        absen: sql<number>`count(*) filter (where ${attendance.status} = 'belum_absen')`.mapWith(Number),
        hari: sql<number>`count(${attendance.id})`.mapWith(Number),
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(
          eq(attendance.employeeId, employees.id),
          gte(attendance.date, from),
          lte(attendance.date, to),
        ),
      )
      .where(eq(employees.active, true))
      .groupBy(employees.division)
      .orderBy(asc(employees.division));

    headers = ["Divisi", "Hadir", "Terlambat", "Cuti/izin/sakit", "Tidak absen", "Tingkat kehadiran (%)"];
    rows = data.map((r) => [
      r.division,
      r.hadir,
      r.telat,
      r.cuti,
      r.absen,
      r.hari ? Math.round(((r.hadir + r.telat) / r.hari) * 100) : 0,
    ]);
  }

  if (report === "karyawan") {
    const manager = alias(employees, "manager");
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        email: employees.email,
        division: employees.division,
        position: employees.position,
        contractType: employees.contractType,
        joinedAt: employees.joinedAt,
        workLocation: employees.workLocation,
        managerName: manager.name,
        active: employees.active,
      })
      .from(employees)
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(divWhere)
      .orderBy(asc(employees.name));

    headers = [
      "NIK", "Nama", "Email", "Divisi", "Jabatan", "Tipe kontrak",
      "Mulai kerja", "Lokasi kerja", "Atasan langsung", "Status",
    ];
    rows = data.map((r) => [
      r.nik, r.name, r.email, r.division, r.position, r.contractType,
      r.joinedAt, r.workLocation, r.managerName ?? "", r.active ? "Aktif" : "Tidak aktif",
    ]);
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "report.export",
    entity: report,
    detail: `${rows.length} baris · ${filename}`,
  });

  return new Response(toCsv(headers, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
