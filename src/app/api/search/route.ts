import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { todayWib } from "@/lib/hr";

const LIMIT = 8;

export type SearchHit = {
  id: number;
  name: string;
  nik: string;
  division: string | null;
  position: string | null;
  active: boolean;
  status: string;
  pendingCuti: number;
  pendingLembur: number;
};

/** Employee lookup for the header search modal. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ hits: [] satisfies SearchHit[] });

  // escape LIKE wildcards so "%" typed by the user matches literally
  const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const today = todayWib();

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      nik: employees.nik,
      division: employees.division,
      position: employees.position,
      active: employees.active,
      status: attendance.status,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(eq(attendance.employeeId, employees.id), eq(attendance.date, today)),
    )
    .where(
      or(
        ilike(employees.name, term),
        ilike(employees.nik, term),
        ilike(employees.division, term),
        ilike(employees.position, term),
      ),
    )
    // exact-ish prefix matches first, then alphabetical
    .orderBy(sql`(${employees.name} ilike ${q + "%"}) desc`, employees.name)
    .limit(LIMIT);

  if (rows.length === 0)
    return Response.json({ hits: [] satisfies SearchHit[] });

  const ids = rows.map((r) => r.id);
  const [cuti, lembur] = await Promise.all([
    db
      .select({
        employeeId: leaveRequests.employeeId,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.employeeId, ids),
          eq(leaveRequests.status, "menunggu"),
        ),
      )
      .groupBy(leaveRequests.employeeId),
    db
      .select({
        employeeId: overtimeRequests.employeeId,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(overtimeRequests)
      .where(
        and(
          inArray(overtimeRequests.employeeId, ids),
          eq(overtimeRequests.status, "menunggu"),
        ),
      )
      .groupBy(overtimeRequests.employeeId),
  ]);

  const hits: SearchHit[] = rows.map((r) => ({
    ...r,
    status: r.status ?? "belum_absen",
    pendingCuti: cuti.find((c) => c.employeeId === r.id)?.n ?? 0,
    pendingLembur: lembur.find((o) => o.employeeId === r.id)?.n ?? 0,
  }));

  return Response.json({ hits });
}
