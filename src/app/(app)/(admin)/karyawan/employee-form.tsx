"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/bits";
import { FileDrop } from "@/components/file-drop";
import { ComboboxField } from "@/components/combobox-field";
import { DateField } from "@/components/date-field";
import { SelectField } from "@/components/select-field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type EmployeeInput = {
  id?: number;
  nik: string;
  name: string;
  email: string;
  role: "hr_admin" | "manager" | "employee";
  division: string;
  position: string;
  contractType: "Tetap" | "Kontrak";
  joinedAt: string;
  workLocation: string;
  managerId: number | null;
  active?: boolean;
  /** R2 object key, null when no photo was uploaded yet */
  photoUrl?: string | null;
};

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "text-[12px] font-medium";

/** Add / edit an employee. Same modal for both — create posts, edit patches. */
export function EmployeeForm({
  initial,
  divisions,
  managers,
  trigger,
}: {
  initial?: EmployeeInput;
  divisions: string[];
  managers: { id: number; name: string }[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = Boolean(initial?.id);

  const m = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/employees", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? "Gagal menyimpan data karyawan");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      toast.success(
        editing
          ? `Data ${vars.name} diperbarui`
          : `${vars.name} ditambahkan sebagai karyawan`,
      );
      setOpen(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Photo goes to object storage, not through /api/employees — the key is derived
  // from the employee id, so it can only be uploaded once the row exists.
  const photo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("kind", "photo");
      fd.append("employeeId", String(initial!.id));
      fd.append("file", file);
      return fetch("/api/files", { method: "POST", body: fd }).then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
        return data;
      });
    },
    onSuccess: () => {
      toast.success("Foto profil diperbarui");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[86vh] flex-col gap-0 p-0 sm:max-w-[560px]">
        <div className="border-b py-4 pr-14 pl-5">
          <DialogTitle className="text-[15px] font-semibold">
            {editing ? "Ubah data karyawan" : "Tambah karyawan"}
          </DialogTitle>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const managerId = String(f.get("managerId") ?? "");
            // hidden inputs skip browser validation, so check the two pickers here
            if (!String(f.get("division") ?? "").trim()) {
              toast.error("Divisi wajib diisi");
              return;
            }
            if (!f.get("joinedAt")) {
              toast.error("Tanggal mulai kerja wajib diisi");
              return;
            }
            m.mutate({
              ...(editing && { id: initial!.id, active: initial!.active ?? true }),
              nik: f.get("nik"),
              name: f.get("name"),
              email: f.get("email"),
              role: f.get("role"),
              division: f.get("division"),
              position: f.get("position"),
              contractType: f.get("contractType"),
              joinedAt: f.get("joinedAt"),
              workLocation: f.get("workLocation"),
              managerId: managerId ? Number(managerId) : null,
              ...(!editing && { password: f.get("password") }),
            });
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {editing && (
              <div className="mb-4 flex items-center gap-3 border-b pb-4">
                <Avatar
                  name={initial!.name}
                  photoKey={initial!.photoUrl}
                  className="size-12 text-[15px]"
                />
                <div className={`${LABEL} min-w-0 flex-1`}>
                  Foto profil
                  <FileDrop
                    accept=".jpg,.jpeg,.png,.webp"
                    maxBytes={1.5 * 1024 * 1024}
                    disabled={photo.isPending}
                    hint="JPG, PNG, atau WEBP · maksimal 1,5 MB"
                    className="mt-1"
                    onFile={(f) => f && photo.mutate(f)}
                  />
                  <span className="text-subtle mt-1 block text-[11px] font-normal">
                    Tersimpan langsung, terpisah dari tombol Simpan.
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={LABEL}>
                NIK
                <input name="nik" required defaultValue={initial?.nik} className={FIELD} />
              </label>
              <label className={LABEL}>
                Nama lengkap
                <input name="name" required defaultValue={initial?.name} className={FIELD} />
              </label>
              <label className={`${LABEL} col-span-2`}>
                Email kantor
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={initial?.email}
                  className={FIELD}
                />
              </label>
              <div className={LABEL}>
                <label htmlFor="division">Divisi</label>
                <ComboboxField
                  id="division"
                  name="division"
                  defaultValue={initial?.division}
                  options={divisions.map((d) => ({ value: d, label: d }))}
                  placeholder="Pilih divisi"
                  searchPlaceholder="Cari divisi…"
                  // typing a new one is gone on purpose: a division now carries a
                  // work schedule, so inventing one here would create a team whose
                  // late-threshold nobody ever set
                  emptyText="Divisi tidak ada. Tambahkan lewat menu Divisi."
                  className="mt-1"
                />
              </div>
              <label className={LABEL}>
                Jabatan
                <input
                  name="position"
                  required
                  defaultValue={initial?.position}
                  className={FIELD}
                />
              </label>
              <div className={LABEL}>
                <label htmlFor="contractType">Tipe kontrak</label>
                <SelectField
                  id="contractType"
                  name="contractType"
                  defaultValue={initial?.contractType ?? "Tetap"}
                  options={[
                    { value: "Tetap", label: "Tetap" },
                    { value: "Kontrak", label: "Kontrak" },
                  ]}
                  className="mt-1 w-full"
                />
              </div>
              <div className={LABEL}>
                <label htmlFor="joinedAt">Mulai kerja</label>
                <DateField
                  id="joinedAt"
                  name="joinedAt"
                  defaultValue={initial?.joinedAt}
                  className="mt-1 w-full"
                />
              </div>
              <label className={LABEL}>
                Lokasi kerja
                <input
                  name="workLocation"
                  required
                  defaultValue={initial?.workLocation ?? "Kantor Pusat"}
                  className={FIELD}
                />
              </label>
              <div className={LABEL}>
                <label htmlFor="role">Hak akses</label>
                <SelectField
                  id="role"
                  name="role"
                  defaultValue={initial?.role ?? "employee"}
                  options={[
                    { value: "employee", label: "Karyawan" },
                    { value: "manager", label: "Manager" },
                    { value: "hr_admin", label: "HR Admin" },
                  ]}
                  className="mt-1 w-full"
                />
              </div>
              <div className={`${LABEL} col-span-2`}>
                <label htmlFor="managerId">Atasan langsung</label>
                <ComboboxField
                  id="managerId"
                  name="managerId"
                  defaultValue={initial?.managerId ? String(initial.managerId) : ""}
                  options={managers
                    .filter((mg) => mg.id !== initial?.id)
                    .map((mg) => ({ value: String(mg.id), label: mg.name }))}
                  placeholder="— tidak ada —"
                  searchPlaceholder="Cari karyawan…"
                  emptyText="Karyawan tidak ditemukan."
                  clearLabel="— tidak ada —"
                  className="mt-1"
                />
              </div>
              {!editing && (
                <label className={`${LABEL} col-span-2`}>
                  Kata sandi awal
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className={FIELD}
                  />
                  <span className="text-subtle mt-1 block text-[11px] font-normal">
                    Minimal 8 karakter. Karyawan mendaftarkan passkey sendiri setelah
                    login pertama.
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* grid, not flex — the Button base sets shrink-0, so flex-1 alone
              leaves the two footer buttons unequal */}
          <div className="grid grid-cols-2 gap-2 border-t px-5 py-3.5">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" className="h-10 w-full" disabled={m.isPending}>
              {editing ? "Simpan perubahan" : "Tambah karyawan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
