import { and, count, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  employees,
  leaveRequests,
  overtimeRequests,
  settings,
} from "@/db/schema";
import { Shell } from "@/components/shell";
import { todayWib } from "@/lib/hr";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const today = todayWib();

  // error.tsx cannot catch what its own sibling layout throws, and production
  // redacts error.message on the client — so an unreachable database has to be
  // recognised here, where the real error still exists.
  let data;
  try {
    data = await loadShellData(today);
  } catch (e) {
    return <DatabaseDown error={e as Error} />;
  }
  const [belum, cuti, lembur, sudahAbsen, aktif, [cfg]] = data;

  return (
    <Shell
      badges={{
        belumAbsen: belum[0].n,
        cutiPending: cuti[0].n,
        lemburPending: lembur[0].n,
      }}
      liveLabel={`${sudahAbsen[0].n} dari ${aktif[0].n} karyawan sudah absen masuk hari ini.`}
      companyName={cfg?.companyName ?? "PT Nusantara Digital"}
      user={{
        name: session?.user?.name ?? "—",
        position: session?.user?.position ?? "",
      }}
    >
      {children}
    </Shell>
  );
}

function loadShellData(today: string) {
  return Promise.all([
    db
      .select({ n: count() })
      .from(attendance)
      .where(and(eq(attendance.date, today), eq(attendance.status, "belum_absen"))),
    db
      .select({ n: count() })
      .from(leaveRequests)
      .where(eq(leaveRequests.status, "menunggu")),
    db
      .select({ n: count() })
      .from(overtimeRequests)
      .where(eq(overtimeRequests.status, "menunggu")),
    // "sudah absen masuk" = anyone with a clock-in, which includes telat and
    // wfh. Counting status='hadir' alone under-reported it.
    db
      .select({ n: count() })
      .from(attendance)
      .where(and(eq(attendance.date, today), isNotNull(attendance.clockIn))),
    db.select({ n: count() }).from(employees).where(eq(employees.active, true)),
    db.select().from(settings).limit(1),
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
