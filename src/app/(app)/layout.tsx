import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, stale } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { Shell } from "@/components/shell";
import { type Role } from "@/lib/access";
import { PERUSAHAAN, todayWib } from "@/lib/hr";
import { BERJALAN } from "@/lib/leave";
import { bacaSettings } from "@/lib/settings";

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
    [cfg, stats, forced] = await Promise.all([
      bacaSettings(),
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
              belumAbsen: stats.belumAbsen,
              cutiPending: stats.cutiPending,
              lemburPending: stats.lemburPending,
            }
          : undefined
      }
      liveLabel={
        stats
          ? `${stats.masuk} dari ${stats.aktif} karyawan sudah absen masuk hari ini.`
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

/**
 * Lima angka untuk sidebar — satu perjalanan, bukan lima.
 *
 * Dulu lima `count()` terpisah di dalam Promise.all. Pekerjaannya di basis data
 * sama saja, tapi perjalanannya lima kali, dan ini berjalan di SETIAP halaman
 * konsol. Lewat jaringan ke Neon itu empat penantian yang tidak membeli apa pun;
 * sebagai subkueri skalar dalam satu SELECT, jawabannya datang sekaligus.
 *
 * "sudah absen masuk" = siapa pun yang punya jam masuk, termasuk telat dan wfh.
 * Menghitung status='hadir' saja dulu melaporkannya terlalu sedikit.
 */
async function loadAdminStats(today: string) {
  const { rows } = await db.execute(sql`select
    (select count(*) from ${attendance}
      where ${attendance.date} = ${today}
        and ${attendance.status} = 'belum_absen') as belum,
    (select count(*) from ${leaveRequests}
      where ${leaveRequests.status} in (${sql.join(
        BERJALAN.map((v) => sql`${v}`),
        sql`, `,
      )})) as cuti,
    -- lembur satu tingkat: ia tidak pernah melewati menunggu_pimpinan
    (select count(*) from ${overtimeRequests}
      where ${overtimeRequests.status} = 'menunggu') as lembur,
    (select count(*) from ${attendance}
      where ${attendance.date} = ${today}
        and ${attendance.clockIn} is not null) as masuk,
    (select count(*) from ${employees}
      where ${employees.active}) as aktif`);

  const r = rows[0] as Record<string, string | number>;
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    belumAbsen: n("belum"),
    cutiPending: n("cuti"),
    lemburPending: n("lembur"),
    masuk: n("masuk"),
    aktif: n("aktif"),
  };
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
