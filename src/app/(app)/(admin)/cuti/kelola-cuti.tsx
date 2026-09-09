"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReasonDialog } from "@/components/reason-dialog";
import { deductsBalance, rentangTanggal, todayWib } from "@/lib/hr";
import type { LeaveRow } from "./queue";

/**
 * Batalkan dan hapus — dua aksi mundur yang hanya dimiliki admin & Pimpinan.
 *
 * Sengaja bersebelahan tapi berbeda bentuk dialognya, karena akibatnya berbeda:
 *
 * - **Batalkan** menyisakan barisnya dan MEMBERI TAHU karyawannya, jadi ia
 *   menuntut alasan — kalimat itulah yang orang tersebut baca di aplikasinya.
 * - **Hapus** tidak menyisakan apa pun untuk dibaca siapa pun, jadi yang perlu
 *   dijaga bukan sebabnya melainkan agar tidak terjadi karena salah ketuk.
 */
export function KelolaCuti({ r }: { r: LeaveRow }) {
  const router = useRouter();

  const kirim = async (init: RequestInit) => {
    const res = await fetch("/api/requests", {
      headers: { "content-type": "application/json" },
      ...init,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Gagal memproses pengajuan");
    return data;
  };

  const batal = useMutation({
    mutationFn: (note: string) =>
      kirim({
        method: "POST",
        body: JSON.stringify({ kind: "cuti", id: r.id, action: "dibatalkan", note }),
      }),
    onSuccess: () => {
      toast.success(`Cuti ${r.name} dibatalkan · pemberitahuan terkirim`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hapus = useMutation({
    mutationFn: () =>
      kirim({ method: "DELETE", body: JSON.stringify({ kind: "cuti", id: r.id }) }),
    onSuccess: () => {
      toast.success(`Pengajuan ${r.name} dihapus`);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sudahBerlaku = r.status === "disetujui";
  // hari yang SUDAH lewat akan berbalik jadi tanpa keterangan begitu cutinya
  // dicabut — itu yang paling perlu disebut sebelum orang menekan tombolnya
  const sudahLewat = sudahBerlaku && r.endDate < todayWib();
  const rentang = rentangTanggal(r.startDate, r.endDate);
  const balik = deductsBalance(r.type) && r.days > 0;

  const tombol =
    "inline-flex h-8 items-center rounded-[8px] border px-2.5 text-[12.5px] font-medium transition-colors";

  return (
    <div className="mt-3 flex gap-2">
      {r.status !== "ditolak" && r.status !== "dibatalkan" && (
        <ReasonDialog
          trigger={
            <button
              type="button"
              disabled={batal.isPending}
              className={`${tombol} border-border-strong bg-surface-2 hover:bg-accent disabled:opacity-50`}
            >
              Batalkan
            </button>
          }
          title={`Batalkan cuti ${r.name}?`}
          description={
            <>
              {r.type} · {rentang}
              {sudahBerlaku ? (
                <>
                  {" "}
                  — cuti ini <strong>sudah disetujui</strong> dan berlaku.
                  {balik ? ` ${r.days} hari kembali ke saldonya.` : ""}
                  {sudahLewat ? (
                    <>
                      {" "}
                      Tanggalnya sudah lewat, jadi hari-hari itu akan berbalik
                      menjadi <strong>tanpa keterangan</strong> di papan dan
                      laporan.
                    </>
                  ) : null}
                </>
              ) : (
                " — pengajuan ini belum diputus."
              )}
              <br />
              <br />
              Alasannya dikirim ke {r.name} lewat email dan notifikasi, jadi
              tulis yang bisa ia pahami.
            </>
          }
          label="Alasan pembatalan"
          placeholder="mis. proyek mendesak, cuti dijadwalkan ulang"
          required
          confirmLabel="Batalkan cuti"
          onSubmit={(note) => batal.mutate(note)}
        />
      )}

      <ConfirmDialog
        trigger={
          <button
            type="button"
            disabled={hapus.isPending}
            className={`${tombol} border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50`}
          >
            Hapus
          </button>
        }
        title={`Hapus pengajuan ${r.name}?`}
        description={
          <>
            {r.type} · {rentang} · {r.days} hari · status {r.status}.
            {r.attachmentName ? ` Lampiran ${r.attachmentName} ikut dihapus.` : ""}
            {sudahBerlaku ? (
              <>
                {" "}
                Cuti ini <strong>sudah disetujui</strong>: saldo dan status
                hariannya akan berubah, dan{" "}
                <strong>tidak ada baris apa pun yang tertinggal</strong> untuk
                menjelaskannya — hanya catatan di log audit.
              </>
            ) : null}
            <br />
            <br />
            Tidak bisa dibatalkan. Kalau {r.name} perlu tahu alasannya, gunakan
            Batalkan, bukan Hapus.
          </>
        }
        confirmLabel="Hapus permanen"
        destructive
        onConfirm={() => hapus.mutate()}
      />
    </div>
  );
}
