"use client";

import { signIn } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cekSandi } from "@/lib/hr";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "block text-[12px] font-medium";

export function PasswordForm({
  requireCurrent,
  email,
  endpoint = "/api/me/password",
  extra,
  onDone,
}: {
  requireCurrent: boolean;
  /** needed to re-authenticate silently after the change — see onSuccess */
  email?: string;
  /** the reset-by-link page posts the same fields to its own public endpoint */
  endpoint?: string;
  /** extra body fields, e.g. the reset token */
  extra?: Record<string, string>;
  /** replaces the default "sign back in and go home" ending */
  onDone?: () => void;
}) {
  const save = useMutation({
    mutationFn: async (body: { current?: string; next: string }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengganti kata sandi");
      return data;
    },
    onSuccess: async (_data, vars) => {
      toast.success("Kata sandi diperbarui");
      // the reset-by-link flow has no session to refresh: it hands over to /login
      if (onDone) return onDone();
      if (!email) return;
      /**
       * Trade this tab's cookie for a fresh one.
       *
       * The change stamps `passwordChangedAt`, which deliberately invalidates
       * every token minted earlier — including the one this very request used. So
       * without re-authenticating, the person who just chose a new password would
       * be thrown out to /login by the next page load. Signing in again with the
       * password they typed a second ago keeps that promise pointed at the *other*
       * devices, which is where it was aimed.
       */
      await signIn("credentials", {
        email,
        password: vars.next,
        redirect: false,
      });
      /**
       * A full navigation, not router.replace().
       *
       * The session cookie was just swapped underneath the client router, whose
       * RSC cache and in-flight prefetches were built against the old one — using
       * it here made the very next render arrive with the spent token and bounce to
       * /login?stale=1. Leaving the page entirely is the only way to guarantee the
       * new cookie is the one that gets sent.
       */
      window.location.assign("/");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const next = String(f.get("next") ?? "");
        // the same function the server validates with, so the message here is
        // exactly the one it would have answered — no second rule to drift
        const lemah = cekSandi(next);
        if (lemah) {
          toast.error(lemah);
          return;
        }
        if (next !== String(f.get("confirm") ?? "")) {
          toast.error("Konfirmasi kata sandi tidak sama");
          return;
        }
        save.mutate({
          next,
          ...(requireCurrent && { current: String(f.get("current") ?? "") }),
        });
      }}
    >
      {requireCurrent && (
        <label className={LABEL}>
          Kata sandi saat ini
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD}
          />
        </label>
      )}

      <label className={LABEL}>
        Kata sandi baru
        <input
          name="next"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={FIELD}
        />
        <span className="text-subtle mt-1 block text-[11px] font-normal">
          Minimal 8 karakter, memuat huruf kapital, angka, dan simbol — dan
          berbeda dari kata sandi lama.
        </span>
      </label>

      <label className={LABEL}>
        Ulangi kata sandi baru
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={FIELD}
        />
      </label>

      <Button type="submit" className="mt-1 w-full" disabled={save.isPending}>
        {save.isPending ? "Menyimpan…" : "Simpan kata sandi"}
      </Button>
    </form>
  );
}
