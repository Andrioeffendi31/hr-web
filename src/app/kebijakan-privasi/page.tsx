/**
 * Halaman publik — TIDAK boleh di balik autentikasi. Google Play mewajibkan URL
 * kebijakan privasi yang bisa dibuka peninjau tanpa akun.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { PERUSAHAAN } from "@/lib/hr";
import nanumLogo from "../../../public/images/nanumhr-logo.png";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — NanumHR",
  description: "Data apa yang dikumpulkan aplikasi presensi NanumHR, untuk apa, dan berapa lama disimpan.",
};

const BERLAKU = "16 September 2026";
const KONTAK = "nanumhr.app@gmail.com";
const Surel = () => <a className={styles.email} href={`mailto:${KONTAK}`}>{KONTAK}</a>;
const Tegas = ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>;

function Bagian({ nomor, id, judul, children }: { nomor: string; id: string; judul: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} id={id}>
      <div className={styles.sectionHeading}><span aria-hidden>{nomor}</span><h2>{judul}</h2></div>
      <div className={styles.prose}>{children}</div>
    </section>
  );
}

const SOROTAN = [
  { nomor: "01", judul: "Tidak dijual, tidak untuk iklan", isi: "Tidak ada SDK pelacakan atau analitik pihak ketiga di dalam aplikasi ini." },
  { nomor: "02", judul: "Lokasi berhenti saat absen keluar", isi: "Perekaman lokasi di latar belakang hanya berjalan di antara absen masuk dan absen keluar Anda." },
  { nomor: "03", judul: "Hanya untuk karyawan", isi: "Tidak ada pendaftaran mandiri. Akun Anda dibuat oleh tim HR perusahaan." },
];

const DATA: { label: string; tone: "primary" | "info" | "neutral"; isi: React.ReactNode }[] = [
  { label: "Lokasi presisi", tone: "info", isi: "Koordinat GPS Anda saat menekan absen masuk dan absen keluar, untuk memastikan absennya benar-benar dilakukan di area kantor." },
  { label: "Lokasi latar belakang", tone: "info", isi: <>Selama Anda sudah absen masuk dan belum absen keluar, aplikasi mencatat satu titik lokasi kira-kira setiap 3 jam sebagai catatan kehadiran untuk HR. Perekaman ini <Tegas>berhenti seketika saat Anda absen keluar</Tegas>. Di luar jam kerja, di hari libur, dan saat Anda cuti, aplikasi tidak merekam apa pun.</> },
  { label: "Foto", tone: "primary", isi: "Foto selfie yang Anda ambil sebagai bukti absen, dan foto profil yang Anda pilih sendiri." },
  { label: "Data kepegawaian", tone: "neutral", isi: "NIK, nama, email kantor, nomor telepon, alamat, tempat dan tanggal lahir, jenis kelamin, agama, kontak darurat, divisi, jabatan, dan status kontrak. Semua ini diisi tim HR saat akun Anda dibuat, bukan dikumpulkan diam-diam oleh aplikasi." },
  { label: "Data kehadiran", tone: "neutral", isi: "Tanggal, jam masuk dan keluar, status kehadiran, serta alasan yang Anda tulis sendiri ketika terlambat, pulang lebih awal, atau absen keluar dari luar area kantor." },
  { label: "Berkas unggahan", tone: "neutral", isi: "Berkas yang Anda lampirkan pada pengajuan cuti, izin, atau lembur — misalnya surat dokter." },
  { label: "Data perangkat", tone: "neutral", isi: <>Token notifikasi push, dan kunci publik passkey kalau Anda mengaktifkan masuk dengan sidik jari atau Face ID. <Tegas>Kunci privat passkey tidak pernah meninggalkan perangkat Anda</Tegas> dan tidak dapat kami baca.</> },
  { label: "Log aktivitas", tone: "neutral", isi: "Catatan tindakan administratif — siapa menyetujui pengajuan siapa, siapa mengubah data apa — supaya setiap keputusan bisa ditelusuri kembali." },
];

const NAVIGASI = [
  ["data", "Data yang dikumpulkan"], ["penggunaan", "Penggunaan data"],
  ["akses", "Akses dan penyimpanan"], ["retensi", "Masa simpan"],
  ["keamanan", "Keamanan"], ["hak", "Hak Anda"],
  ["anak", "Anak-anak"], ["perubahan", "Perubahan kebijakan"],
] as const;

export default function KebijakanPrivasiPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#isi-kebijakan">Lewati ke isi kebijakan</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#atas" aria-label="NanumHR — ke atas">
            <Image src={nanumLogo} alt="" width={32} height={32} className={styles.logo} priority />
            <span className={styles.brandName}>Nanum<span>HR</span></span>
          </a>
          <span className={styles.headerLabel}>Dokumen legal</span>
          <a className={styles.contactLink} href={`mailto:${KONTAK}`}>Hubungi kami <span aria-hidden>↗</span></a>
        </div>
      </header>

      <main id="isi-kebijakan">
        <section className={styles.hero} id="atas">
          <div className={styles.heroGrid}>
            <div>
              <h1>Data Anda tetap punya batas.</h1>
              <p className={styles.lead}>Halaman ini menjelaskan data apa saja yang NanumHR ambil, kapan pengambilannya berhenti, dan siapa yang boleh melihatnya.</p>
            </div>
            <dl className={styles.documentMeta}>
              <div><dt>Berlaku sejak</dt><dd>{BERLAKU}</dd></div>
              <div><dt>Pengelola data</dt><dd>{PERUSAHAAN}</dd></div>
              <div><dt>Kontak</dt><dd><Surel /></dd></div>
            </dl>
          </div>
        </section>

        <section className={styles.intro} aria-labelledby="tentang-nanumhr">
          <h2 id="tentang-nanumhr">Tentang layanan ini</h2>
          <p>NanumHR adalah aplikasi presensi untuk karyawan {PERUSAHAAN}. Aplikasinya tertutup: tidak dibuka untuk umum, tidak ada pendaftaran mandiri, dan setiap akun dibuat oleh tim HR. Yang bertanggung jawab atas data di dalamnya (<i>data controller</i>) adalah {PERUSAHAAN}.</p>
        </section>

        <section className={styles.commitments} aria-labelledby="komitmen-kami">
          <div className={styles.commitmentTitle}><span className={styles.kicker}>Intinya</span><h2 id="komitmen-kami">Tiga batas yang kami pegang.</h2></div>
          <ol>{SOROTAN.map((item) => <li key={item.nomor}><span className={styles.commitmentNumber}>{item.nomor}</span><div><h3>{item.judul}</h3><p>{item.isi}</p></div></li>)}</ol>
        </section>

        <div className={styles.documentLayout}>
          <aside className={styles.toc} aria-label="Daftar isi">
            <span>Di halaman ini</span>
            <nav>{NAVIGASI.map(([id, label], index) => <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span>{label}</a>)}</nav>
          </aside>

          <article className={styles.article}>
            <Bagian nomor="01" id="data" judul="Data yang kami kumpulkan">
              <div className={styles.dataList}>
                {DATA.map((item, index) => (
                  <div className={styles.dataRow} key={item.label}>
                    <span className={styles.dataIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div><h3><i className={styles[item.tone]} aria-hidden />{item.label}</h3><p>{item.isi}</p></div>
                  </div>
                ))}
              </div>
              <p className={styles.note}><span>Catatan</span>Aplikasi juga memeriksa tanda-tanda lokasi palsu — aplikasi GPS tiruan, atau perpindahan jarak yang mustahil ditempuh — lalu menandai titik yang mencurigakan supaya bisa ditinjau HR.</p>
            </Bagian>

            <Bagian nomor="02" id="penggunaan" judul="Untuk apa data ini dipakai">
              <p>Semua data di atas hanya dipakai untuk mencatat kehadiran, memproses pengajuan cuti, izin, dan lembur, menyampaikan pengumuman internal, serta mengurus administrasi kepegawaian.</p>
              <p><Tegas>Kami tidak menjual data Anda, tidak memakainya untuk iklan, dan tidak membagikannya kepada pihak ketiga untuk tujuan pemasaran.</Tegas> Tidak ada SDK pelacakan atau analitik pihak ketiga di dalam aplikasi ini, dan kami tidak membangun profil apa pun tentang Anda untuk tujuan lain.</p>
            </Bagian>

            <Bagian nomor="03" id="akses" judul="Siapa yang bisa melihat data Anda">
              <ul><li>Anda sendiri, lewat aplikasi.</li><li>Atasan langsung Anda — sebatas kehadiran dan pengajuan tim yang ia pimpin.</li><li>Tim HR dan administrator sistem perusahaan.</li></ul>
              <p>Datanya sendiri dititipkan pada penyedia layanan berikut. Mereka memproses data atas nama kami dan terikat perjanjian pemrosesan data: <Tegas>Neon</Tegas> (basis data, wilayah Singapura), <Tegas>Cloudflare R2</Tegas> (penyimpanan foto dan berkas), <Tegas>Vercel</Tegas> (hosting aplikasi), serta <Tegas>Expo dan Firebase Cloud Messaging</Tegas> (pengiriman notifikasi push). Karena penyedia ini berkedudukan di luar Indonesia, data Anda ikut tersimpan di luar negeri.</p>
              <p>Di luar mereka, data hanya kami buka kalau hukum mewajibkannya atau ada permintaan resmi dari aparat yang berwenang.</p>
            </Bagian>

            <Bagian nomor="04" id="retensi" judul="Berapa lama disimpan">
              <p>Data kehadiran, pengajuan, dan berkas tersimpan selama Anda masih menjadi karyawan.</p><p>Catatan kehadiran harian dirangkum lebih dulu menjadi arsip laporan bulanan; data mentahnya baru kami hapus secara berkala setelah arsip penggantinya terbukti ada. Setelah Anda berhenti bekerja, data kepegawaian kami simpan selama masih dibutuhkan untuk memenuhi kewajiban ketenagakerjaan dan perpajakan, lalu dihapus.</p>
            </Bagian>

            <Bagian nomor="05" id="keamanan" judul="Keamanan">
              <p>Kata sandi Anda disimpan dalam bentuk teracak (<i>hash</i>), tidak pernah sebagai teks biasa — kami sendiri tidak bisa membacanya. Seluruh komunikasi antara aplikasi dan server berjalan lewat HTTPS, dan siapa boleh melihat apa dibatasi menurut peran: karyawan, atasan, HR, atau administrator.</p>
            </Bagian>

            <Bagian nomor="06" id="hak" judul="Hak Anda">
              <p>Anda berhak melihat data yang kami simpan tentang Anda, meminta perbaikan kalau ada yang keliru, dan meminta penghapusan data yang tidak lagi wajib kami simpan.</p><p>Izin lokasi, kamera, dan notifikasi juga bisa Anda cabut kapan saja lewat pengaturan perangkat. Perlu diingat, fitur absen tidak dapat berjalan tanpa izin lokasi dan kamera.</p>
              <p>Kirim permintaan Anda ke <Surel />, dan kami jawab paling lambat 30 hari kerja.</p>
            </Bagian>

            <Bagian nomor="07" id="anak" judul="Anak-anak">
              <p>NanumHR dibuat untuk karyawan, bukan untuk anak di bawah 18 tahun, dan kami tidak mengumpulkan data anak.</p>
            </Bagian>

            <Bagian nomor="08" id="perubahan" judul="Perubahan kebijakan ini">
              <p>Kalau kebijakan ini berubah, tanggal berlakunya di atas ikut diperbarui, dan perubahan yang penting kami sampaikan lewat pengumuman di dalam aplikasi.</p>
            </Bagian>
          </article>
        </div>

        <section className={styles.contact} aria-labelledby="masih-ada-pertanyaan">
          <div><span className={styles.kicker}>Kontak privasi</span><h2 id="masih-ada-pertanyaan">Masih ada pertanyaan tentang data Anda?</h2></div>
          <a href={`mailto:${KONTAK}`}>{KONTAK}<span aria-hidden>↗</span></a>
        </section>
      </main>

      <footer className={styles.footer}><div><span>NanumHR · {PERUSAHAAN}</span><span className={styles.copyright}>© {new Date().getFullYear()}</span><a href="#atas">Kembali ke atas ↑</a></div></footer>
    </div>
  );
}
