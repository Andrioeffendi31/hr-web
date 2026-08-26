"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SelectField } from "@/components/select-field";

const FIELD =
  "bg-card border-border-strong mt-1 h-9 w-full rounded-[9px] border px-2.5 text-[13px]";

/** Kosong = biarkan server menghitungnya dari shift; sisanya menimpa apa pun yang
 *  dihitung, karena cuti/izin/sakit tidak bisa disimpulkan dari jam absen. */
const STATUS = [
  { value: "", label: "Hitung otomatis dari shift" },
  { value: "hadir", label: "Hadir" },
  { value: "telat", label: "Terlambat" },
  { value: "wfh", label: "WFH" },
  { value: "cuti", label: "Cuti" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
];

/**
 * Koreksi jam absen satu hari. Berkunci pada karyawan + tanggal, bukan id
 * absensi: hari yang belum punya baris sama sekali justru yang paling sering
 * perlu dikoreksi, dan endpointnya meng-upsert.
 */
export function EditJam({
  employeeId,
  date,
  name,
  clockIn,
  clockOut,
}: {
  employeeId: number;
  date: string;
  name: string;
  clockIn: string | null;
  clockOut: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const m = useMutation({
    mutationFn: async (input: {
      clockIn: string;
      clockOut: string;
      status: string;
      note: string;
    }) => {
      const res = await fetch("/api/attendance/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, ...input }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(error ?? "Gagal menyimpan koreksi jam");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Jam kehadiran ${name} diperbarui`);
      setOpen(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label={`Edit jam kehadiran ${name}`}
        className="text-subtle hover:text-foreground hover:bg-accent -my-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors"
      >
        <Pencil className="size-3" aria-hidden />
        Edit jam
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            m.mutate({
              clockIn: String(f.get("clockIn") ?? ""),
              clockOut: String(f.get("clockOut") ?? ""),
              status: String(f.get("status") ?? ""),
              note: String(f.get("note") ?? "").trim(),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              Edit jam — {name}
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Koreksi absen {date}. Kosongkan keduanya untuk membatalkan absen
              hari itu. Selfie, lokasi dan alasan karyawan tidak ikut berubah.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-medium">
                Jam masuk
                <input
                  name="clockIn"
                  type="time"
                  defaultValue={clockIn?.slice(0, 5) ?? ""}
                  className={FIELD}
                />
              </label>
              <label className="text-[12px] font-medium">
                Jam keluar
                <input
                  name="clockOut"
                  type="time"
                  defaultValue={clockOut?.slice(0, 5) ?? ""}
                  className={FIELD}
                />
              </label>
            </div>
            <label className="text-[12px] font-medium">
              Status
              <SelectField
                name="status"
                defaultValue=""
                options={STATUS}
                className="mt-1 w-full"
              />
            </label>
            <label className="text-[12px] font-medium">
              Alasan koreksi
              <input
                name="note"
                maxLength={500}
                placeholder="mis. HP mati, lapor via WA"
                className={FIELD}
              />
            </label>
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" disabled={m.isPending}>
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
