/** Annual-leave balance. The formula used to live inline in three pages;
 *  it lives here so /cuti, /karyawan and /laporan can never disagree. */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  employees,
  holidays,
  leaveAdjustments,
  leaveRequests,
  settings,
} from "@/db/schema";
import { collectiveLeaveDays, leaveQuota, remainingLeave, todayWib } from "./hr";

export type LeaveBalance = {
  id: number;
  name: string;
  joinedAt: string;
  quota: number;
  adjustment: number;
  usedRequests: number;
  usedCollective: number;
  used: number;
  remaining: number;
};

/** Holiday dates of a year as a Set, for workingDays() in hr.ts. */
export async function holidaySet(year: number): Promise<Set<string>> {
  const rows = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
  return new Set(rows.map((r) => r.date));
}

/**
 * Balance per active employee for `year`, newest data straight from the DB.
 * Pass `employeeId` to scope it to one person (employee drawer).
 *
 * Cuti bersama is deducted for everyone who had already joined by that date —
 * no individual request is filed for it. Weekend collective days are ignored,
 * matching workingDays().
 */
export async function leaveBalances(
  year: number,
  employeeId?: number,
  paging?: { limit: number; offset: number },
  employeeIds?: number[],
): Promise<LeaveBalance[]> {
  if (employeeIds && employeeIds.length === 0) return [];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [rows, collective, [cfg]] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        joinedAt: employees.joinedAt,
        usedRequests: sql<number>`coalesce(sum(${leaveRequests.days}), 0)`.mapWith(Number),
        adjustment: sql<number>`coalesce(max(${leaveAdjustments.days}), 0)`.mapWith(Number),
      })
      .from(employees)
      .leftJoin(
        leaveRequests,
        and(
          eq(leaveRequests.employeeId, employees.id),
          eq(leaveRequests.type, "Cuti Tahunan"),
          eq(leaveRequests.status, "disetujui"),
          gte(leaveRequests.startDate, yearStart),
          lte(leaveRequests.startDate, yearEnd),
        ),
      )
      .leftJoin(
        leaveAdjustments,
        and(
          eq(leaveAdjustments.employeeId, employees.id),
          eq(leaveAdjustments.year, year),
        ),
      )
      .where(
        employeeIds
          ? inArray(employees.id, employeeIds)
          : employeeId
            ? eq(employees.id, employeeId)
            : eq(employees.active, true),
      )
      .groupBy(employees.id, employees.name, employees.joinedAt)
      .orderBy(employees.name)
      .limit(paging?.limit ?? 1000)
      .offset(paging?.offset ?? 0),

    db
      .select({ date: holidays.date })
      .from(holidays)
      .where(
        and(
          eq(holidays.collective, true),
          gte(holidays.date, yearStart),
          lte(holidays.date, yearEnd),
        ),
      ),

    db.select({ baseLeaveQuota: settings.baseLeaveQuota }).from(settings).limit(1),
  ]);

  const collectiveDates = collective.map((c) => c.date);
  // Tenure is counted as of today for the running year, year-end for past years.
  const now = todayWib();
  const asOf = now.slice(0, 4) === String(year) ? now : yearEnd;

  return rows.map((r) => {
    const quota = leaveQuota(r.joinedAt, asOf, cfg?.baseLeaveQuota ?? 12);
    const usedCollective = collectiveLeaveDays(r.joinedAt, collectiveDates);
    return {
      ...r,
      quota,
      usedCollective,
      used: r.usedRequests + usedCollective,
      remaining: remainingLeave(quota, r.adjustment, r.usedRequests, usedCollective),
    };
  });
}

/** Attach each requester's remaining balance — one query for the whole page,
 *  scoped to the employees actually on it (not a full-table scan). */
export async function withRemaining<T extends { employeeId: number }>(
  rows: T[],
  year: number,
): Promise<(T & { remaining: number | null })[]> {
  const ids = [...new Set(rows.map((r) => r.employeeId))];
  const balances = await leaveBalances(year, undefined, undefined, ids);
  const map = new Map(balances.map((b) => [b.id, b.remaining]));
  return rows.map((r) => ({ ...r, remaining: map.get(r.employeeId) ?? null }));
}
