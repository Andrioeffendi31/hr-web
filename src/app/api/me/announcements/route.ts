import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { announcements, employees } from "@/db/schema";
import { tanggalPendek } from "@/lib/hr";
import { withMe } from "@/lib/me";

/** Read-only feed (PRD-Mobile §6.5), pinned first — same rows the web console
 *  writes, so there is nothing to keep in sync. */
export const GET = withMe(async () => {
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      category: announcements.category,
      pinned: announcements.pinned,
      createdAt: announcements.createdAt,
      author: employees.name,
    })
    .from(announcements)
    .leftJoin(employees, eq(employees.id, announcements.authorId))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
    .limit(50);

  return Response.json({
    items: rows.map((r) => ({
      ...r,
      author: r.author ?? "HR",
      date: tanggalPendek(r.createdAt.toISOString().slice(0, 10)),
    })),
  });
});
