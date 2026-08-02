"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttBadge, Avatar, Pill } from "@/components/bits";
import { EmployeeForm } from "./employee-form";
import { type AttStatus, jam, tanggalPendek } from "@/lib/hr";

export type Detail = {
  id: number;
  name: string;
  nik: string;
  email: string;
  division: string;
  position: string;
  contractType: "Tetap" | "Kontrak";
  joinedAt: string;
  workLocation: string;
  active: boolean;
  role: "hr_admin" | "manager" | "employee";
  managerId: number | null;
  photoUrl: string | null;
  managerName: string | null;
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

  const info: [string, string][] = [
    ["Divisi", d.division],
    ["Jabatan", d.position],
    ["Tipe kontrak", d.contractType],
    ["Mulai kerja", `${tanggalPendek(d.joinedAt)} ${d.joinedAt.slice(0, 4)}`],
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
                  <div key={s.label} className="bg-surface-2 rounded-[11px] border p-3">
                    <div className="text-muted-foreground text-[11.5px]">{s.label}</div>
                    <div className={`tnum mt-0.5 text-[18px] font-bold ${s.cls}`}>
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
                    <dt className="text-muted-foreground text-[12.5px]">{label}</dt>
                    <dd className="truncate text-right text-[12.5px] font-medium">
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-2.5">
                  <dt className="text-muted-foreground text-[12.5px]">Status</dt>
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
            </section>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t px-5 py-3.5 sm:grid-cols-4">
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
            }}
            trigger={
              <Button variant="outline" className="h-10 w-full">
                Ubah data
              </Button>
            }
          />
          <Button
            variant="outline"
            disabled={toggle.isPending}
            onClick={() => {
              const verb = d.active ? "menonaktifkan" : "mengaktifkan kembali";
              if (window.confirm(`Yakin ${verb} ${d.name}?`)) toggle.mutate();
            }}
            className={
              d.active ? "text-danger hover:text-danger h-10 w-full" : "h-10 w-full"
            }
          >
            {d.active ? "Nonaktifkan" : "Aktifkan"}
          </Button>
          <Link
            href={`/berkas?owner=${d.id}`}
            className="bg-surface-2 border-border-strong hover:bg-accent flex h-10 items-center justify-center rounded-[9px] border text-[13px] font-medium transition-colors"
          >
            Lihat berkas
          </Link>
          <Link
            href={`/kehadiran?div=${encodeURIComponent(d.division)}`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 items-center justify-center rounded-[9px] text-[13px] font-medium transition-colors"
          >
            Kehadiran divisi
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
