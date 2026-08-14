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
 */
export type Role = "hr_admin" | "manager" | "employee";

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
 * Segment-exact, bukan `startsWith("/buka")` polos — yang terakhir juga akan cocok
 * dengan `/bukalapak` dan menyerahkan rute mana pun yang kebetulan berawalan sama.
 */
export function canAccess(pathname: string, role: Role): boolean {
  if (role === "hr_admin") return true;
  return pathname === "/ganti-sandi" || pathname.startsWith("/buka/");
}

/**
 * Where a role lands when nothing more specific was asked for: after login, from
 * `/`, and after a denied URL.
 *
 * Whatever this returns must itself satisfy `canAccess` for that role, or the
 * proxy redirects to a page it will deny and the browser loops. access.check.ts
 * asserts exactly that.
 */
export function homeFor(role: Role): string {
  return role === "hr_admin" ? "/kehadiran" : "/buka/absen";
}
