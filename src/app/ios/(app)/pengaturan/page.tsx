"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { Bell, ChevronRight, FolderOpen, Fingerprint, KeyRound, Loader2, LogOut, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../_lib/api";
import { useMe } from "../../_lib/hooks";
import { daftarPasskey, dibatalkan, passkeyDidukung } from "../../_lib/passkey";
import { aktifkanPush, lepasPush, usePushState } from "../../_lib/push";
import { Avatar, Badge, Card, PageHeader, RowLink } from "../../_lib/ui";

const noop = () => () => {};

export default function PengaturanPage() {
  const { data: me } = useMe();
  const push = usePushState();
  const [keluar, setKeluar] = useState(false);

  const statusPush = {
    granted: { tone: "success", label: "Menyala" },
    default: { tone: "warning", label: "Belum diizinkan" },
    denied: { tone: "danger", label: "Ditolak" },
    unsupported: { tone: "muted", label: "Tidak tersedia" },
  } as const;

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" subtitle="Notifikasi, lokasi, dan akun Anda" />

      {me ? (
        <Link href="/ios/profil" className="block">
          <Card className="flex items-center gap-3.5">
            <Avatar photoKey={me.profile.photoKey} initials={me.profile.initials} size={52} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold">{me.profile.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {me.profile.nik} · {me.profile.division || "Tanpa divisi"}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Card>
        </Link>
      ) : null}

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Data saya</h2>
        <Card className="divide-y divide-border p-0">
          <RowLink href="/ios/berkas" icon={<FolderOpen className="size-[18px]" />} title="Berkas saya" desc="Kontrak, sertifikat, dan dokumen perusahaan" />
          <RowLink href="/ios/tim" icon={<Users className="size-[18px]" />} title="Kehadiran tim" desc="Siapa yang sudah hadir hari ini" />
        </Card>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Notifikasi</h2>
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Bell className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">Notifikasi NanumHR</p>
              <p className="text-[13px] text-muted-foreground text-pretty">
                Pengingat absen, pengingat lokasi tiap 2 jam, dan kabar pengajuan.
              </p>
            </div>
            <Badge tone={statusPush[push].tone}>{statusPush[push].label}</Badge>
          </div>
          {push === "default" ? (
            <button
              type="button"
              onClick={() => void aktifkanPush().catch(() => {})}
              className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              Nyalakan notifikasi
            </button>
          ) : push === "denied" ? (
            <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
              Buka Pengaturan iPhone › Notifikasi › NanumHR, lalu nyalakan Izinkan Notifikasi.
            </p>
          ) : push === "unsupported" ? (
            <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
              Notifikasi hanya tersedia jika NanumHR dibuka dari Layar Utama, di iOS 16.4 atau yang lebih baru.
            </p>
          ) : null}
        </Card>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Lokasi kerja</h2>
        <Card className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <MapPin className="size-[18px]" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-[15px] font-medium">Jejak lokasi jam kerja</p>
            <p className="text-[13px] text-muted-foreground text-pretty">
              Selama Anda sudah absen masuk, lokasi dikirim saat NanumHR dibuka dan setiap Anda mengetuk pengingat
              lokasi (tiap 2 jam). iPhone tidak mengizinkan aplikasi web membaca lokasi saat ditutup.
            </p>
          </div>
        </Card>
      </section>

      <Passkey />

      <section className="space-y-2.5">
        <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Akun</h2>
        <Card className="divide-y divide-border p-0">
          <a href="/ganti-sandi" className="flex items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <KeyRound className="size-[18px]" aria-hidden />
            </span>
            <span className="text-[15px] font-medium">Ganti kata sandi</span>
          </a>
          <button
            type="button"
            disabled={keluar}
            onClick={async () => {
              setKeluar(true);
              await lepasPush().catch(() => {});
              await signOut({ redirect: false }).catch(() => {});
              toast("Anda sudah keluar.");
              window.location.replace("/ios/masuk");
            }}
            className="flex w-full items-center gap-3 p-4 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-subtle text-danger">
              {keluar ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <LogOut className="size-[18px]" aria-hidden />}
            </span>
            <span className="space-y-0.5">
              <span className="block text-[15px] font-medium text-danger">Keluar dari akun</span>
              <span className="block text-[13px] text-muted-foreground">
                Notifikasi untuk iPhone ini ikut dimatikan.
              </span>
            </span>
          </button>
        </Card>
      </section>
    </div>
  );
}

function Passkey() {
  const qc = useQueryClient();
  const didukung = useSyncExternalStore(noop, passkeyDidukung, () => false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["ios", "passkeys"],
    queryFn: () => api<{ ids: string[] }>("/api/me/passkeys"),
  });
  const jumlah = data?.ids.length ?? 0;

  return (
    <section className="space-y-2.5">
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">Keamanan</h2>
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Fingerprint className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Masuk dengan Face ID</p>
            <p className="text-[13px] text-muted-foreground text-pretty">
              {jumlah ? `${jumlah} passkey terdaftar di akun ini.` : "Belum ada passkey. Masuk tanpa mengetik kata sandi."}
            </p>
          </div>
        </div>
        {didukung ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await daftarPasskey();
                await qc.invalidateQueries({ queryKey: ["ios", "passkeys"] });
                toast.success("Passkey terdaftar. Lain kali masuk dengan Face ID.");
              } catch (e) {
                if (!dibatalkan(e)) toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Daftarkan iPhone ini
          </button>
        ) : null}
      </Card>
    </section>
  );
}
