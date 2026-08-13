"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

export function LupaForm() {
  const [sent, setSent] = useState(false);

  const kirim = useMutation({
    mutationFn: (email: string) =>
      fetch("/api/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    // The endpoint answers 200 for every input on purpose, and so does this: a UI
    // that said "email tidak terdaftar" would hand out the staff list the server
    // just refused to leak.
    onSettled: () => setSent(true),
  });

  if (sent) {
    return (
      <div className="mt-5">
        <p className="bg-success-subtle text-success rounded-[11px] px-3 py-2.5 text-[12.5px] leading-relaxed">
          Kalau email itu terdaftar, tautan untuk membuat kata sandi baru sudah
          dikirim. Tautannya berlaku 1 jam.
        </p>
        <p className="text-subtle mt-3 text-[11.5px] leading-relaxed">
          Tidak menerima apa pun? Periksa folder spam, atau hubungi tim HR untuk
          direset langsung.
        </p>
        <Link
          href="/login"
          className="text-primary mt-4 block text-center text-[12.5px] font-medium hover:underline"
        >
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        kirim.mutate(String(new FormData(e.currentTarget).get("email") ?? ""));
      }}
    >
      <label className="block text-[12px] font-medium">
        Email kantor
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={FIELD}
        />
      </label>
      <Button type="submit" className="mt-1 w-full" disabled={kirim.isPending}>
        {kirim.isPending ? "Mengirim…" : "Kirim tautan"}
      </Button>
      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground mt-1 block text-center text-[12.5px]"
      >
        Kembali ke halaman masuk
      </Link>
    </form>
  );
}
