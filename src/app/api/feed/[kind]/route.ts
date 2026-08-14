import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  announcementReads,
  announcements,
  attendance,
  employees,
  leaveRequests,
} from "@/db/schema";
import { todayWib } from "@/lib/hr";
import { statusHarianSql } from "@/lib/kehadiran";
import { holidaySet, leaveBalances, withRemaining } from "@/lib/leave";
import { FEED_PAGE } from "@/lib/paging";

/**
 * Pages for the infinite-scroll feeds. One route so `requireAdmin` and the
 * `{ items, nextPage }` shape are enforced in a single place instead of being
 * copy-pasted across four endpoints. Each page also renders its own first page
 * server-side; this only serves page 2 and beyond.
 */
const query = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  status: z
    .enum(["menunggu", "revisi", "disetujui", "ditolak", "dibatalkan"])
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  div: z.string().max(80).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

type Params = z.infer<typeof query> & { limit: number; offset: number };

const FEEDS = {
  pengumuman: async ({ limit, offset }: Params) =>
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        category: announcements.category,
        audience: announcements.audience,
        pinned: announcements.pinned,
        createdAt: announcements.createdAt,
        author: employees.name,
        reads:
          sql<number>`(select count(*) from ${announcementReads} where ${announcementReads.announcementId} = ${announcements.id})`.mapWith(
            Number,
          ),
      })
      .from(announcements)
      .leftJoin(employees, eq(employees.id, announcements.authorId))
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(limit)
      .offset(offset),

  cuti: async ({ limit, offset, status, year }: Params) => {
    const delegate = alias(employees, "delegate");
    const rows = await db
      .select({
        id: leaveRequests.id,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        decisionNote: leaveRequests.decisionNote,
        createdAt: leaveRequests.createdAt,
        attachmentKey: leaveRequests.attachmentKey,
        attachmentName: leaveRequests.attachmentName,
        attachmentSize: leaveRequests.attachmentSize,
        name: employees.name,
        division: employees.division,
        joinedAt: employees.joinedAt,
        employeeId: employees.id,
        delegateName: delegate.name,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
      .where(eq(leaveRequests.status, status ?? "menunggu"))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return withRemaining(rows, year ?? Number(todayWib().slice(0, 4)));
  },

  saldo: async ({ limit, offset, year }: Params) =>
    leaveBalances(year ?? Number(todayWib().slice(0, 4)), undefined, {
      limit,
      offset,
    }),

  /**
   * Siapa yang belum absen — dipakai panel "Ingatkan" di papan kehadiran.
   *
   * Dulu berisi salinan SQL status milik sendiri, dan salinan itu tidak tahu apa
   * pun soal cuti: karyawan yang cutinya sudah disetujui ikut terdaftar di sini
   * dan ikut menerima pengingat absen. Sekarang memakai aturan yang sama dengan
   * papan (lib/kehadiran.ts), jadi yang sedang cuti tersaring dengan sendirinya.
   */
  "belum-absen": async ({ limit, offset, date, div }: Params) => {
    const hariIni = todayWib();
    const tanggal = date ?? hariIni;
    const libur = await holidaySet(Number(tanggal.slice(0, 4)));
    const status = statusHarianSql(tanggal, hariIni, libur);
    return db
      .select({
        id: employees.id,
        name: employees.name,
        division: employees.division,
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(
          eq(attendance.employeeId, employees.id),
          eq(attendance.date, tanggal),
        ),
      )
      .where(
        and(
          eq(employees.active, true),
          div && div !== "all" ? eq(employees.division, div) : undefined,
          // tanggal lampau tidak lagi menghasilkan "belum_absen", jadi kedua ember
          // disebut: panel ini tetap berguna untuk menindaklanjuti hari kemarin
          sql`${status} in ('belum_absen','tanpa_keterangan')`,
        ),
      )
      .orderBy(asc(employees.name))
      .limit(limit)
      .offset(offset);
  },
} as const;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const { kind } = await ctx.params;
  const feed = Object.prototype.hasOwnProperty.call(FEEDS, kind)
    ? FEEDS[kind as keyof typeof FEEDS]
    : null;
  if (!feed)
    return Response.json({ error: "Feed tidak dikenal" }, { status: 404 });

  const url = new URL(req.url);
  const parsed = query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const page = parsed.data.page;
  // fetch one extra row: cheaper than a second count() just to know if more exist
  const limit = FEED_PAGE + 1;
  const items = await feed({
    ...parsed.data,
    limit,
    offset: (page - 1) * FEED_PAGE,
  });

  const hasMore = items.length > FEED_PAGE;
  return Response.json({
    items: hasMore ? items.slice(0, FEED_PAGE) : items,
    nextPage: hasMore ? page + 1 : null,
  });
}
