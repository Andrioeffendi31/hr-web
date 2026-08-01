"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, Pill } from "@/components/bits";

export type Passkey = {
  id: number;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : "belum pernah";

export function PasskeyManager({ passkeys }: { passkeys: Passkey[] }) {
  const router = useRouter();

  const enroll = useMutation({
    mutationFn: async () => {
      const optRes = await fetch("/api/webauthn/register");
      if (!optRes.ok) {
        throw new Error(
          ((await optRes.json().catch(() => ({}))) as { error?: string }).error ??
            "Tidak bisa memulai pendaftaran",
        );
      }
      const { options, challengeId } = await optRes.json();

      const attestation = await startRegistration(options);

      const verifyRes = await fetch("/api/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, response: attestation }),
      });
      if (!verifyRes.ok) {
        throw new Error(
          ((await verifyRes.json().catch(() => ({}))) as { error?: string })
            .error ?? "Passkey gagal didaftarkan",
        );
      }
    },
    onSuccess: () => {
      toast.success("Passkey berhasil didaftarkan");
      router.refresh();
    },
    onError: (e: Error) => {
      if (/abort|NotAllowed|timed out/i.test(e.message)) return; // user dismissed
      if (/already registered|excludeCredentials|InvalidState/i.test(e.message)) {
        toast.error("Perangkat ini sudah terdaftar");
        return;
      }
      toast.error(e.message);
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/webauthn/register", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Gagal menghapus passkey");
    },
    onSuccess: () => {
      toast.success("Passkey dihapus");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {passkeys.length === 0 ? (
        <Empty>
          Belum ada passkey. Daftarkan perangkat ini agar bisa masuk tanpa kata
          sandi.
        </Empty>
      ) : (
        <ul className="divide-y">
          {passkeys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary-subtle text-primary flex size-9 shrink-0 items-center justify-center rounded-[10px]">
                <Fingerprint className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">{k.label}</span>
                  {k.backedUp && <Pill tone="success">Tersinkron</Pill>}
                </span>
                <span className="text-subtle mt-0.5 block text-[11.5px]">
                  Didaftarkan {fmt(k.createdAt)} · terakhir dipakai{" "}
                  {fmt(k.lastUsedAt)}
                </span>
              </span>
              <button
                onClick={() => {
                  if (!confirm(`Hapus passkey "${k.label}"?`)) return;
                  revoke.mutate(k.id);
                }}
                disabled={revoke.isPending}
                aria-label={`Hapus passkey ${k.label}`}
                className="text-subtle hover:text-danger hover:border-danger/40 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3.5">
        <Button
          onClick={() => enroll.mutate()}
          disabled={enroll.isPending}
          className="h-10 gap-2 text-[13px]"
        >
          {enroll.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Fingerprint className="size-[17px]" aria-hidden />
          )}
          {enroll.isPending ? "Menunggu perangkat…" : "Daftarkan perangkat ini"}
        </Button>
        <p className="text-subtle text-[11.5px]">
          Kata sandi tetap aktif sebagai cadangan.
        </p>
      </div>
    </>
  );
}
