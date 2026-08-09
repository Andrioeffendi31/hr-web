import { redirect } from "next/navigation";
import { CalendarCheck, Fingerprint, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { canAccess, homeFor, type Role } from "@/lib/access";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk — Ruang HR" };

const HIGHLIGHTS = [
  {
    icon: CalendarCheck,
    title: "Kehadiran, cuti, dan lembur dalam satu papan",
    body: "Setujui pengajuan dan pantau absensi harian tanpa berpindah aplikasi.",
  },
  {
    icon: Fingerprint,
    title: "Masuk tanpa kata sandi",
    body: "Daftarkan passkey sekali, lalu cukup Touch ID, Face ID, atau Windows Hello.",
  },
  {
    icon: ShieldCheck,
    title: "Siap audit",
    body: "Setiap persetujuan tercatat lengkap dengan pelaku dan waktunya.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const session = await auth();

  // only allow same-origin paths back, so ?next= can't be used for redirects off-site
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  // every signed-in role is sent away, not just admins — an employee used to be
  // left sitting on the login page, and signing in again just bounced them back
  if (session?.user) {
    const role = session.user.role as Role;
    redirect(safeNext && canAccess(safeNext, role) ? safeNext : homeFor(role));
  }

  // "/" resolves the role server-side once the cookie exists, so the form no
  // longer has to guess a destination before knowing who is signing in
  const target = safeNext ?? "/";

  const initialError = error === "invalid" ? "Email atau kata sandi salah." : undefined;

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="bg-primary flex size-9 shrink-0 items-center justify-center rounded-[10px] shadow-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4H13a5 5 0 0 1 1.4 9.8L19 20h-3.4l-4-6H8v6H5Z"
            fill="#fff"
          />
        </svg>
      </div>
      <div>
        <div className="font-heading text-base font-bold tracking-tight">
          Ruang<span className="text-subtle font-semibold"> HR</span>
        </div>
        <div className="text-subtle font-mono text-[10.5px]">
          PT Nusantara Digital
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — hidden on small screens where it would just push the form down */}
      <aside className="bg-sidebar relative hidden flex-col justify-between border-r p-10 lg:flex">
        {brand}

        <div className="max-w-[420px]">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            Satu ruang untuk kehadiran dan pengajuan.
          </h1>
          <p className="text-muted-foreground mt-3 text-[13.5px] leading-relaxed">
            Karyawan mencatat absensi dan mengajukan cuti; tim HR menyetujui,
            mengelola data, dan menarik laporan — di atas satu sumber data.
          </p>

          <ul className="mt-8 flex flex-col gap-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3.5">
                <span className="bg-primary-subtle text-primary flex size-9 shrink-0 items-center justify-center rounded-[10px]">
                  <h.icon className="size-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block text-[13.5px] font-medium">{h.title}</span>
                  <span className="text-muted-foreground mt-0.5 block text-[12.5px] leading-relaxed">
                    {h.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-subtle text-[11.5px]">
          Absensi dan pengajuan juga tersedia di aplikasi Ruang HR Mobile.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">{brand}</div>

          <h2 className="font-heading text-xl font-semibold tracking-tight">
            Masuk ke Ruang HR
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
                andini.rahmawati@nusantaradigital.co.id
              </span>{" "}
              / <span className="font-mono">securePass123</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
