import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { authenticators, employees } from "@/db/schema";
import { PageHead, Panel, Pill } from "@/components/bits";
import { PasskeyManager } from "./passkey-manager";
import { tanggalPendek } from "@/lib/hr";

export const metadata = { title: "Profil — Ruang HR" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const employeeId = Number(session.user.id);

  const [[me], keys] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, employeeId)).limit(1),
    db
      .select({
        id: authenticators.id,
        label: authenticators.label,
        deviceType: authenticators.deviceType,
        backedUp: authenticators.backedUp,
        createdAt: authenticators.createdAt,
        lastUsedAt: authenticators.lastUsedAt,
      })
      .from(authenticators)
      .where(eq(authenticators.employeeId, employeeId))
      .orderBy(desc(authenticators.createdAt)),
  ]);

  if (!me) redirect("/login");

  const info: [string, string][] = [
    ["NIK", me.nik],
    ["Email kantor", me.email],
    ["Divisi", me.division],
    ["Jabatan", me.position],
    ["Tipe kontrak", me.contractType],
    ["Mulai kerja", `${tanggalPendek(me.joinedAt)} ${me.joinedAt.slice(0, 4)}`],
    ["Lokasi kerja", me.workLocation],
  ];

  return (
    <>
      <PageHead title="Profil & Keamanan" desc={me.name} />

      <div className="flex flex-wrap items-start gap-4">
        <Panel
          title="Passkey"
          className="min-w-0 flex-1 basis-[520px]"
          action={
            <span className="text-subtle text-[11.5px]">
              {keys.length} perangkat terdaftar
            </span>
          }
        >
          <p className="text-muted-foreground border-b px-4 py-3 text-[12.5px] leading-relaxed">
            Passkey menggantikan kata sandi dengan Touch ID, Face ID, atau
            Windows Hello. Kunci privat tidak pernah meninggalkan perangkat Anda,
            sehingga tidak bisa dicuri lewat phishing.
          </p>
          <PasskeyManager
            passkeys={keys.map((k) => ({
              ...k,
              createdAt: k.createdAt.toISOString(),
              lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            }))}
          />
        </Panel>

        <Panel title="Data kepegawaian" className="w-full shrink-0 lg:w-[320px]">
          <dl className="px-4 py-1">
            {info.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0"
              >
                <dt className="text-muted-foreground text-[12.5px]">{label}</dt>
                <dd className="truncate text-right text-[12.5px] font-medium">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
            <span className="text-muted-foreground text-[12.5px]">Peran</span>
            <Pill tone="primary">
              {me.role === "hr_admin"
                ? "HR Admin"
                : me.role === "manager"
                  ? "Atasan"
                  : "Karyawan"}
            </Pill>
          </div>
        </Panel>
      </div>
    </>
  );
}
