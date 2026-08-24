/** Pins the page access policy. Run: npm run check */
import assert from "node:assert/strict";
import { canAccess, homeFor, loginNext, type Role } from "./access";

const ROLES: Role[] = ["hr_admin", "pimpinan", "manager", "employee"];

/** Every admin page, i.e. every directory under app/(app)/(admin)/. */
const ADMIN = [
  "/kehadiran",
  "/cuti",
  "/lembur",
  "/karyawan",
  "/divisi",
  "/lokasi",
  "/libur",
  "/pengumuman",
  "/berkas",
  "/laporan",
  "/pengaturan",
];

/** Everything a non-admin is allowed to open — sekarang tinggal dua. */
const UMUM = [
  // reachable by every role on purpose: it is where an account still carrying the
  // shared import password is sent, so denying it would strand that account
  "/ganti-sandi",
  // pendaratan tautan email; publik, dan tujuan homeFor bagi karyawan
  "/buka/absen",
  "/buka/pengajuan",
  // sasaran QR pada surat izin: dipindai orang luar, tapi juga oleh karyawan
  // yang sedang login — yang tanpa ini justru satu-satunya yang ditolak
  "/verifikasi/7-dHym0rFvkkBjoNg3ayrvjA",
];

/** Halaman karyawan yang DIHAPUS. Didaftar di sini bukan sebagai peninggalan,
 *  melainkan sebagai jebakan: menghidupkannya kembali tanpa memikirkan ulang
 *  kebijakannya akan membuat assert ini gagal, bukan diam-diam terbuka. */
const DIHAPUS = [
  "/saya",
  "/saya/kehadiran",
  "/saya/kehadiran/2026-08-09",
  "/saya/pengajuan",
  "/saya/berkas",
  "/saya/pengumuman",
  // konsol web milik HR sepenuhnya; passkey karyawan didaftarkan di aplikasi
  "/profil",
];

for (const p of ADMIN) {
  assert.ok(canAccess(p, "hr_admin"), `${p} must allow hr_admin`);
  // Pimpinan melihat konsol yang sama persis: yang membedakannya wewenang memutus
  // di tingkat kedua persetujuan cuti, bukan halaman mana yang boleh dibuka
  assert.ok(canAccess(p, "pimpinan"), `${p} must allow pimpinan`);
  assert.equal(canAccess(p, "employee"), false, `${p} must deny employee`);
  // manager is an employee until somebody builds approvals for it
  assert.equal(canAccess(p, "manager"), false, `${p} must deny manager`);
}

for (const p of UMUM) {
  for (const role of ROLES)
    assert.ok(canAccess(p, role), `${p} must allow ${role}`);
}

for (const p of DIHAPUS) {
  assert.equal(canAccess(p, "employee"), false, `${p} sudah dihapus`);
  assert.equal(canAccess(p, "manager"), false, `${p} sudah dihapus`);
}

// a page nobody thought about is admin-only, not public
assert.equal(
  canAccess("/halaman-baru", "employee"),
  false,
  "unknown path denies",
);
// prefix /buka/ harus segment-exact: rute yang kebetulan berawalan sama bukan milik
// siapa pun, dan `startsWith("/buka")` polos akan menyerahkannya
assert.equal(
  canAccess("/bukalapak", "employee"),
  false,
  "prefix must be segment-exact",
);
// dan tidak ada jalan keluar dengan menempelkan kata ajaibnya ke halaman admin
assert.equal(
  canAccess("/kehadiran/buka/absen", "employee"),
  false,
  "no /buka suffix escape",
);

// homeFor must land somewhere its own role may go, or proxy.ts redirect-loops
for (const role of ROLES) {
  assert.ok(
    canAccess(homeFor(role), role),
    `${role} cannot reach its own home`,
  );
}

// A stale protected-page redirect must not turn a password settings page into
// the user's permanent post-login landing page.
assert.equal(loginNext("/ganti-sandi"), null);
assert.equal(loginNext("/ganti-sandi?dari=profil"), null);
assert.equal(loginNext("/ganti-sandi/"), null);
assert.equal(loginNext("/login"), null);
assert.equal(loginNext("https://jahat.example"), null);
assert.equal(loginNext("//jahat.example"), null);
assert.equal(loginNext("/cuti?status=menunggu"), "/cuti?status=menunggu");

console.log("access.check.ts ok");
