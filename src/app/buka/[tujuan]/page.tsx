import Image from "next/image";
import { notFound } from "next/navigation";
import nanumLogo from "../../../../public/images/nanumhr-logo.png";

export const metadata = { title: "Buka di aplikasi — NanumHR" };

/**
 * Cadangan untuk tautan yang seharusnya membuka aplikasi.
 *
 * Setiap tautan di email menunjuk ke sini, dan di ponsel yang sudah memasang
 * NanumHR halaman ini **tidak pernah terlihat**: `android.intentFilters` di
 * app.json mendaftarkan /buka sebagai App Link terverifikasi, jadi Android
 * membuka aplikasinya sebelum browser sempat meminta halaman ini. Yang sampai ke
 * sini hanyalah desktop dan ponsel tanpa aplikasi.
 *
 * Alamatnya tetap https, bukan `nanumhr://`, karena Gmail dan sebagian besar
 * klien email membuang tautan yang bukan http — tombol dengan skema khusus akan
 * mati justru di tempat tautan itu paling sering dibuka.
 *
 * Publik: pengingat absen dibuka dari kotak masuk, sering pada perangkat yang
 * belum pernah login. Halaman ini tidak memuat data siapa pun, jadi tidak ada
 * yang perlu dijaga sesi.
 */

const TUJUAN: Record<string, string> = {
  absen: "mencatat absen masuk atau keluar",
  pengajuan: "melihat pengajuan cuti dan lembur Anda",
  kehadiran: "melihat riwayat kehadiran Anda",
  pengumuman: "membaca pengumuman perusahaan",
};

export default async function BukaPage({
  params,
}: {
  params: Promise<{ tujuan: string }>;
}) {
  const { tujuan } = await params;
  const maksud = TUJUAN[tujuan];
  // alamat yang dikarang tidak mendapat halaman yang terlihat sah
  if (!maksud) notFound();

  return (
    <main className="bg-surface-2 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-[420px] rounded-[14px] border p-6 text-center shadow-sm">
        <Image
          src={nanumLogo}
          alt=""
          width={132}
          height={30}
          className="mx-auto h-[30px] w-auto"
          priority
        />
        <h1 className="mt-5 text-[17px] font-semibold tracking-[-0.01em]">
          Buka lewat aplikasi NanumHR
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
          Kehadiran, cuti, dan lembur dikerjakan di aplikasi NanumHR di ponsel
          Anda — termasuk {maksud}. Buka tautan ini dari ponsel yang sudah
          memasang aplikasinya.
        </p>
        {/*
          Tanpa tombol unduh: APK-nya dibagikan tim HR, bukan lewat toko aplikasi,
          jadi tautan unduh di sini akan menjadi tautan yang membusuk pada rilis
          berikutnya — dan tautan mati lebih buruk daripada satu kalimat jujur.
        */}
        <p className="text-subtle mt-4 text-[11.5px] leading-relaxed">
          Belum punya aplikasinya? Hubungi tim HR untuk pemasangannya.
        </p>
      </div>
    </main>
  );
}
