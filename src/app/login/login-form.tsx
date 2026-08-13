"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "idle" | "password" | "passkey";

/** Static browser capability. Read through useSyncExternalStore so the server
 *  renders "unsupported" and the client corrects it without a hydration
 *  mismatch — the value never changes, hence the no-op subscribe. */
const noopSubscribe = () => () => {};
const usePasskeySupport = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => !!window.PublicKeyCredential,
    () => false,
  );

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [showPassword, setShowPassword] = useState(false);
  const passkeySupported = usePasskeySupport();

  const busy = mode !== "idle";

  async function withPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setMode("password");
    setError(null);

    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });

    if (res?.error) {
      setError("Email atau kata sandi salah.");
      setMode("idle");
      return;
    }
    router.push(next);
  }

  async function withPasskey() {
    setMode("passkey");
    setError(null);
    try {
      const optRes = await fetch("/api/webauthn/login");
      if (!optRes.ok) throw new Error("Tidak bisa memulai login passkey.");
      const { options, challengeId } = await optRes.json();

      const assertion = await startAuthentication(options);

      const res = await signIn("passkey", {
        challengeId,
        response: JSON.stringify(assertion),
        redirect: false,
      });
      if (res?.error) {
        throw new Error("Passkey tidak dikenali. Coba kata sandi.");
      }
      router.push(next);
    } catch (e) {
      const msg = (e as Error).message;
      // the user dismissing the OS prompt is not an error worth shouting about
      const aborted = /abort|NotAllowed|timed out/i.test(msg);
      setError(aborted ? null : msg || "Login passkey gagal.");
      setMode("idle");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="bg-danger-subtle text-danger rounded-lg px-3 py-2.5 text-[12.5px]"
        >
          {error}
        </p>
      )}

      {passkeySupported && (
        <>
          <Button
            type="button"
            onClick={withPasskey}
            disabled={busy}
            className="h-11 w-full gap-2 text-[13.5px]"
          >
            {mode === "passkey" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Fingerprint className="size-[18px]" aria-hidden />
            )}
            {mode === "passkey"
              ? "Menunggu perangkat…"
              : "Masuk dengan passkey"}
          </Button>

          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-subtle text-[11px] tracking-wide uppercase">
              atau kata sandi
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form onSubmit={withPassword} className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email kantor</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            disabled={busy}
            placeholder="nama@nusantaradigital.co.id"
            className="h-10"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Kata sandi</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={8}
              disabled={busy}
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              className="text-subtle hover:text-foreground absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-r-md transition-colors"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant={passkeySupported ? "outline" : "default"}
          disabled={busy}
          className="mt-1 h-11 w-full gap-2 text-[13.5px]"
        >
          {mode === "password" && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {mode === "password" ? "Memeriksa…" : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
