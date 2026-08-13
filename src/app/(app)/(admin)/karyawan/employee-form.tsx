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
  division: string | null;
  position: string | null;
  contractType: "Tetap" | "Kontrak" | null;
  joinedAt: string | null;
  workLocation: string;
  managerId: number | null;
  active?: boolean;
  /** R2 object key, null when no photo was uploaded yet */
  photoUrl?: string | null;

  birthPlace?: string | null;
  birthDate?: string | null;
  address?: string | null;
  gender?: "Laki-laki" | "Perempuan" | null;
  religion?: string | null;
  phone?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
};

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";
const LABEL = "text-[12px] font-medium";
const GROUP =
  "text-subtle mb-2.5 border-b pb-1.5 text-[11px] font-semibold tracking-[0.07em] uppercase";

/** Suggestions only — `religion` is a text column and the picker allows a value
 *  that is not on this list (see the schema comment). */
const AGAMA = [
  "Islam",
  "Kristen",
  "Protestan",
  "Katolik",
  "Hindu",
  "Buddha",
  "Konghucu",
];

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
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
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
      return fetch("/api/files", { method: "POST", body: fd }).then(
        async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah foto");
          return data;
        },
      );
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
      <DialogContent className="flex max-h-[86vh] flex-col gap-0 p-0 sm:max-w-[820px]">
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
            // Division and mulai kerja used to be guarded here. They are optional
            // now: an imported employee has neither, and refusing to save an
            // address correction until HR invents a division would be the wrong
            // trade. The server writes NULL for anything left blank.
            m.mutate({
              ...(editing && {
                id: initial!.id,
                active: initial!.active ?? true,
              }),
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
              birthPlace: f.get("birthPlace"),
              birthDate: f.get("birthDate"),
              address: f.get("address"),
              gender: f.get("gender"),
              religion: f.get("religion"),
              phone: f.get("phone"),
              emergencyName: f.get("emergencyName"),
              emergencyPhone: f.get("emergencyPhone"),
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
            {/* Two groups, because the record now holds two different kinds of
                fact: who someone is, and how they are employed. The second half is
                what an imported employee is missing, and keeping it in its own
                column makes the blanks obvious rather than scattered. */}
            <div className="grid gap-5 md:grid-cols-2">
              <section>
                <h3 className={GROUP}>Data pribadi</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`${LABEL} col-span-2`}>
                    Nama lengkap
                    <input
                      name="name"
                      required
                      defaultValue={initial?.name}
                      className={FIELD}
                    />
                  </label>
                  <label className={`${LABEL} col-span-2`}>
                    Tempat lahir
                    <input
                      name="birthPlace"
                      placeholder="Pemalang"
                      defaultValue={initial?.birthPlace ?? undefined}
                      className={FIELD}
                    />
                  </label>
                  <div className={`${LABEL} col-span-2`}>
                    <label htmlFor="birthDate">Tanggal lahir</label>
                    <DateField
                      id="birthDate"
                      name="birthDate"
                      defaultValue={initial?.birthDate ?? undefined}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div className={LABEL}>
                    <label htmlFor="gender">Jenis kelamin</label>
                    <SelectField
                      id="gender"
                      name="gender"
                      defaultValue={initial?.gender ?? ""}
                      placeholder="Belum diisi"
                      options={[
                        { value: "Laki-laki", label: "Laki-laki" },
                        { value: "Perempuan", label: "Perempuan" },
                      ]}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div className={LABEL}>
                    <label htmlFor="religion">Agama</label>
                    {/* free text behind a picker: the column is text because the
                        official list has changed before, and HR already writes
                        "Protestan" where the KTP says "Kristen" */}
                    <ComboboxField
                      id="religion"
                      name="religion"
                      defaultValue={initial?.religion ?? ""}
                      options={AGAMA.map((a) => ({ value: a, label: a }))}
                      placeholder="Belum diisi"
                      searchPlaceholder="Cari atau ketik…"
                      emptyText="Ketik untuk menambah."
                      clearLabel="— belum diisi —"
                      allowCreate
                      className="mt-1"
                    />
                  </div>
                  <label className={`${LABEL} col-span-2`}>
                    Alamat
                    <textarea
                      name="address"
                      rows={2}
                      defaultValue={initial?.address ?? undefined}
                      className={`${FIELD} h-auto py-1.5 leading-snug`}
                    />
                  </label>
                  <label className={`${LABEL} col-span-2`}>
                    No. telepon
                    <input
                      name="phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="08xxxxxxxxxx"
                      defaultValue={initial?.phone ?? undefined}
                      className={FIELD}
                    />
                  </label>
                  <label className={LABEL}>
                    Kontak darurat
                    <input
                      name="emergencyName"
                      placeholder="Nama keluarga"
                      defaultValue={initial?.emergencyName ?? undefined}
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
                      defaultValue={initial?.emergencyPhone ?? undefined}
                      className={FIELD}
                    />
                  </label>
                </div>
              </section>

              <section>
                <h3 className={GROUP}>Data kepegawaian</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className={LABEL}>
                    NIK
                    <input
                      name="nik"
                      required
                      defaultValue={initial?.nik}
                      className={FIELD}
                    />
                  </label>
                  <label className={LABEL}>
                    Email
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
                      defaultValue={initial?.division ?? undefined}
                      options={divisions.map((d) => ({ value: d, label: d }))}
                      placeholder="Belum diisi"
                      searchPlaceholder="Cari divisi…"
                      // typing a new one is gone on purpose: a division now carries a
                      // work schedule, so inventing one here would create a team whose
                      // late-threshold nobody ever set
                      emptyText="Divisi tidak ada. Tambahkan lewat menu Divisi."
                      clearLabel="— belum diisi —"
                      className="mt-1"
                    />
                  </div>
                  <label className={LABEL}>
                    Jabatan
                    <input
                      name="position"
                      defaultValue={initial?.position ?? undefined}
                      className={FIELD}
                    />
                  </label>
                  <div className={LABEL}>
                    <label htmlFor="contractType">Tipe kontrak</label>
                    <SelectField
                      id="contractType"
                      name="contractType"
                      // a new hire is Tetap unless told otherwise; an existing row
                      // keeps its blank rather than being quietly set to Tetap on
                      // the next unrelated save
                      defaultValue={
                        editing ? (initial?.contractType ?? "") : "Tetap"
                      }
                      placeholder="Belum diisi"
                      options={[
                        { value: "Tetap", label: "Tetap" },
                        { value: "Kontrak", label: "Kontrak" },
                      ]}
                      className="mt-1 w-full"
                    />
                  </div>
                  <div className={`${LABEL} col-span-2`}>
                    <label htmlFor="joinedAt">Mulai kerja</label>
                    <DateField
                      id="joinedAt"
                      name="joinedAt"
                      defaultValue={initial?.joinedAt ?? undefined}
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
                      defaultValue={
                        initial?.managerId ? String(initial.managerId) : ""
                      }
                      options={managers
                        .filter((mg) => mg.id !== initial?.id)
                        .map((mg) => ({
                          value: String(mg.id),
                          label: mg.name,
                        }))}
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
                        Minimal 8 karakter. Karyawan mendaftarkan passkey
                        sendiri setelah login pertama.
                      </span>
                    </label>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* grid, not flex — the Button base sets shrink-0, so flex-1 alone
              leaves the two footer buttons unequal */}
          <div className="grid grid-cols-2 gap-2 border-t px-5 py-3.5">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" className="w-full" disabled={m.isPending}>
              {editing ? "Simpan perubahan" : "Tambah karyawan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
