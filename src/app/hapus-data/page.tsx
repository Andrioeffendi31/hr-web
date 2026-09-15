/**
 * Halaman publik, syarat "URL penghapusan data" di Data safety Play Console.
 * Google menuntut tiga hal di satu halaman: nama aplikasi/pengembang, langkah
 * yang harus ditempuh pengguna, dan jenis data yang dihapus versus yang ditahan
 * beserta periode retensinya. Anchor di kebijakan privasi tidak memenuhi itu,
 * makanya halaman ini berdiri sendiri — dan memakai CSS module yang sama supaya
 * tidak ada sistem desain kedua yang harus dirawat.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { PERUSAHAAN } from "@/lib/hr";
import nanumLogo from "../../../public/images/nanumhr-logo.png";
import styles from "../kebijakan-privasi/privacy.module.css";

export const metadata: Metadata = {
  title: "Penghapusan Data — NanumHR",
  description: "Cara karyawan meminta penghapusan data NanumHR, data apa yang dihapus, dan apa yang masih harus disimpan.",
};

const KONTAK = "nanumhr.app@gmail.com";
const Surel = () => <a className={styles.email} href={`mailto:${KONTAK}`}>{KONTAK}</a>;

const DIHAPUS = [
  "Foto selfie bukti absen dan foto profil Anda",
  "Titik lokasi yang terekam selama Anda absen masuk",
  "Berkas lampiran pengajuan cuti, izin, dan lembur",
  "Token notifikasi push dan kunci publik passkey perangkat Anda",
  "Nomor telepon, alamat, kontak darurat, dan data pribadi lain di profil",
  "Akses masuk ke aplikasi — akun dinonaktifkan dan tidak bisa dipakai lagi",
];

const DITAHAN = [
  ["Catatan kehadiran harian", "Dirangkum jadi arsip laporan bulanan, lalu data mentahnya dihapus"],
  ["Pengajuan cuti, izin, dan lembur yang sudah diputuskan", "Bukti hak dan kewajiban yang sudah timbul"],
  ["Nama, NIK, jabatan, dan masa kerja", "Dibutuhkan untuk kewajiban ketenagakerjaan dan perpajakan"],
  ["Log audit keputusan administratif", "Menjaga keputusan atasan dan HR tetap dapat ditelusuri"],
];

export default function HapusDataPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#isi">Lewati ke isi halaman</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#atas" aria-label="NanumHR — ke atas">
            <Image src={nanumLogo} alt="" width={32} height={32} className={styles.logo} priority />
            <span className={styles.brandName}>Nanum<span>HR</span></span>
          </a>
          <span className={styles.headerLabel}>Dokumen legal</span>
          <a className={styles.contactLink} href={`mailto:${KONTAK}`}>Hubungi kami</a>
        </div>
      </header>

      <main id="isi">
        <section className={styles.hero} id="atas">
          <div className={styles.heroGrid}>
            <div>
              <span className={styles.kicker}>Penghapusan data</span>
              <h1>Meminta data Anda dihapus.</h1>
              <p className={styles.lead}>
                Berlaku untuk aplikasi <strong>NanumHR</strong> (paket <code>app.nanumhr</code>),
                yang diterbitkan oleh {PERUSAHAAN}.
              </p>
            </div>
            <dl className={styles.documentMeta}>
              <div><dt>Aplikasi</dt><dd>NanumHR</dd></div>
              <div><dt>Pengembang</dt><dd>{PERUSAHAAN}</dd></div>
              <div><dt>Kontak</dt><dd><Surel /></dd></div>
            </dl>
          </div>
        </section>

        <div className={styles.documentLayout}>
          <aside className={styles.toc} aria-label="Daftar isi">
            <span>Di halaman ini</span>
            <nav>
              <a href="#langkah"><span>01</span>Cara mengajukan</a>
              <a href="#dihapus"><span>02</span>Yang dihapus</a>
              <a href="#ditahan"><span>03</span>Yang masih disimpan</a>
            </nav>
          </aside>

          <article className={styles.article}>
            <section className={styles.section} id="langkah">
              <div className={styles.sectionHeading}><span aria-hidden>01</span><h2>Cara mengajukan penghapusan</h2></div>
              <div className={styles.prose}>
                <ul>
                  <li>Kirim email ke <Surel /> dengan subjek <strong>Permintaan penghapusan data</strong>.</li>
                  <li>Sebutkan <strong>nama lengkap</strong> dan <strong>email kantor</strong> yang Anda pakai untuk masuk ke NanumHR, supaya tim HR dapat memastikan permintaan itu benar dari Anda.</li>
                  <li>Tulis apakah Anda ingin <strong>seluruh data dihapus</strong> atau hanya sebagian, misalnya foto selfie dan titik lokasi saja.</li>
                  <li>Tim HR memverifikasi permintaan Anda, lalu menjawabnya <strong>paling lambat 30 hari kerja</strong> dan memberi tahu data mana yang sudah dihapus.</li>
                </ul>
                <p>
                  Penghapusan tidak dapat dilakukan sendiri dari dalam aplikasi. NanumHR adalah
                  aplikasi kepegawaian internal: catatan kehadiran adalah bukti hubungan kerja, jadi
                  penghapusannya melewati tim HR, bukan satu tombol di layar profil.
                </p>
              </div>
            </section>

            <section className={styles.section} id="dihapus">
              <div className={styles.sectionHeading}><span aria-hidden>02</span><h2>Data yang dihapus</h2></div>
              <div className={styles.prose}>
                <p>Atas permintaan Anda, data berikut dihapus dari basis data dan penyimpanan berkas kami:</p>
                <ul>{DIHAPUS.map((x) => <li key={x}>{x}</li>)}</ul>
                <p>
                  Penghapusan bersifat permanen: objek foto dan berkas dihapus dari penyimpanan
                  lebih dulu, baru barisnya dihapus dari basis data, sehingga tidak ada berkas
                  yatim yang tertinggal. Salinan cadangan yang sudah terlanjur dibuat ikut hilang
                  saat siklus cadangan itu berakhir, <strong>paling lama 30 hari</strong>.
                </p>
              </div>
            </section>

            <section className={styles.section} id="ditahan">
              <div className={styles.sectionHeading}><span aria-hidden>03</span><h2>Data yang masih kami simpan</h2></div>
              <div className={styles.prose}>
                <p>
                  Sebagian data tidak dapat kami hapus atas permintaan, karena hukum
                  ketenagakerjaan dan perpajakan mewajibkan kami menyimpannya:
                </p>
                <ul>{DITAHAN.map(([apa, kenapa]) => <li key={apa}><strong>{apa}</strong> — {kenapa}.</li>)}</ul>
                <p>
                  Data yang ditahan ini disimpan <strong>paling lama 10 tahun</strong> terhitung
                  sejak akhir tahun buku Anda berhenti bekerja, mengikuti kewajiban penyimpanan
                  dokumen perpajakan, lalu dihapus. Data ini hanya dapat dilihat tim HR dan
                  administrator sistem, dan tidak pernah dipakai untuk iklan atau tujuan lain.
                </p>
              </div>
            </section>
          </article>
        </div>

        <section className={styles.contact} aria-labelledby="ajukan">
          <div><span className={styles.kicker}>Kontak privasi</span><h2 id="ajukan">Siap mengajukan penghapusan data?</h2></div>
          <a href={`mailto:${KONTAK}?subject=Permintaan%20penghapusan%20data`}>Kirim email ke kami</a>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <span>NanumHR · {PERUSAHAAN}</span>
          <span className={styles.copyright}>© {new Date().getFullYear()}</span>
          <a href="/kebijakan-privasi">Kebijakan privasi</a>
        </div>
      </footer>
    </div>
  );
}
