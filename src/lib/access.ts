/**
 * The one place that answers "may this role open this URL?".
 *
 * Imported by the Edge proxy, so it must stay dependency-free — no drizzle, no
 * node builtins, no `@/db`. Keep it that way.
 *
 * The policy is a **prefix, not a list**. A list has to be edited every time a
 * page is added, and it defaults to whatever the author remembered; a prefix
 * defaults to *deny* and never needs editing.
 *
 * Sejak area /saya dihapus, konsol web ini milik HR sepenuhnya: kehadiran, cuti,
 * lembur, dan berkas karyawan dikerjakan di aplikasi ponsel, dan setengah salinan
 * di web hanya menawarkan jalan yang tidak bisa diselesaikan — absen di browser
 * yang tidak pernah dipakai siapa pun tetap menuntut selfie dan izin lokasi.
 *
 * `manager` is deliberately identical to `employee`. Approvals happen in the
 * admin console and no code has ever checked for that role (PRD §4 keeps it
 * schema-ready but unbuilt), so there is nothing extra to grant yet.
 *
 * `pimpinan` sebaliknya: hak AKSESnya sama persis dengan `hr_admin` — bedanya bukan
 * halaman mana yang boleh dibuka, melainkan wewenang memutus di tingkat kedua
 * persetujuan cuti. Itu urusan api/requests, bukan urusan berkas ini.
 */
export type Role = "hr_admin" | "manager" | "employee" | "pimpinan";

/**
 * Peran yang boleh membuka konsol web sepenuhnya.
 *
 * Sebuah himpunan, bukan `role === "hr_admin"` yang tersebar: perbandingan
 * langsung itulah yang membuat peran baru diam-diam ditolak dari mana-mana tanpa
 * satu pun galat kompilasi.
 */
export const PERAN_KONSOL = ["hr_admin", "pimpinan"] as const;

export const bolehKonsol = (role: Role): boolean =>
  (PERAN_KONSOL as readonly string[]).includes(role);

/**
 * Yang tersisa untuk peran selain HR, dan alasan keduanya:
 *
 * `/ganti-sandi` harus bisa dibuka siapa pun — ke sanalah akun yang masih memakai
 * sandi impor bersama dikirim, dan menutupnya justru mengurung orang yang belum
 * bisa memakai apa pun.
 *
 * `/buka/...` adalah halaman pendaratan setiap tautan email. Ia tidak memuat data
 * siapa-siapa dan memang publik (dikecualikan dari matcher proxy); disebut di sini
 * supaya `homeFor` di bawah punya tujuan yang sah menurut aturan ini sendiri.
 *
 * `/verifikasi/...` adalah sasaran QR pada surat izin. Pengunjung anonim sudah
 * lolos lewat matcher proxy, tapi yang paling mungkin memindai surat itu justru
 * karyawan yang SEDANG login di ponselnya — dan tanpa baris ini ia satu-satunya
 * orang di dunia yang dialihkan ke /buka/absen alih-alih melihat jawabannya.
 *
 * Segment-exact, bukan `startsWith("/buka")` polos — yang terakhir juga akan cocok
 * dengan `/bukalapak` dan menyerahkan rute mana pun yang kebetulan berawalan sama.
 */
export function canAccess(pathname: string, role: Role): boolean {
  if (bolehKonsol(role)) return true;
  return (
    pathname === "/ganti-sandi" ||
    pathname.startsWith("/buka/") ||
    pathname.startsWith("/verifikasi/")
  );
}

/**
 * Where a role lands when nothing more specific was asked for: after login, from
 * `/`, and after a denied URL.
 *
 * Whatever this returns must itself satisfy `canAccess` for that role, or the
 * proxy redirects to a page it will deny and the browser loops. access.check.ts
 * asserts exactly that.
 *
 * Sebuah `Record<Role, string>` yang lengkap, bukan ternary — dan ini disengaja:
 * sebelum ini tidak ada SATU PUN `Record<Role, …>` di repo, sehingga menambah
 * nilai peran lolos kompilasi lalu salah diam-diam di enam tempat. Sekarang peran
 * berikutnya tidak bisa ditambahkan tanpa memutuskan ke mana ia mendarat.
 */
const RUMAH: Record<Role, string> = {
  hr_admin: "/kehadiran",
  pimpinan: "/kehadiran",
  manager: "/buka/absen",
  employee: "/buka/absen",
};

export function homeFor(role: Role): string {
  return RUMAH[role];
}

/**
 * Nama peran untuk dibaca manusia. `Record<Role, string>` lengkap, alasan yang
 * sama seperti RUMAH di atas: sebelumnya labelnya ditulis sebagai rantai ternary
 * tiga cabang di halaman profil, sehingga peran keempat akan tampil "Karyawan".
 */
export const LABEL_PERAN: Record<Role, string> = {
  hr_admin: "HR Admin",
  pimpinan: "Pimpinan",
  manager: "Atasan",
  employee: "Karyawan",
};
