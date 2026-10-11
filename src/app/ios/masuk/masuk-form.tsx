"use client";

import { useState, useSyncExternalStore } from "react";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import { dibatalkan, masukPasskey, passkeyDidukung } from "../_lib/passkey";

const noop = () => () => {};

export function MasukForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [kunci, setKunci] = useState(false);
  const bisaPasskey = useSyncExternalStore(noop, passkeyDidukung, () => false);

  async function denganPasskey() {
    setKunci(true);
    setError(null);
    try {
      await masukPasskey();
      window.location.replace("/ios");
    } catch (e) {
      if (!dibatalkan(e)) setError((e as Error).message);
      setKunci(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    if (res?.error) {
      setError("Email atau kata sandi salah. Periksa lagi lalu coba masuk.");
      setBusy(false);
      return;
    }
    // muat ulang penuh, supaya layout server membaca cookie sesi yang baru
    window.location.replace("/ios");
  }

  const field =
    "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          placeholder="nama@perusahaan.co.id"
          className={field}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Kata sandi
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={8}
            className={`${field} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-[opacity,scale] active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
        {busy ? "Sedang masuk…" : "Masuk"}
      </button>

      {bisaPasskey ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            atau
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={denganPasskey}
            disabled={busy || kunci}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-base font-semibold disabled:opacity-60"
          >
            {kunci ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Fingerprint className="size-5" aria-hidden />}
            Masuk dengan Face ID
          </button>
        </>
      ) : null}

      <a
        href="/lupa-sandi"
        className="block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Lupa kata sandi?
      </a>
    </form>
  );
}
