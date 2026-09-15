/**
 * Halaman publik — TIDAK boleh di balik autentikasi. Google Play mewajibkan URL
 * kebijakan privasi yang bisa dibuka peninjau tanpa akun, dan peninjau NanumHR
 * tidak punya akun karyawan. Karena itu rutenya ada di root `app/`, di luar
 * grup `(app)` yang layout-nya memanggil auth().
 */
import type { Metadata } from "next";
import Image from "next/image";
import { Panel, Pill, type Tone } from "@/components/bits";
import { PERUSAHAAN } from "@/lib/hr";
import nanumLogo from "../../../public/images/nanumhr-logo.png";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — NanumHR",
  description:
    "Data apa yang dikumpulkan aplikasi presensi NanumHR, untuk apa, dan berapa lama disimpan.",
};

const BERLAKU = "16 September 2026";
const KONTAK = "nanumhr.app@gmail.com";

const Surel = () => (
  <a
    className="text-primary font-medium hover:underline"
    href={`mailto:${KONTAK}`}
  >
    {KONTAK}
  </a>
);

/** Penekanan di dalam paragraf. Lewat token, supaya ikut benar di mode gelap. */
const Tegas = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-foreground font-semibold">{children}</strong>
);

function Bagian({
  judul,
  children,
}: {
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <Panel title={judul} className="mt-4">
      <div className="text-muted-foreground space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
        {children}
      </div>
    </Panel>
  );
}

/** Ringkasan yang menjawab pertanyaan pertama peninjau tanpa membaca seluruh
 *  halaman. Tiga, tidak lebih — daftar panjang berhenti jadi ringkasan. */
const SOROTAN = [
  {
    judul: "Tidak dijual, tidak untuk iklan",
    isi: "Tidak ada SDK pelacakan atau analitik pihak ketiga di dalam aplikasi ini.",
  },
  {
    judul: "Lokasi berhenti saat absen keluar",
    isi: "Perekaman lokasi di latar belakang hanya berjalan antara absen masuk dan absen keluar.",
  },
  {
    judul: "Hanya untuk karyawan",
    isi: "Tidak ada pendaftaran mandiri. Akun dibuat oleh tim HR perusahaan.",
  },
];

/** Jenis data → nada Pill. Nadanya mengikuti arti yang sudah dipakai di
 *  aplikasi (lihat ATT_TONE di bits.tsx): info untuk lokasi, primary untuk
 *  media yang diambil karyawan sendiri, netral untuk sisanya. */
const DATA: { label: string; tone: Tone; isi: React.ReactNode }[] = [
  {
    label: "Lokasi presisi",
    tone: "info",
    isi: "Koordinat GPS Anda pada saat absen masuk dan absen keluar, untuk memastikan absen dilakukan di area kantor.",
  },
  {
    label: "Lokasi latar belakang",
    tone: "info",
    isi: (
      <>
        Selama Anda berstatus sudah absen masuk dan belum absen keluar, aplikasi
        mencatat titik lokasi kira-kira setiap 3 jam sebagai catatan kehadiran
        untuk HR. Perekaman ini{" "}
        <Tegas>berhenti seketika saat Anda absen keluar</Tegas>, dan tidak
        berjalan di luar jam kerja, di hari libur, atau saat Anda sedang cuti.
      </>
    ),
  },
  {
    label: "Foto",
    tone: "primary",
    isi: "Foto selfie yang Anda ambil sebagai bukti absen, dan foto profil yang Anda pilih sendiri.",
  },
  {
    label: "Data kepegawaian",
    tone: "neutral",
    isi: "NIK, nama, email kantor, nomor telepon, alamat, tempat dan tanggal lahir, jenis kelamin, agama, kontak darurat, divisi, jabatan, dan status kontrak. Data ini diinput oleh HR, bukan dikumpulkan diam-diam oleh aplikasi.",
  },
  {
    label: "Data kehadiran",
    tone: "neutral",
    isi: "Tanggal, jam absen masuk dan keluar, status kehadiran, serta alasan yang Anda tulis saat terlambat, pulang lebih awal, atau absen keluar di luar area kantor.",
  },
  {
    label: "Berkas unggahan",
    tone: "neutral",
    isi: "Lampiran pengajuan cuti, izin, atau lembur — misalnya surat dokter.",
  },
  {
    label: "Data perangkat",
    tone: "neutral",
    isi: (
      <>
        Token notifikasi push, dan kunci publik passkey bila Anda mengaktifkan
        masuk dengan sidik jari atau Face ID.{" "}
        <Tegas>
          Kunci privat passkey tidak pernah meninggalkan perangkat Anda
        </Tegas>{" "}
        dan tidak dapat kami baca.
      </>
    ),
  },
  {
    label: "Log aktivitas",
    tone: "neutral",
    isi: "Catatan tindakan administratif — siapa menyetujui pengajuan siapa, siapa mengubah data apa — untuk keperluan audit.",
  },
];

