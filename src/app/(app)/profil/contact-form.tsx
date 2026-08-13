"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "text-[12px] font-medium";

export type Kontak = {
  phone: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
};

/**
 * The four fields an employee owns.
 *
 * Everything else on this page is read-only on purpose: identity and employment
 * data are HR's record of you, and a person who can edit their own division picks
 * their own shift. A phone number that only HR can fix, on the other hand, is a
 * phone number that stays wrong.
 */
export function ContactForm({ initial }: { initial: Kontak }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: async (body: Kontak) => {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");
      return data;
    },
    onSuccess: () => {
      toast.success("Kontak diperbarui");
      setDirty(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="flex flex-col gap-3 px-4 py-4"
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({
          phone: String(f.get("phone") ?? ""),
          address: String(f.get("address") ?? ""),
          emergencyName: String(f.get("emergencyName") ?? ""),
          emergencyPhone: String(f.get("emergencyPhone") ?? ""),
        });
      }}
    >
      <label className={LABEL}>
        No. telepon
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          placeholder="08xxxxxxxxxx"
          defaultValue={initial.phone ?? ""}
          className={FIELD}
        />
      </label>

      <label className={LABEL}>
        Alamat
        <textarea
          name="address"
          rows={2}
          defaultValue={initial.address ?? ""}
          className={`${FIELD} h-auto py-1.5 leading-snug`}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Kontak darurat
          <input
            name="emergencyName"
            placeholder="Nama keluarga"
            defaultValue={initial.emergencyName ?? ""}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          No. darurat
          <input
            name="emergencyPhone"
            type="tel"
            inputMode="numeric"
            placeholder="08xxxxxxxxxx"
            defaultValue={initial.emergencyPhone ?? ""}
            className={FIELD}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-subtle text-[11px]">
          Dipakai HR kalau perlu menghubungi Anda di luar jam kerja.
        </span>
        <Button type="submit" disabled={save.isPending || !dirty}>
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
