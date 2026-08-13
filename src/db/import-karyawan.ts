/**
 * Imports the real employee master data (Data-Karyawan.xlsx → karyawan-data.ts).
 *
 * DESTRUCTIVE. Every employee-derived table is emptied first: attendance, cuti,
 * lembur, berkas, pengumuman, audit log, push tokens and passkeys. Run once, on
 * purpose:  npm run db:import
 *
 * Every table with a foreign key into `employees` has to be on the list below:
 * TRUNCATE without CASCADE refuses while a referencing table is left out, and
 * CASCADE is not an option here (see the note at the statement). So a new child
 * table means a new line — `password_resets` was exactly that.
 *
 * What survives, and why:
 *   · office_locations — geofences somebody surveyed and typed in by hand
 *   · settings         — the company shift, tolerance and default office
 *   · divisions        — each row carries a shift override; employees simply
 *                        point at none of them until HR assigns one
 *   · holidays         — the national calendar, not employee data
 *
 * This is deliberately not part of seed.ts. That file is the demo fixture the
 * whole of scripts/smoke.sh is pinned to (names, NIKs, a specific overtime id);
 * folding real data into it would cost the fixture and gain a script that
 * truncates office_locations on the way past.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "./index";
import { employees, settings } from "./schema";
import { KARYAWAN } from "./karyawan-data";
import { PERUSAHAAN } from "../lib/hr";

/**
 * Shared starting password. Every imported account is flagged
 * `mustChangePassword`, so it stops working as soon as each person signs in
 * once — a shared secret is only acceptable while it is single-use.
 */
const PASSWORD = process.env.IMPORT_PASSWORD ?? "nanum2026";

async function main() {
  // Children before parents, though TRUNCATE takes them in one statement anyway.
  // No CASCADE on purpose: it would follow inbound foreign keys and could reach a
  // table that is not on this list — office_locations is one FK hop from
  // attendance, and losing it is the one outcome this script must not have.
  await db.execute(sql`
    TRUNCATE TABLE
      audit_log, announcement_reads, announcements, documents,
      attendance_events, attendance,
      leave_adjustments, leave_requests, overtime_requests,
      push_tokens, authenticators, webauthn_challenges, password_resets,
      employees
    RESTART IDENTITY`);

  /**
   * A brand-new database has no configuration row, and without it every page dies
   * in config() (lib/me.ts) with "Konfigurasi belum diisi" — so this script could
   * populate 26 employees into an app nobody could open.
   *
   * onConflictDoNothing rather than an upsert: `id` is the only key, and the intent
   * is "create it if absent, never touch it if present". An existing row holds the
   * shift hours, tolerance and default office that HR set by hand, and an import of
   * employee data has no business overwriting those.
   */
  await db
    .insert(settings)
    .values({ id: 1, companyName: PERUSAHAAN })
    .onConflictDoNothing();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const rows = await db
    .insert(employees)
    .values(
      KARYAWAN.map((k, i) => ({
        // the sheet has no employee number; NIS = Nanum Indah Sejati
        nik: `NIS-${String(i + 1).padStart(4, "0")}`,
        name: k.name,
        email: k.email.toLowerCase(),
        passwordHash,
        mustChangePassword: true,
        role: k.role,
        birthPlace: k.birthPlace,
        birthDate: k.birthDate,
        address: k.address,
        gender: k.gender,
        religion: k.religion,
        phone: k.phone,
        emergencyName: k.emergencyName,
        emergencyPhone: k.emergencyPhone,
        // division / position / contractType / joinedAt stay NULL — not in the
        // sheet, and a guess here would drive the wrong shift and leave quota
      })),
    )
    .returning({ id: employees.id, role: employees.role });

  // A transcription that dropped or doubled a row is otherwise silent: the insert
  // succeeds and somebody notices in a month.
  // 26 baris dari Data-Karyawan.xlsx + 1 akun administrator yang ditambahkan
  // manual = 27. Angkanya ditulis eksplisit, bukan KARYAWAN.length: gunanya justru
  // sebagai tripwire kalau transkripsi sheet menggeser atau menghilangkan baris,
  // dan membandingkan data dengan dirinya sendiri tidak membuktikan apa pun.
  assert.equal(rows.length, 27, "expected 26 from the sheet + 1 admin");
  assert.equal(
    rows.filter((r) => r.role === "hr_admin").length,
    3,
    "expected 3 HR admins",
  );
  assert.equal(
    new Set(KARYAWAN.map((k) => k.email.toLowerCase())).size,
    KARYAWAN.length,
    "duplicate email in the source data",
  );

  console.log(`✓ ${rows.length} karyawan diimpor · sandi awal: ${PASSWORD}`);
  console.log("  Semua akun wajib ganti sandi saat login pertama.");
  console.log("  Divisi, jabatan, tipe kontrak dan tanggal mulai kerja masih");
  console.log("  kosong — isi lewat /karyawan.");
}

main().then(() => process.exit(0));
