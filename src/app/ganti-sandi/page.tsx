import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { employees } from "@/db/schema";
import Link from "next/link";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Ganti kata sandi — NanumHR" };

/**
 * Deliberately outside the `(app)` route group.
 *
 * That layout is what redirects here while `mustChangePassword` is set, so a page
 * inside it would redirect to itself. Being outside also means no sidebar: an
 * account that still has the shared import password should not be walking around
 * the app, and hiding the navigation says so more clearly than a banner.
 */
export default async function GantiSandiPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [me] = await db
    .select({
      name: employees.name,
      email: employees.email,
      mustChangePassword: employees.mustChangePassword,
    })
    .from(employees)
    .where(eq(employees.id, Number(session.user.id)))
    .limit(1);
  if (!me) redirect("/login");

  return (
    <main className="bg-surface-2 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-[420px] rounded-[14px] border p-6 shadow-sm">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">
          {me.mustChangePassword ? "Buat kata sandi baru" : "Ganti kata sandi"}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
          {me.mustChangePassword
            ? "Akun Anda masih memakai kata sandi sementara yang dibagikan HR. Buat kata sandi sendiri untuk melanjutkan."
            : "Pilih kata sandi baru untuk akun Anda."}
        </p>
        <p className="text-subtle mt-1 text-[11.5px]">{me.email}</p>

        <PasswordForm
          requireCurrent={!me.mustChangePassword}
          email={me.email}
        />

        {/* No shell on this page, so without this there is no way back except the
            browser's own button. Hidden while the change is mandatory — there is
            nowhere to go until it is done. */}
        {!me.mustChangePassword && (
          <Link
            href="/profil"
            className="text-muted-foreground hover:text-foreground mt-4 block text-center text-[12.5px]"
          >
            Kembali ke profil
          </Link>
        )}
      </div>
    </main>
  );
}
