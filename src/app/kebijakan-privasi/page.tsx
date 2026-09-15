/**
 * Halaman publik — TIDAK boleh di balik autentikasi. Google Play mewajibkan URL
 * kebijakan privasi yang bisa dibuka peninjau tanpa akun, dan peninjau NanumHR
 * tidak punya akun karyawan. Karena itu rutenya ada di root `app/`, di luar
 * grup `(app)` yang layout-nya memanggil auth().
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — NanumHR",
  description:
    "Data apa yang dikumpulkan aplikasi presensi NanumHR, untuk apa, dan berapa lama disimpan.",
};

const BERLAKU = "16 September 2026";
const KONTAK = "hr@nanumindahsejati.co.id";

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-slate-900">{judul}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default function KebijakanPrivasiPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-slate-900">Kebijakan Privasi NanumHR</h1>
      <p className="mt-2 text-sm text-slate-500">Berlaku sejak {BERLAKU}</p>

      <p className="mt-8">
        NanumHR adalah aplikasi presensi internal PT Nanum Indah Sejati. Aplikasi ini
        hanya dipakai oleh karyawan perusahaan; tidak tersedia untuk umum dan tidak
        menerima pendaftaran mandiri. Akun dibuat oleh tim HR.
      </p>
      <p>
        Pengelola data (data controller) adalah PT Nanum Indah Sejati. Pertanyaan
        mengenai data Anda dapat dikirim ke{" "}
        <a className="font-medium text-blue-700 underline" href={`mailto:${KONTAK}`}>
          {KONTAK}
        </a>
        .
      </p>

      <Bagian judul="Data yang kami kumpulkan">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Data kepegawaian</strong> — NIK, nama, email kantor, nomor telepon,
            alamat, tempat dan tanggal lahir, jenis kelamin, agama, kontak darurat,
            divisi, jabatan, status kontrak, dan foto profil. Data ini diinput oleh HR,
            bukan dikumpulkan diam-diam oleh aplikasi.
          </li>
          <li>
            <strong>Data kehadiran</strong> — tanggal, jam absen masuk dan keluar,
            status kehadiran, serta alasan yang Anda tulis saat terlambat, pulang lebih
            awal, atau absen keluar di luar area kantor.
          </li>
          <li>
            <strong>Lokasi presisi</strong> — koordinat GPS Anda pada saat absen masuk
            dan absen keluar, untuk memastikan absen dilakukan di area kantor.
          </li>
          <li>
            <strong>Lokasi di latar belakang</strong> — selama Anda berstatus sudah
            absen masuk dan belum absen keluar, aplikasi mencatat titik lokasi kira-kira
            setiap 3 jam sebagai catatan kehadiran untuk HR. Perekaman ini{" "}
            <strong>berhenti seketika saat Anda absen keluar</strong>, dan tidak berjalan
            di luar jam kerja, di hari libur, atau saat Anda sedang cuti.
          </li>
          <li>
            <strong>Foto</strong> — foto selfie yang Anda ambil sebagai bukti absen, dan
            foto profil yang Anda pilih sendiri.
          </li>
          <li>
            <strong>Berkas yang Anda unggah</strong> — lampiran pengajuan cuti, izin,
            atau lembur (misalnya surat dokter).
          </li>
          <li>
            <strong>Data perangkat</strong> — token notifikasi push, dan kunci publik
            passkey bila Anda mengaktifkan masuk dengan sidik jari atau Face ID. Kunci
            privat passkey tidak pernah meninggalkan perangkat Anda dan tidak dapat kami
            baca.
          </li>
          <li>
            <strong>Log aktivitas</strong> — catatan tindakan administratif (siapa
            menyetujui pengajuan siapa, siapa mengubah data apa) untuk keperluan audit.
          </li>
        </ul>
        <p>
          Aplikasi juga memeriksa indikasi pemalsuan lokasi (GPS palsu, lompatan jarak
          yang mustahil) dan menandai titik yang mencurigakan agar dapat ditinjau HR.
        </p>
      </Bagian>

      <Bagian judul="Untuk apa data ini dipakai">
        <p>
          Seluruh data di atas dipakai semata-mata untuk pencatatan kehadiran,
          pengelolaan pengajuan cuti/izin/lembur, pengumuman internal, dan administrasi
          kepegawaian.
        </p>
        <p className="font-medium text-slate-900">
          Kami tidak menjual data Anda, tidak memakainya untuk iklan, dan tidak
          membagikannya kepada pihak ketiga untuk tujuan pemasaran. Tidak ada SDK
          pelacakan atau analitik pihak ketiga di dalam aplikasi ini.
        </p>
      </Bagian>

      <Bagian judul="Siapa yang bisa melihat data Anda">
        <ul className="list-disc space-y-2 pl-5">
          <li>Anda sendiri, melalui aplikasi.</li>
          <li>Atasan langsung Anda, terbatas pada kehadiran dan pengajuan tim.</li>
          <li>Tim HR dan administrator sistem perusahaan.</li>
        </ul>
        <p>
          Data disimpan pada penyedia layanan berikut, yang memproses data atas nama
          kami dan terikat perjanjian pemrosesan data: <strong>Neon</strong> (basis
          data, wilayah Singapura), <strong>Cloudflare R2</strong> (penyimpanan foto dan
          berkas), <strong>Vercel</strong> (hosting aplikasi), serta{" "}
          <strong>Expo dan Firebase Cloud Messaging</strong> (pengiriman notifikasi
          push). Karena penyedia ini berada di luar Indonesia, data Anda ditransfer dan
          disimpan di luar negeri.
        </p>
        <p>
          Di luar itu, data hanya dibuka bila diwajibkan oleh hukum atau permintaan resmi
          aparat yang sah.
        </p>
      </Bagian>

      <Bagian judul="Berapa lama disimpan">
        <p>
          Data kehadiran, pengajuan, dan berkas disimpan selama Anda menjadi karyawan.
          Data kehadiran mentah dirangkum menjadi arsip laporan bulanan, dan data
          mentahnya dihapus secara berkala setelah arsip pengganti terbukti ada. Setelah
          Anda berhenti bekerja, data kepegawaian disimpan selama masih dibutuhkan untuk
          memenuhi kewajiban hukum ketenagakerjaan dan perpajakan, lalu dihapus.
        </p>
      </Bagian>

      <Bagian judul="Keamanan">
        <p>
          Sandi disimpan dalam bentuk hash, tidak pernah sebagai teks biasa. Seluruh
          komunikasi antara aplikasi dan server memakai HTTPS. Akses ke data dibatasi
          menurut peran: karyawan, atasan, HR, atau administrator.
        </p>
      </Bagian>

      <Bagian judul="Hak Anda">
        <p>
          Anda berhak melihat data yang kami simpan tentang Anda, meminta koreksi data
          yang keliru, dan meminta penghapusan data yang tidak lagi diwajibkan disimpan
          oleh hukum. Anda juga dapat mencabut izin lokasi, kamera, atau notifikasi kapan
          saja melalui pengaturan perangkat — dengan konsekuensi fitur absen tidak dapat
          dipakai tanpa izin lokasi dan kamera.
        </p>
        <p>
          Permintaan tersebut dikirim ke{" "}
          <a className="font-medium text-blue-700 underline" href={`mailto:${KONTAK}`}>
            {KONTAK}
          </a>{" "}
          dan kami jawab selambat-lambatnya 30 hari kerja.
        </p>
      </Bagian>

      <Bagian judul="Anak-anak">
        <p>
          NanumHR tidak ditujukan untuk anak di bawah 18 tahun dan tidak mengumpulkan
          data anak secara sengaja.
        </p>
      </Bagian>

      <Bagian judul="Perubahan kebijakan ini">
        <p>
          Bila kebijakan ini berubah, tanggal berlaku di atas diperbarui dan perubahan
          penting diumumkan melalui pengumuman di dalam aplikasi.
        </p>
      </Bagian>
    </main>
  );
}
