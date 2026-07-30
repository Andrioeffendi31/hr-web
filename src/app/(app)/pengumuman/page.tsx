import { count, desc, eq, sql } from "drizzle-orm";
import { Megaphone } from "lucide-react";
import { db } from "@/db";
import { announcementReads, announcements, employees } from "@/db/schema";
import { Empty, PageHead, Panel, Pill, type Tone } from "@/components/bits";
import { PinButton } from "./pin-button";

const CAT_TONE: Record<string, Tone> = {
  Kebijakan: "primary",
  Libur: "success",
  Administrasi: "info",
  Pelatihan: "warning",
};

export default async function PengumumanPage() {
  const rows = await db
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
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt));

  const [staff] = await db.select({ n: count() }).from(employees);

  return (
    <>
      <PageHead
        title="Pengumuman"
        desc={`${rows.length} pengumuman aktif untuk ${staff.n} karyawan`}
      />

      {rows.length === 0 ? (
        <Panel>
          <Empty>Belum ada pengumuman.</Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((a) => {
            const tone = CAT_TONE[a.category] ?? "neutral";
            return (
              <article
                key={a.id}
                className={`bg-card rounded-[13px] border p-4 shadow-sm ${a.pinned ? "border-primary/45" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ${
                      { primary: "bg-primary-subtle text-primary", success: "bg-success-subtle text-success", info: "bg-info-subtle text-info", warning: "bg-warning-subtle text-warning", danger: "bg-danger-subtle text-danger", neutral: "bg-muted text-muted-foreground" }[tone]
                    }`}
                  >
                    <Megaphone className="size-[17px]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[14.5px] font-semibold">{a.title}</h2>
                      <Pill tone={tone}>{a.category}</Pill>
                      {a.pinned && <Pill tone="primary">Disematkan</Pill>}
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">
                      {a.body}
                    </p>
                    <p className="text-subtle mt-2.5 text-[11.5px]">
                      {a.author ?? "HR"} ·{" "}
                      {a.createdAt.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      · {a.audience} · dibaca {a.reads} orang
                    </p>
                  </div>
                  <PinButton id={a.id} pinned={a.pinned} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
