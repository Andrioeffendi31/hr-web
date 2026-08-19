import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, stale } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  employees,
  leaveRequests,
  overtimeRequests,
  settings,
} from "@/db/schema";
import { Shell } from "@/components/shell";
import { type Role } from "@/lib/access";
import { PERUSAHAAN, todayWib } from "@/lib/hr";
import { BERJALAN } from "@/lib/leave";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const today = todayWib();
  const isAdmin = session?.user?.role === "hr_admin";

  // error.tsx cannot catch what its own sibling layout throws, and production
  // redacts error.message on the client — so an unreachable database has to be
  // recognised here, where the real error still exists.
  let cfg;
  let stats;
  let forced;
  try {
    // The settings row is brand, not admin data — every sidebar needs the company
    // name and logo. The five aggregates below it are company-wide counts, so for
    // an employee they are simply never issued: there is nothing to redact if the
    // query never runs, and nothing to forget on the next person's page.
    [[cfg], stats, forced] = await Promise.all([
      db.select().from(settings).limit(1),
      isAdmin ? loadAdminStats(today) : null,
      // Read per request rather than carried in the JWT: the flag clears mid
      // session, and a stale token would keep bouncing somebody who has already
      // chosen a new password. One indexed lookup by primary key.
      session?.user?.id
        ? db
            .select({
              must: employees.mustChangePassword,
              changedAt: employees.passwordChangedAt,
            })
            .from(employees)
            .where(eq(employees.id, Number(session.user.id)))
            .limit(1)
        : null,
    ]);
  } catch (e) {
    return <DatabaseDown error={e as Error} />;
  }

  // A token older than the last password change is spent — the session was ended
  // deliberately, from another device or by HR.
  if (stale(forced?.[0]?.changedAt ?? null, session?.user?.pwdAt))
    redirect("/login?stale=1");

  // One check covering every page in the group: an account still on the shared
  // import password gets no further than the page that replaces it.
  if (forced?.[0]?.must) redirect("/ganti-sandi");

  return (
    <Shell
      badges={
        stats
          ? {
              belumAbsen: stats[0][0].n,
              cutiPending: stats[1][0].n,
              lemburPending: stats[2][0].n,
            }
          : undefined
      }
      liveLabel={
        stats
          ? `${stats[3][0].n} dari ${stats[4][0].n} karyawan sudah absen masuk hari ini.`
          : undefined
      }
      companyName={cfg?.companyName ?? PERUSAHAAN}
      companyLogoUrl={cfg?.companyLogoUrl}
      user={{
        name: session?.user?.name ?? "—",
        position: session?.user?.position ?? "",
        role: (session?.user?.role ?? "employee") as Role,
      }}
    >
      {children}
    </Shell>
  );
}

function loadAdminStats(today: string) {
  return Promise.all([
    db
      .select({ n: count() })
      .from(attendance)
      .where(
        and(eq(attendance.date, today), eq(attendance.status, "belum_absen")),
      ),
    db
      .select({ n: count() })
      .from(leaveRequests)
      .where(inArray(leaveRequests.status, [...BERJALAN])),
    db
      .select({ n: count() })
      .from(overtimeRequests)
      // lembur satu tingkat: ia tidak pernah melewati menunggu_pimpinan
      .where(eq(overtimeRequests.status, "menunggu")),
    // "sudah absen masuk" = anyone with a clock-in, which includes telat and
    // wfh. Counting status='hadir' alone under-reported it.
    db
      .select({ n: count() })
      .from(attendance)
      .where(and(eq(attendance.date, today), isNotNull(attendance.clockIn))),
    db.select({ n: count() }).from(employees).where(eq(employees.active, true)),
  ]);
}

function DatabaseDown({ error }: { error: Error }) {
  const missingSchema = /relation .* does not exist/i.test(error.message);
  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-lg font-semibold">Database tidak dapat dihubungi</h1>
      <p className="text-muted-foreground mt-2 text-[13.5px] leading-relaxed">
        {missingSchema
          ? "Koneksi berhasil, tetapi tabelnya belum ada."
          : "Untuk dev lokal, Postgres berjalan di docker dan mungkin sedang berhenti."}
      </p>
      <pre className="bg-muted mt-3 overflow-x-auto rounded-lg p-3 text-[12.5px]">
        <code>
          {missingSchema
            ? "npm run db:push && npm run db:seed"
            : "npm run db:up"}
        </code>
      </pre>
      <p className="text-subtle mt-2 text-[12px]">
        Di staging atau produksi, periksa{" "}
        <code className="font-mono">DATABASE_URL</code>.
      </p>
      <details className="mt-4">
        <summary className="text-subtle cursor-pointer text-[12px]">
          Detail teknis
        </summary>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-[11.5px] whitespace-pre-wrap">
          <code>{error.message}</code>
        </pre>
      </details>
    </div>
  );
}