export default function KebijakanPrivasiPage() {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="bg-card/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center gap-2.5 px-5 py-3 sm:px-8">
          <Image
            src={nanumLogo}
            alt="Logo NanumHR"
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-[10px] shadow-sm"
          />
          <div>
            <div className="font-heading text-[14.5px] font-bold tracking-tight">
              Nanum<span className="text-subtle font-semibold">HR</span>
            </div>
            <div className="text-subtle font-mono text-[10.5px]">
              {PERUSAHAAN} · 나눔컨설팅
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-16">
        <span className="bg-primary-subtle text-primary border-primary/25 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.09em] uppercase">
          Kebijakan Privasi
        </span>
        <h1 className="font-heading mt-5 max-w-[18ch] text-[34px] leading-[1.08] font-bold tracking-[-0.025em] sm:text-[42px]">
          Data Anda, dan apa yang kami lakukan dengannya.
        </h1>
        <p className="text-subtle mt-4 font-mono text-[11.5px]">
          Berlaku sejak {BERLAKU} · v1.0
        </p>

        <p className="text-muted-foreground mt-6 text-[15px] leading-relaxed">
          NanumHR adalah aplikasi presensi internal {PERUSAHAAN}. Aplikasi ini
          hanya dipakai oleh karyawan perusahaan; tidak tersedia untuk umum dan
          tidak menerima pendaftaran mandiri. Akun dibuat oleh tim HR.
          Pengelola data (<i>data controller</i>) adalah {PERUSAHAAN}, dan
          pertanyaan mengenai data Anda dapat dikirim ke <Surel />.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {SOROTAN.map((s) => (
            <div
              key={s.judul}
              className="bg-card rounded-[13px] border p-4 shadow-sm"
            >
              <div className="font-heading text-[13.5px] font-semibold">
                {s.judul}
              </div>
              <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-relaxed">
                {s.isi}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Panel title="Data yang kami kumpulkan">
            <ul className="divide-y">
              {DATA.map((d) => (
                <li
                  key={d.label}
                  className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:gap-4"
                >
                  <div className="sm:w-[150px] sm:shrink-0">
                    <Pill tone={d.tone}>{d.label}</Pill>
                  </div>
                  <p className="text-muted-foreground text-[13.5px] leading-relaxed">
                    {d.isi}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground border-t px-5 py-3.5 text-[13.5px] leading-relaxed">
              Aplikasi juga memeriksa indikasi pemalsuan lokasi (GPS palsu,
              lompatan jarak yang mustahil) dan menandai titik yang mencurigakan
              agar dapat ditinjau HR.
            </p>
          </Panel>

          <Bagian judul="Untuk apa data ini dipakai">
            <p>
              Seluruh data di atas dipakai semata-mata untuk pencatatan
              kehadiran, pengelolaan pengajuan cuti/izin/lembur, pengumuman
              internal, dan administrasi kepegawaian.
            </p>
            <p>
              <Tegas>
                Kami tidak menjual data Anda, tidak memakainya untuk iklan, dan
                tidak membagikannya kepada pihak ketiga untuk tujuan pemasaran.
              </Tegas>{" "}
              Tidak ada SDK pelacakan atau analitik pihak ketiga di dalam
              aplikasi ini.
            </p>
          </Bagian>

          <Bagian judul="Siapa yang bisa melihat data Anda">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Anda sendiri, melalui aplikasi.</li>
              <li>
                Atasan langsung Anda, terbatas pada kehadiran dan pengajuan tim.
              </li>
              <li>Tim HR dan administrator sistem perusahaan.</li>
            </ul>
            <p>
              Data disimpan pada penyedia layanan berikut, yang memproses data
              atas nama kami dan terikat perjanjian pemrosesan data:{" "}
              <Tegas>Neon</Tegas> (basis data, wilayah Singapura),{" "}
              <Tegas>Cloudflare R2</Tegas> (penyimpanan foto dan berkas),{" "}
              <Tegas>Vercel</Tegas> (hosting aplikasi), serta{" "}
              <Tegas>Expo dan Firebase Cloud Messaging</Tegas> (pengiriman
              notifikasi push). Karena penyedia ini berada di luar Indonesia,
              data Anda ditransfer dan disimpan di luar negeri.
            </p>
            <p>
              Di luar itu, data hanya dibuka bila diwajibkan oleh hukum atau
              permintaan resmi aparat yang sah.
            </p>
          </Bagian>

          <Bagian judul="Berapa lama disimpan">
            <p>
              Data kehadiran, pengajuan, dan berkas disimpan selama Anda menjadi
              karyawan. Data kehadiran mentah dirangkum menjadi arsip laporan
              bulanan, dan data mentahnya dihapus secara berkala setelah arsip
              pengganti terbukti ada. Setelah Anda berhenti bekerja, data
              kepegawaian disimpan selama masih dibutuhkan untuk memenuhi
              kewajiban hukum ketenagakerjaan dan perpajakan, lalu dihapus.
            </p>
          </Bagian>

          <Bagian judul="Keamanan">
            <p>
              Sandi disimpan dalam bentuk hash, tidak pernah sebagai teks biasa.
              Seluruh komunikasi antara aplikasi dan server memakai HTTPS. Akses
              ke data dibatasi menurut peran: karyawan, atasan, HR, atau
              administrator.
            </p>
          </Bagian>

          <Bagian judul="Hak Anda">
            <p>
              Anda berhak melihat data yang kami simpan tentang Anda, meminta
              koreksi data yang keliru, dan meminta penghapusan data yang tidak
              lagi diwajibkan disimpan oleh hukum. Anda juga dapat mencabut izin
              lokasi, kamera, atau notifikasi kapan saja melalui pengaturan
              perangkat — dengan konsekuensi fitur absen tidak dapat dipakai
              tanpa izin lokasi dan kamera.
            </p>
            <p>
              Permintaan tersebut dikirim ke <Surel /> dan kami jawab
              selambat-lambatnya 30 hari kerja.
            </p>
          </Bagian>

          <Bagian judul="Anak-anak">
            <p>
              NanumHR tidak ditujukan untuk anak di bawah 18 tahun dan tidak
              mengumpulkan data anak secara sengaja.
            </p>
          </Bagian>

          <Bagian judul="Perubahan kebijakan ini">
            <p>
              Bila kebijakan ini berubah, tanggal berlaku di atas diperbarui dan
              perubahan penting diumumkan melalui pengumuman di dalam aplikasi.
            </p>
          </Bagian>
        </div>
      </main>

      <footer className="mt-4 border-t">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <Surel />
          <span className="text-subtle font-mono text-[11px]">
            © {new Date().getFullYear()} {PERUSAHAAN}
          </span>
        </div>
      </footer>
    </div>
  );
}
