import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcementReads, announcements, employees } from "@/db/schema";
import { PageHead } from "@/components/bits";
import { FEED_PAGE } from "@/lib/paging";
import { AnnouncementFeed } from "./feed";

export default async function PengumumanPage() {
  // page 1 stays server-rendered; the feed component takes over from page 2
  const [rows, [staff], [total]] = await Promise.all([
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
        reads: sql<number>`(select count(*) from ${announcementReads} where ${announcementReads.announcementId} = ${announcements.id})`.mapWith(Number),
      })
      .from(announcements)
      .leftJoin(employees, eq(employees.id, announcements.authorId))
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(FEED_PAGE),

    db.select({ n: count() }).from(employees),
    db.select({ n: count() }).from(announcements),
  ]);

  return (
    <>
      <PageHead
        title="Pengumuman"
        desc={`${total.n} pengumuman aktif untuk ${staff.n} karyawan`}
      />

      <AnnouncementFeed
        initial={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        initialHasMore={total.n > rows.length}
      />
    </>
  );
}
