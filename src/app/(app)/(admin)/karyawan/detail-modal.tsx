"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttBadge, Avatar, Pill } from "@/components/bits";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmployeeForm } from "./employee-form";
import { type Role } from "@/lib/access";
import {
  type AttStatus,
  jam,
  tanggalPendek,
  tanggalTahun,
  telepon,
  umur,
} from "@/lib/hr";

export type Detail = {
  id: number;
  name: string;
  nik: string;
  email: string;
  division: string | null;
  position: string | null;
  contractType: "Tetap" | "Kontrak" | null;
  joinedAt: string | null;
  workLocation: string;
  active: boolean;
  role: Role;
  managerId: number | null;
  photoUrl: string | null;
  managerName: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  gender: "Laki-laki" | "Perempuan" | null;
  religion: string | null;
  phone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  hadir: number;
  telat: number;
  sisaCuti: number;
  jamLembur: number;
  todayStatus: AttStatus;
  log: {
    date: string;
    clockIn: string | null;
    clockOut: string | null;
    status: AttStatus;
  }[];
};

export function EmployeeDetail({
  detail: d,
  backHref,
  divisions,
  managers,
}: {
  detail: Detail;
  backHref: string;
  divisions: string[];
  managers: { id: number; name: string }[];
}) {
  const router = useRouter();

  // The temporary password lives in state for exactly as long as the dialog showing
  // it is open. Never persisted, never in a toast — a toast outlives the eyes on it.
  const [sandi, setSandi] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/employees/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        password?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Gagal mereset kata sandi");
      return data.password!;
    },
    onSuccess: (password) => {
      setSandi(password);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, active: !d.active }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(error ?? "Gagal mengubah status karyawan");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        d.active ? `${d.name} dinonaktifkan` : `${d.name} diaktifkan kembali`,
      );
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = [
    { label: "Hadir bulan ini", value: d.hadir, cls: "text-success" },
    { label: "Terlambat", value: d.telat, cls: "text-warning" },
    { label: "Sisa cuti", value: `${d.sisaCuti} hari`, cls: "text-foreground" },
    {
      label: "Jam lembur",
      value: `${d.jamLembur} jam`,
      cls: "text-foreground",
    },
  ];

  const pribadi: [string, string][] = [
    [
      "Tempat, tanggal lahir",
      d.birthPlace || d.birthDate
        ? [d.birthPlace, tanggalTahun(d.birthDate)].filter(Boolean).join(", ")
        : "—",
    ],
    ["Umur", umur(d.birthDate) === null ? "—" : `${umur(d.birthDate)} tahun`],
    ["Jenis kelamin", d.gender ?? "—"],
    ["Agama", d.religion ?? "—"],
    ["No. telepon", telepon(d.phone)],
    ["Alamat", d.address ?? "—"],
  ];

  const darurat: [string, string][] = [
    ["Nama", d.emergencyName ?? "—"],
    ["No. telepon", telepon(d.emergencyPhone)],
  ];

  const info: [string, string][] = [
    ["Divisi", d.division ?? "—"],
    ["Jabatan", d.position ?? "—"],
    ["Tipe kontrak", d.contractType ?? "—"],
    ["Mulai kerja", tanggalTahun(d.joinedAt)],
    ["Lokasi kerja", d.workLocation],
    ["Atasan langsung", d.managerName ?? "—"],
    ["Email kantor", d.email],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && router.push(backHref)}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-[840px]">
        {/* pr-14 keeps the status badge clear of the dialog's close button */}
        <div className="flex items-center gap-3 border-b py-4 pr-14 pl-5">
          <Avatar
            name={d.name}
            photoKey={d.photoUrl}
            className="bg-primary text-primary-foreground size-10 text-[13px]"
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">
              {d.name}
            </DialogTitle>
            <p className="text-subtle tnum text-[11.5px]">{d.nik}</p>
          </div>
          <AttBadge status={d.todayStatus} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <section>
              <div className="grid grid-cols-2 gap-2.5">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="bg-surface-2 rounded-[11px] border p-3"
                  >
                    <div className="text-muted-foreground text-[11.5px]">
                      {s.label}
                    </div>
                    <div
                      className={`tnum mt-0.5 text-[18px] font-bold ${s.cls}`}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-subtle mt-5 mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
                Informasi kepegawaian
              </h3>
              <dl>
                {info.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0"
                  >
                    <dt className="text-muted-foreground text-[12.5px]">
                      {label}
                    </dt>
                    <dd className="truncate text-right text-[12.5px] font-medium">
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-2.5">
                  <dt className="text-muted-foreground text-[12.5px]">
                    Status
                  </dt>
                  <dd>
                    <Pill tone={d.active ? "success" : "danger"}>
                      {d.active ? "Aktif" : "Tidak aktif"}
                    </Pill>
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-subtle mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
                Kehadiran 5 hari terakhir
              </h3>
              <div className="flex flex-col gap-1.5">
                {d.log.map((l) => (
                  <div
                    key={l.date}
                    className="bg-surface-2 flex items-center gap-3 rounded-[10px] border px-3 py-2"
                  >
                    <span className="tnum text-muted-foreground w-[52px] shrink-0 text-xs">
                      {tanggalPendek(l.date)}
                    </span>
                    <span className="tnum flex-1 text-[12.5px]">
                      {jam(l.clockIn)} – {jam(l.clockOut)}
                    </span>
                    <AttBadge status={l.status} />
                  </div>
                ))}
                {d.log.length === 0 && (
                  <p className="text-muted-foreground text-[12.5px]">
                    Belum ada riwayat kehadiran.
                  </p>
                )}
              </div>

              <h3 className="text-subtle mt-5 mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
                Data pribadi
              </h3>
              <Baris rows={pribadi} />

              <h3 className="text-subtle mt-5 mb-2 text-xs font-semibold tracking-[0.05em] uppercase">
                Kontak darurat
              </h3>
              <Baris rows={darurat} />
            </section>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t px-5 py-3.5 sm:grid-cols-5">
          <EmployeeForm
            divisions={divisions}
            managers={managers}
            initial={{
              id: d.id,
              nik: d.nik,
              name: d.name,
              email: d.email,
              role: d.role,
              division: d.division,
              position: d.position,
              contractType: d.contractType,
              joinedAt: d.joinedAt,
              workLocation: d.workLocation,
              managerId: d.managerId,
              photoUrl: d.photoUrl,
              active: d.active,
              birthPlace: d.birthPlace,
              birthDate: d.birthDate,
              address: d.address,
              gender: d.gender,
              religion: d.religion,
              phone: d.phone,
              emergencyName: d.emergencyName,
              emergencyPhone: d.emergencyPhone,
            }}
            trigger={
              <Button variant="outline" className="w-full">
                Ubah data
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                disabled={toggle.isPending}
                className={
                  d.active ? "text-danger hover:text-danger w-full" : "w-full"
                }
              >
                {d.active ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            }
            title={
              d.active
                ? `Nonaktifkan ${d.name}?`
                : `Aktifkan kembali ${d.name}?`
            }
            description={
              d.active
                ? "Akunnya tidak bisa dipakai masuk lagi dan namanya hilang dari daftar aktif. Riwayat kehadiran, cuti, dan lembur tetap tersimpan."
                : "Karyawan bisa masuk lagi dan namanya kembali muncul di daftar aktif."
            }
            confirmLabel={d.active ? "Nonaktifkan" : "Aktifkan"}
            destructive={d.active}
            onConfirm={() => toggle.mutate()}
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                disabled={reset.isPending}
                className="w-full"
              >
                Reset kata sandi
              </Button>
            }
            title={`Reset kata sandi ${d.name}?`}
            description="Kata sandi lamanya langsung tidak berlaku dan semua perangkat yang masih masuk akan keluar. Kata sandi sementara ditampilkan sekali di layar ini — salin dan serahkan langsung ke karyawan."
            confirmLabel="Reset"
            destructive
            onConfirm={() => reset.mutate()}
          />
          <Link
            href={`/berkas?owner=${d.id}`}
            className="bg-surface-2 border-border-strong hover:bg-accent flex h-10 items-center justify-center rounded-[9px] border text-[13px] font-medium transition-colors"
          >
            Lihat berkas
          </Link>
          {d.division && (
            <Link
              href={`/kehadiran?div=${encodeURIComponent(d.division)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 items-center justify-center rounded-[9px] text-[13px] font-medium transition-colors"
            >
              Kehadiran divisi
            </Link>
          )}
        </div>
      </DialogContent>

      {sandi && (
        <Dialog open onOpenChange={() => setSandi(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogTitle className="text-[15px]">
              Kata sandi sementara {d.name}
            </DialogTitle>
            <p className="text-muted-foreground text-[12.5px] leading-relaxed">
              Serahkan ke karyawan lewat jalur yang Anda percaya. Ia wajib
              menggantinya saat masuk pertama kali.
            </p>
            <div className="bg-surface-2 flex items-center justify-between gap-3 rounded-[11px] border px-3 py-2.5">
              <code className="font-mono text-[17px] font-semibold select-all">
                {sandi}
              </code>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(sandi);
                  toast.success("Kata sandi disalin");
                }}
              >
                Salin
              </Button>
            </div>
            <p className="text-subtle text-[11.5px]">
              Hanya ditampilkan sekali — tidak tersimpan di mana pun, termasuk
              di audit log.
            </p>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

/** The label/value row the three lists in this drawer share. Blank values print
 *  "—" upstream, so a missing field reads as missing rather than as an empty row. */
function Baris({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 border-b py-2.5 last:border-0"
        >
          <dt className="text-muted-foreground shrink-0 text-[12.5px]">
            {label}
          </dt>
          <dd className="text-right text-[12.5px] font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
