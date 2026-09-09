import Image from "next/image";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, leaveRequests, settings } from "@/db/schema";
import {
  PERUSAHAAN,
  isoWib,
  jam,
  rentangResmi,
  tanggalResmi,
} from "@/lib/hr";
import { idDariToken, nomorSurat } from "@/lib/surat";
import nanumLogo from "../../../../public/images/nanumhr-logo.png";

export const metadata = {
  title: "Verifikasi surat izin — NanumHR",
  // surat izin memuat nama orang; halaman ini tidak boleh berakhir di hasil
  // pencarian hanya karena satu QR pernah dipindai di perangkat yang berbagi data
  robots: { index: false, follow: false },
};

/**
 * Sasaran QR pada surat izin — dibuka siapa pun, tanpa login.
 *
 * Yang membuat halaman ini bisa dipercaya bukan tokennya (token hanya
 * membuktikan nomor pengajuannya diterbitkan sistem ini), melainkan bahwa
 * statusnya dibaca SEGAR dari database setiap kali dipindai. Izin yang kemudian
 * dibatalkan akan berhenti sah di sini tanpa ada yang perlu menarik kertas yang
 * sudah dicetak.
 *
 * Isinya sengaja hanya yang sudah tercetak di kertas itu: nama, jenis, tanggal,
 * nomor surat. Tidak ada alasan izin, tidak ada nama penyetuju — siapa pun yang
 * menemukan kertasnya tergeletak bisa membuka halaman ini.
 */

const KEADAAN = {
  disetujui: {
    judul: "Surat ini sah",
    catatan: "Izin ini telah disetujui dan tercatat di sistem kepegawaian.",
    kelas: "bg-success-subtle text-success border-success/30",
  },
  menunggu: {
    judul: "Belum disetujui",
    catatan:
      "Pengajuan ini masih menunggu keputusan. Surat yang Anda pegang belum bisa dipakai sebagai bukti izin.",
    kelas: "bg-warning-subtle text-warning border-warning/30",
  },
  menunggu_pimpinan: {
    judul: "Belum disetujui",
    catatan:
      "Pengajuan ini sudah diperiksa admin tetapi belum disetujui pimpinan, jadi belum bisa dipakai sebagai bukti izin.",
    kelas: "bg-warning-subtle text-warning border-warning/30",
  },
  revisi: {
    judul: "Belum disetujui",
    catatan:
      "Pengajuan ini dikembalikan untuk diperbaiki, jadi belum bisa dipakai sebagai bukti izin.",
    kelas: "bg-warning-subtle text-warning border-warning/30",
  },
  ditolak: {
    judul: "Pengajuan ditolak",
    catatan: "Izin ini tidak diberikan. Surat ini tidak berlaku.",
    kelas: "bg-danger-subtle text-danger border-danger/30",
  },
  dibatalkan: {
    judul: "Pengajuan dibatalkan",
    /**
     * Tidak menyebut SIAPA yang membatalkan.
     *
     * Dulu berbunyi "oleh karyawannya sendiri" karena itu memang satu-satunya
     * jalan yang ada. Sejak admin dan Pimpinan bisa mencabut cuti yang sudah
     * disetujui, ada dua kemungkinan — dan halaman ini, yang dibuka siapa pun
     * yang memindai QR-nya, tidak berhak menebak yang mana. Yang perlu diketahui
     * pemindai hanya satu: suratnya tidak berlaku.
     */
    catatan: "Pengajuan ini dibatalkan. Surat ini tidak berlaku.",
    kelas: "bg-muted text-muted-foreground border-border",
  },
} as const;

export default async function VerifikasiPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = idDariToken(token);
  // tanda yang tidak cocok tidak mendapat halaman yang terlihat sah — dan tidak
  // mendapat pesan yang membedakannya dari nomor yang tidak ada
  if (!id) notFound();

  const [row] = await db
    .select({
      id: leaveRequests.id,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      startTime: leaveRequests.startTime,
      endTime: leaveRequests.endTime,
      days: leaveRequests.days,
      status: leaveRequests.status,
      decidedAt: leaveRequests.decidedAt,
      createdAt: leaveRequests.createdAt,
      nama: employees.name,
      nik: employees.nik,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(eq(leaveRequests.id, id))
    .limit(1);
  if (!row) notFound();

  const [cfg] = await db
    .select({ companyName: settings.companyName })
    .from(settings)
    .limit(1);

  const k = KEADAAN[row.status];
  const setengahHari = Boolean(row.startTime && row.endTime);
  const rincian: [string, string][] = [
    ["Nama", row.nama],
    ["NIK", row.nik],
    ["Jenis", row.type],
    [
      "Tanggal",
      setengahHari
        ? tanggalResmi(row.startDate)
        : rentangResmi(row.startDate, row.endDate),
    ],
    setengahHari
      ? ["Jam izin", `${jam(row.startTime)}–${jam(row.endTime)}`]
      : ["Lama", `${row.days} hari kerja`],
    ["Nomor surat", nomorSurat(row.id, isoWib(row.decidedAt ?? row.createdAt))],
  ];

  return (
    <main className="bg-surface-2 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-[430px] rounded-[14px] border p-6 shadow-sm">
        <Image
          src={nanumLogo}
          alt=""
          width={132}
          height={30}
          className="mx-auto h-[30px] w-auto"
          priority
        />

        <div className={`mt-5 rounded-[11px] border p-4 text-center ${k.kelas}`}>
          <div className="text-[17px] font-semibold tracking-[-0.01em]">
            {k.judul}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed opacity-90">
            {k.catatan}
          </p>
        </div>

        <dl className="mt-4 divide-y">
          {rincian.map(([label, isi]) => (
            <div key={label} className="flex gap-3 py-2.5">
              <dt className="text-subtle w-[104px] shrink-0 text-[12px]">
                {label}
              </dt>
              <dd className="text-[12.5px] font-medium">{isi}</dd>
            </div>
          ))}
        </dl>

        <p className="text-subtle mt-4 text-[11.5px] leading-relaxed">
          Halaman ini dihasilkan langsung oleh sistem kepegawaian{" "}
          {cfg?.companyName ?? PERUSAHAAN} dan menampilkan status terkini, bukan
          salinan yang tercetak. Pertanyaan lebih lanjut: hubungi tim HR.
        </p>
      </div>
    </main>
  );
}
