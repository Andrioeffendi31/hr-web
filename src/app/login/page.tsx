import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Masuk — Ruang HR" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const session = await auth();
  if (session?.user?.role === "hr_admin") redirect(next ?? "/kehadiran");

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/kehadiran",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=invalid");
      throw e;
    }
  }

  const message =
    error === "invalid"
      ? "Email atau kata sandi salah."
      : error === "admin_only"
        ? "Akun ini bukan HR Admin. Karyawan menggunakan aplikasi Ruang HR Mobile."
        : null;

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
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

        <div className="bg-card rounded-[14px] border p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Masuk ke konsol HR</h1>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Gunakan akun HR Admin perusahaan Anda.
          </p>

          {message && (
            <p
              role="alert"
              className="bg-danger-subtle text-danger mt-4 rounded-lg px-3 py-2.5 text-[12.5px]"
            >
              {message}
            </p>
          )}

          <form action={login} className="mt-5 flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email kantor</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="nama@nusantaradigital.co.id"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="mt-1 h-10 w-full">
              Masuk
            </Button>
          </form>

          <p className="text-subtle mt-4 text-[11.5px] leading-relaxed">
            Login passkey (WebAuthn) menyusul pada fase berikutnya. Demo:{" "}
            <span className="font-mono">andini.rahmawati@nusantaradigital.co.id</span> /{" "}
            <span className="font-mono">password123</span>
          </p>
        </div>
      </div>
    </div>
  );
}
