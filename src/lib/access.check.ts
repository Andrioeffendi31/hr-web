/** Pins the page access policy. Run: npm run check */
import assert from "node:assert/strict";
import { canAccess, homeFor, type Role } from "./access";

const ROLES: Role[] = ["hr_admin", "manager", "employee"];

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

/** Everything an employee is allowed to open. */
const SAYA = [
  "/saya",
  "/saya/kehadiran",
  "/saya/kehadiran/2026-08-09",
  "/saya/pengajuan",
  "/saya/berkas",
  "/saya/pengumuman",
  "/profil",
];

for (const p of ADMIN) {
  assert.ok(canAccess(p, "hr_admin"), `${p} must allow hr_admin`);
  assert.equal(canAccess(p, "employee"), false, `${p} must deny employee`);
  // manager is an employee until somebody builds approvals for it
  assert.equal(canAccess(p, "manager"), false, `${p} must deny manager`);
}

for (const p of SAYA) {
  for (const role of ROLES) assert.ok(canAccess(p, role), `${p} must allow ${role}`);
}

// a page nobody thought about is admin-only, not public
assert.equal(canAccess("/halaman-baru", "employee"), false, "unknown path denies");
// the prefix is segment-exact: a route merely starting with those letters is not /saya
assert.equal(canAccess("/sayanganku", "employee"), false, "prefix must be segment-exact");
// and there is no escape by appending the magic word to an admin path
assert.equal(canAccess("/kehadiran/saya", "employee"), false, "no /saya suffix escape");

// homeFor must land somewhere its own role may go, or proxy.ts redirect-loops
for (const role of ROLES) {
  assert.ok(canAccess(homeFor(role), role), `${role} cannot reach its own home`);
}

console.log("access.check.ts ok");
