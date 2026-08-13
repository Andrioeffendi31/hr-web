import { redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { canAccess, homeFor, type Role } from "@/lib/access";
import { LoginForm } from "./login-form";
import loginBanner from "../../../public/images/nanumhr-login-banner.png";

export const metadata = { title: "Masuk — NanumHR" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; stale?: string }>;
}) {
  const { next, error, stale } = await searchParams;
  const session = await auth();

  // only allow same-origin paths back, so ?next= can't be used for redirects off-site
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  // every signed-in role is sent away, not just admins — an employee used to be
  // left sitting on the login page, and signing in again just bounced them back
  // `stale` means the (app) layout just refused this very cookie. Bouncing a
  // signed-in user away from /login is right in every other case; here it would
  // send them back to the page that rejected them, forever.
  if (session?.user && !stale) {
    const role = session.user.role as Role;
    redirect(safeNext && canAccess(safeNext, role) ? safeNext : homeFor(role));
  }

  // "/" resolves the role server-side once the cookie exists, so the form no
  // longer has to guess a destination before knowing who is signing in
  const target = safeNext ?? "/";

  const initialError =
    error === "invalid" ? "Email atau kata sandi salah." : undefined;

  const brand = (
    <div className="flex items-center gap-2.5">
      <Image
        src="/images/nanumhr-logo.png"
        alt="Logo NanumHR"
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-[10px] shadow-sm"
      />
      <div>
        <div className="font-heading text-base font-bold tracking-tight">
          Nanum<span className="text-subtle font-semibold">HR</span>
        </div>
        <div className="text-subtle font-mono text-[10.5px]">
          PT. NANUM INDAH SEJATI · 나눔컨설팅
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden min-h-dvh overflow-hidden border-r lg:block">
        <Image
          src={loginBanner}
          alt="Tim Nanum berkolaborasi di ruang kerja"
          fill
          priority
          sizes="52vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,247,243,0.94)_0%,rgba(248,247,243,0.38)_35%,rgba(18,39,73,0.06)_62%,rgba(18,39,73,0.72)_100%)]" />

        <div className="absolute inset-0 flex flex-col justify-between p-10">
          {brand}
          <div className="max-w-[420px] text-white [text-shadow:0_1px_16px_rgba(18,39,73,0.24)]">
            <p className="mb-3 font-mono text-[11px] tracking-[0.16em] text-white/75 uppercase">
              Satu tim, satu ruang kerja
            </p>
            <h1 className="text-[28px] leading-[1.18] font-semibold tracking-tight">
              Kerja terasa lebih dekat ketika semuanya terhubung.
            </h1>
            <p className="mt-3 max-w-[390px] text-[13.5px] leading-relaxed text-white/80">
              Kehadiran, cuti, lembur, dan data karyawan tersusun rapi untuk
              seluruh tim Nanum.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <div className="relative mb-6 aspect-[2/1] overflow-hidden rounded-2xl border shadow-sm">
              <Image
                src={loginBanner}
                alt="Tim Nanum berkolaborasi di ruang kerja"
                fill
                priority
                sizes="(max-width: 1023px) 380px, 0px"
                className="object-cover object-[center_62%]"
              />
            </div>
            {brand}
          </div>

          <h2 className="font-heading text-xl font-semibold tracking-tight">
            Masuk ke NanumHR
          </h2>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Gunakan passkey perangkat Anda, atau email dan kata sandi kantor.
          </p>

          <div className="mt-7">
            <LoginForm next={target} initialError={initialError} />
          </div>

          {process.env.VERCEL_ENV !== "production" && (
            <p className="text-subtle mt-6 border-t pt-4 text-[11.5px] leading-relaxed">
              Demo (non-produksi):{" "}
              <span className="font-mono">
                andini.rahmawati@nanumindahsejati.co.id
              </span>{" "}
              / <span className="font-mono">securePass123</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
