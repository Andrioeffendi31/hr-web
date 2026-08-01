"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
};

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "text-[12px] font-medium";

/** Add / edit an employee. Same sheet for both — create posts, edit patches. */
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
        <div className="border-b py-4 pr-14 pl-5">
          <SheetTitle className="text-[15px] font-semibold">
            {editing ? "Ubah data karyawan" : "Tambah karyawan"}
          </SheetTitle>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const managerId = String(f.get("managerId") ?? "");
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
          <div className="flex-1 overflow-y-auto px-5 py-4">
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
              <label className={LABEL}>
                Divisi
                <input
                  name="division"
                  required
                  list="divisi-list"
                  defaultValue={initial?.division}
                  className={FIELD}
                />
                <datalist id="divisi-list">
                  {divisions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>
              <label className={LABEL}>
                Jabatan
                <input
                  name="position"
                  required
                  defaultValue={initial?.position}
                  className={FIELD}
                />
              </label>
              <label className={LABEL}>
                Tipe kontrak
                <select
                  name="contractType"
                  defaultValue={initial?.contractType ?? "Tetap"}
                  className={FIELD}
                >
                  <option value="Tetap">Tetap</option>
                  <option value="Kontrak">Kontrak</option>
                </select>
              </label>
              <label className={LABEL}>
                Mulai kerja
                <input
                  name="joinedAt"
                  type="date"
                  required
                  defaultValue={initial?.joinedAt}
                  className={FIELD}
                />
              </label>
              <label className={LABEL}>
                Lokasi kerja
                <input
                  name="workLocation"
                  required
                  defaultValue={initial?.workLocation ?? "Kantor Pusat"}
                  className={FIELD}
                />
              </label>
              <label className={LABEL}>
                Hak akses
                <select
                  name="role"
                  defaultValue={initial?.role ?? "employee"}
                  className={FIELD}
                >
                  <option value="employee">Karyawan</option>
                  <option value="manager">Manager</option>
                  <option value="hr_admin">HR Admin</option>
                </select>
              </label>
              <label className={`${LABEL} col-span-2`}>
                Atasan langsung
                <select
                  name="managerId"
                  defaultValue={initial?.managerId ?? ""}
                  className={FIELD}
                >
                  <option value="">— tidak ada —</option>
                  {managers
                    .filter((mg) => mg.id !== initial?.id)
                    .map((mg) => (
                      <option key={mg.id} value={mg.id}>
                        {mg.name}
                      </option>
                    ))}
                </select>
              </label>
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

          <div className="flex gap-2 border-t px-5 py-3.5">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" className="flex-1" disabled={m.isPending}>
              {editing ? "Simpan perubahan" : "Tambah karyawan"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
