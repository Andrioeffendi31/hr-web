import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { authenticators, employees } from "@/db/schema";
import { PageHead, Panel, Pill } from "@/components/bits";
import { PasskeyManager } from "./passkey-manager";
import { ContactForm } from "./contact-form";
import { PhotoForm } from "./photo-form";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tanggalTahun, umur } from "@/lib/hr";

export const metadata = { title: "Profil — NanumHR" };

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

  const pribadi: [string, string][] = [
    [
      "Tempat, tanggal lahir",
      me.birthPlace || me.birthDate
        ? [me.birthPlace, tanggalTahun(me.birthDate)].filter(Boolean).join(", ")
        : "—",
    ],
    ["Umur", umur(me.birthDate) === null ? "—" : `${umur(me.birthDate)} tahun`],
    ["Jenis kelamin", me.gender ?? "—"],
    ["Agama", me.religion ?? "—"],
  ];

  const info: [string, string][] = [
    ["NIK", me.nik],
    ["Email kantor", me.email],
    ["Divisi", me.division ?? "—"],
    ["Jabatan", me.position ?? "—"],
    ["Tipe kontrak", me.contractType ?? "—"],
    ["Mulai kerja", tanggalTahun(me.joinedAt)],
    ["Lokasi kerja", me.workLocation],
  ];

  return (
    <>
      <PageHead title="Profil & Keamanan" desc={me.name} />

      {/* Two explicit columns rather than flex-wrap with order overrides: five
          panels of three different widths wrapped into a scattered page, and the
          reading order stopped matching the DOM order. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Data pribadi">
            <Baris rows={pribadi} />
            <p className="text-subtle border-t px-4 py-3 text-[11px] leading-relaxed">
              Data identitas hanya bisa diubah HR — hubungi tim HR kalau ada
              yang keliru.
            </p>
          </Panel>

          <Panel title="Kontak">
            <ContactForm
              initial={{
                phone: me.phone,
                address: me.address,
                emergencyName: me.emergencyName,
                emergencyPhone: me.emergencyPhone,
              }}
            />
          </Panel>

          <Panel title="Kata sandi">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                  {me.passwordChangedAt
                    ? `Terakhir diganti ${tanggalTahun(me.passwordChangedAt.toISOString().slice(0, 10))}.`
                    : "Belum pernah diganti sejak akun dibuat."}
                </p>
                <p className="text-subtle mt-0.5 text-[11px]">
                  Mengganti kata sandi akan mengeluarkan Anda dari perangkat
                  lain.
                </p>
              </div>
              <Button asChild variant="outline" className="shrink-0">
                <Link href="/ganti-sandi">
                  <KeyRound className="size-3.5" aria-hidden />
                  Ganti kata sandi
                </Link>
              </Button>
            </div>
          </Panel>

          <Panel
            title="Passkey"
            action={
              <span className="text-subtle text-[11.5px]">
                {keys.length} perangkat terdaftar
              </span>
            }
          >
            <p className="text-muted-foreground border-b px-4 py-3 text-[12.5px] leading-relaxed">
              Passkey menggantikan kata sandi dengan Touch ID, Face ID, atau
              Windows Hello. Kunci privat tidak pernah meninggalkan perangkat
              Anda, sehingga tidak bisa dicuri lewat phishing.
            </p>
            <PasskeyManager
              passkeys={keys.map((k) => ({
                ...k,
                createdAt: k.createdAt.toISOString(),
                lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
              }))}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Foto profil">
            <PhotoForm name={me.name} photoKey={me.photoUrl} />
          </Panel>

          <Panel title="Data kepegawaian">
            <Baris rows={info} />
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
      </div>
    </>
  );
}

/** Label/value rows, shared by the two read-only panels on this page. */
function Baris({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="px-4 py-1">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 border-b py-2.5 last:border-0"
        >
          <dt className="text-muted-foreground shrink-0 text-[12.5px]">
            {label}
          </dt>
          <dd className="text-right text-[12.5px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
