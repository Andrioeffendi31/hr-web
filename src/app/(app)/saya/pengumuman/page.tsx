import { desc, eq } from "drizzle-orm";
import { Pin } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { announcements, employees } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, type Tone } from "@/components/bits";
import { tanggalPanjang } from "@/lib/hr";

export const metadata = { title: "Pengumuman — NanumHR" };

const CATEGORY_TONE: Record<string, Tone> = {
  Kebijakan: "primary",
  Libur: "success",
  Administrasi: "info",
  Pelatihan: "warning",
};

/**
 * The announcement feed, read-only.
 *
 * The admin page is not reused: it carries read-counts, pin buttons and an
 * infinite feed against `/api/feed/[kind]`, all of which are requireAdmin(). One
 * select and a list is less code than stripping those out and safer than
 * accidentally leaving one in.
 */
export default async function PengumumanSayaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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

  return (
    <>
      <PageHead title="Pengumuman" desc="Informasi internal dari tim HR." />

      {rows.length === 0 ? (
        <Panel>
          <Empty>Belum ada pengumuman.</Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((a) => (
            <Panel
              key={a.id}
              className={a.pinned ? "border-primary/40" : undefined}
            >
              <article className="p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {a.pinned && (
                    <span className="text-primary flex items-center gap-1 text-[11px] font-semibold">
                      <Pin className="size-3" aria-hidden />
                      Disematkan
                    </span>
                  )}
                  <Pill tone={CATEGORY_TONE[a.category] ?? "neutral"}>
                    {a.category}
                  </Pill>
                </div>
                <h2 className="text-[14.5px] font-semibold">{a.title}</h2>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed whitespace-pre-line">
                  {a.body}
                </p>
                <p className="text-subtle mt-2.5 text-[11.5px]">
                  {a.author ?? "HR"} ·{" "}
                  {tanggalPanjang(a.createdAt.toISOString().slice(0, 10))}
                </p>
              </article>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
