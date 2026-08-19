import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { PERUSAHAAN } from "@/lib/hr";

export const roleEnum = pgEnum("role", [
  "hr_admin",
  /**
   * Penyetuju akhir. Hak aksesnya sama dengan `hr_admin`; yang membedakannya
   * adalah tingkat kedua persetujuan cuti, yang wajib dan hanya bisa ditutup
   * olehnya (lihat api/requests/route.ts).
   */
  "pimpinan",
  "manager",
  "employee",
]);
export const contractEnum = pgEnum("contract_type", ["Tetap", "Kontrak"]);
/** Closed at two, so the column can reject the source data's spelling variants
 *  ("Laki - Laki") instead of storing them. Values are display-ready on purpose —
 *  a label map for two words is a lookup nobody needs. */
export const genderEnum = pgEnum("gender", ["Laki-laki", "Perempuan"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "hadir",
  "telat",
  "wfh",
  "cuti",
  "izin",
  "sakit",
  "belum_absen",
]);
export const requestStatusEnum = pgEnum("request_status", [
  "menunggu",
  /**
   * Sent back by HR for the employee to fix and resubmit. Its own state, not
   * `menunggu` with a note: the two look identical in every list otherwise, and
   * neither side can tell whose turn it is — HR waits for an employee who does
   * not know they were asked for anything.
   */
  "revisi",
  /**
   * Sudah disetujui satu admin, menunggu Pimpinan — tingkat kedua yang wajib untuk
   * cuti. Hanya cuti yang pernah melewati keadaan ini; lembur satu tingkat.
   */
  "menunggu_pimpinan",
  "disetujui",
  "ditolak",
  "dibatalkan",
]);
export const leaveTypeEnum = pgEnum("leave_type", [
  "Cuti Tahunan",
  "Cuti Sakit",
  "Izin Khusus",
  /**
   * Izin beberapa jam pada satu hari — karyawannya tetap masuk dan bekerja
   * separuh harinya. Satu-satunya jenis yang memakai `start_time`/`end_time`,
   * dan satu-satunya yang menggeser batas keterlambatan di /api/me/clock.
   */
  "Izin Setengah Hari",
]);
export const overtimeKindEnum = pgEnum("overtime_kind", [
  "Hari kerja",
  "Hari libur",
]);
export const annCategoryEnum = pgEnum("ann_category", [
  "Kebijakan",
  "Libur",
  "Administrasi",
  "Pelatihan",
]);
export const eventKindEnum = pgEnum("attendance_event_kind", [
  "masuk",
  "keluar",
  "catatan",
  /** automatic periodic ping while clocked in, written by the mobile app, not a human */
  "lokasi",
]);

export const folderEnum = pgEnum("doc_folder", [
  "personal",
  "kontrak",
  "sertif",
  "legal",
]);

/**
 * Divisions, and the shift each one works.
 *
 * The name is the primary key rather than a serial id, because `division` was a
 * free-text column long before this table existed and is read as text in a dozen
 * places — filters, reports, exports, delegate lookup, search. Keying on the name
 * lets every one of those keep working verbatim and turns the column into a real
 * foreign key at the same time; ON UPDATE CASCADE makes a rename propagate rather
 * than orphan.
 *
 * Every shift column is nullable, and NULL means "inherit the company default in
 * `settings`" (see resolveShift in lib/hr.ts). So a company with one schedule adds
 * divisions and changes nothing else.
 */
export const divisions = pgTable("divisions", {
  name: text("name").primaryKey(),
  shiftStart: time("shift_start"),
  shiftEnd: time("shift_end"),
  lateToleranceMinutes: integer("late_tolerance_minutes"),
  /**
   * Hari kerja divisi ini sebagai nomor hari Postgres (0 = Minggu … 6 = Sabtu).
   * NULL mewarisi default perusahaan (Senin–Jumat, `HARI_KERJA_DEFAULT`), persis
   * seperti kolom shift di atasnya. Ini yang membuat divisi yang liburnya bukan
   * Sabtu–Minggu berhenti tercatat "tanpa keterangan" pada hari liburnya sendiri.
   */
  workDays: integer("work_days").array(),
});

/**
 * The places an employee may clock in from (PRD §6.8 "Lokasi absensi", widened
 * from the single point that used to live on `settings`).
 *
 * Each carries its own radius: a head office on a city block and a warehouse yard
 * do not deserve the same geofence. Deactivated rather than deleted, because
 * attendance rows point here and history must keep resolving.
 */
export const officeLocations = pgTable("office_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
  lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
  radiusM: integer("radius_m").notNull().default(150),
  active: boolean("active").notNull().default(true),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("employee"),
  /**
   * Employment data, all nullable since the import.
   *
   * The employee master data arrives from HR without any of these four, and
   * inventing a division or a start date would put a wrong value in the columns
   * the shift and the leave quota are computed from. Empty is the honest state;
   * HR fills each one in through /karyawan. NULL satisfies the FK, so a division
   * row keeps its shift override either way.
   */
  division: text("division").references(() => divisions.name, {
    onUpdate: "cascade",
  }),
  position: text("position"),
  contractType: contractEnum("contract_type"),
  joinedAt: date("joined_at"),
  workLocation: text("work_location").notNull().default("Kantor Pusat"),
  /** direct supervisor — approver in a later phase, reference only in v1 (PRD §4) */
  managerId: integer("manager_id"),
  active: boolean("active").notNull().default(true),
  /** R2 object key of the profile photo (see src/lib/r2.ts), null = no photo */
  photoUrl: text("photo_url"),

  /**
   * Personal data (PRD §6.4 "data pribadi"). Nullable throughout: the source
   * sheet itself has gaps, and a blank cell must not become a fabricated value.
   */
  birthPlace: text("birth_place"),
  birthDate: date("birth_date"),
  address: text("address"),
  gender: genderEnum("gender"),
  /**
   * Free text, not an enum. The official list has changed before (Konghucu
   * re-recognised in 2006) and the source data already disagrees with it —
   * "Protestan" where the official spelling is "Kristen". A closed type here buys
   * nothing the form's own option list doesn't, and costs an ALTER TYPE the first
   * time a KTP says something else.
   */
  religion: text("religion"),
  phone: text("phone"),
  /** next of kin — the person to call, not a user of the app */
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  /** set by the import: the shared temporary password must not stay usable */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /**
   * Session epoch. Every JWT carries an `iat`; a token issued before this stamp
   * is refused by the checks in lib/me.ts, (app)/layout.tsx and requireAdmin().
   * NULL means "never rotated", which no token can be older than.
   */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
});

export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    clockIn: time("clock_in"),
    clockOut: time("clock_out"),
    status: attendanceStatusEnum("status").notNull(),
    location: text("location"),
    note: text("note"),
    selfieUrl: text("selfie_url"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    /**
     * The office picked at clock-in. Clock-out is measured against this one too,
     * rather than whatever happens to be nearest at the time — somebody who drives
     * to another branch after lunch still ends their day where they started it.
     *
     * NULL means the day has no office point: a WFH punch, a row HR entered by
     * hand, or anything from before locations existed. Every reader treats that as
     * "no distance to show" rather than falling back to a default office, since
     * guessing would silently relabel history the moment HR adds a nearby site.
     */
    locationId: integer("location_id").references(() => officeLocations.id, {
      // restrict, not set null: erasing which office a punch was measured against
      // is destroying the evidence behind a hadir/telat decision. A location with
      // history can be deactivated; only one nobody ever used can be deleted.
      onDelete: "restrict",
    }),
    /**
     * Alasan yang WAJIB diisi karyawan saat absen di luar jamnya: terlambat
     * (`late_reason`) atau keluar sebelum shiftnya selesai (`early_reason`).
     * Kewajibannya ditegakkan di /api/me/clock, yang satu-satunya tahu shift
     * divisi dan toleransinya.
     *
     * Bukan `note` di atas: kolom itu dipakai sebagai keterangan umum hari itu
     * (api/me/team menampilkannya sebagai baris detail karyawan di papan
     * atasannya), dan alasan pribadi tidak seharusnya muncul di situ.
     */
    lateReason: text("late_reason"),
    earlyReason: text("early_reason"),
    /**
     * Tinjauan admin atas alasan di atas — satu keputusan untuk harinya, bukan
     * satu per alasan.
     *
     * NULL = belum ditinjau · true = diterima · false = ditolak.
     *
     * `review_ok = true` MEMUTIHKAN keterlambatan: `status` tetap 'telat' di
     * baris ini, tapi statusHarianSql() membacanya sebagai 'hadir'. Tidak ada
     * satu pun jalur yang menimpa `status` — buktinya disimpan, keputusannya
     * ditambahkan di sebelahnya, dan karena itu keputusan yang salah bisa
     * dibalik tanpa ada yang hilang.
     */
    reviewOk: boolean("review_ok"),
    reviewedById: integer("reviewed_by_id").references(() => employees.id, {
      // set null: karyawan yang keluar tidak membawa serta keputusan yang
      // pernah ia buat atas hari orang lain
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Catatan admin. Wajib saat menolak, opsional saat memutihkan. */
    reviewNote: text("review_note"),
  },
  (t) => [uniqueIndex("attendance_emp_date").on(t.employeeId, t.date)],
);

/**
 * What actually happened during the day. The attendance row above stays the
 * summary every list, recap and CSV export reads; this is the log behind it,
 * because attendance_emp_date caps that row at one per employee per day and a
 * day has more than one moment worth recording.
 *
 * `photoUrl` is the evidence for one moment (the clock-in flow in PRD-Mobile
 * will fill it); `attendance.selfieUrl` remains the photo for the day as a whole.
 */
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: serial("id").primaryKey(),
    attendanceId: integer("attendance_id")
      .notNull()
      .references(() => attendance.id, { onDelete: "cascade" }),
    kind: eventKindEnum("kind").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    location: text("location"),
    /** numeric comes back from the driver as a string — parse once, in the query */
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    /** R2 object key, optional */
    photoUrl: text("photo_url"),
    note: text("note"),
    /**
     * Kenapa titik ini patut dicurigai, atau NULL kalau bersih.
     *
     * Teks, bukan boolean: yang bisa ditindaklanjuti HR adalah alasannya
     * ("GPS palsu terdeteksi di perangkat", "Perpindahan 812 km dalam 4 menit"),
     * dan bendera tanpa alasan hanya memindahkan pertanyaan.
     */
    suspect: text("suspect"),
  },
  (t) => [index("att_events_attendance").on(t.attendanceId, t.at)],
);

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  type: leaveTypeEnum("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  /**
   * Jam izin, HANYA untuk `Izin Setengah Hari` (dan karena itu nullable): pada
   * jenis itu `start_date` = `end_date` dan yang membatasi izinnya adalah dua
   * jam ini, bukan rentang tanggalnya.
   *
   * Keduanya juga yang menggeser batas keterlambatan hari itu — lihat
   * `geserShift()` di lib/hr.ts, yang dipakai /api/me/clock dan /api/me.
   */
  startTime: time("start_time"),
  endTime: time("end_time"),
  /** working days, computed server-side (PRD §6.2) */
  days: integer("days").notNull(),
  reason: text("reason").notNull(),
  delegateId: integer("delegate_id"),
  /**
   * One supporting file — a doctor's note, a wedding invitation, a visa letter.
   * Three columns rather than a join table: a leave request has one attachment in
   * every process this company runs, and the name and size have to survive here
   * because nothing else records them (add a `leave_attachments` table the day a
   * request needs several).
   */
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name"),
  attachmentSize: integer("attachment_size"),
  status: requestStatusEnum("status").notNull().default("menunggu"),
  decisionNote: text("decision_note"),
  /** Keputusan AKHIR — untuk cuti berarti Pimpinan. */
  decidedById: integer("decided_by_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  /**
   * Jejak tingkat PERTAMA: admin yang memeriksa lebih dulu.
   *
   * Dua kolom sendiri, bukan menumpang `decided_by_id`: satu trio tidak bisa
   * menyimpan dua tanda tangan, dan persetujuan Pimpinan akan menimpa nama admin
   * yang memeriksa. Kalau Pimpinan memutus sendirian, kedua pasang kolom memuat id
   * yang sama — catatan jujur bahwa satu orang menutup dua tingkat.
   */
  checkedById: integer("checked_by_id"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const overtimeRequests = pgTable("overtime_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  minutes: integer("minutes").notNull(),
  kind: overtimeKindEnum("kind").notNull(),
  reason: text("reason").notNull(),
  status: requestStatusEnum("status").notNull().default("menunggu"),
  decisionNote: text("decision_note"),
  decidedById: integer("decided_by_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: annCategoryEnum("category").notNull(),
  audience: text("audience").notNull().default("Semua karyawan"),
  pinned: boolean("pinned").notNull().default(false),
  authorId: integer("author_id").references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const announcementReads = pgTable(
  "announcement_reads",
  {
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ann_read_pk").on(t.announcementId, t.employeeId)],
);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ext: text("ext").notNull(),
  folder: folderEnum("folder").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** null = company-wide doc, visible to everyone */
  ownerId: integer("owner_id").references(() => employees.id, {
    onDelete: "cascade",
  }),
  url: text("url").notNull().default(""),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Holidays feed the working-day calculation for leave (PRD §11 open question:
    resolved as HR-managed rows rather than an external API). */
export const holidays = pgTable("holidays", {
  date: date("date").primaryKey(),
  name: text("name").notNull(),
  /** cuti bersama draws down the annual leave balance; a plain national
   *  holiday only removes the day from the working-day count. */
  collective: boolean("collective").notNull().default(false),
});

/** Carry-over / manual correction to the annual leave balance, one row per
 *  employee per year. Days may be negative. Who changed it is in auditLog. */
export const leaveAdjustments = pgTable(
  "leave_adjustments",
  {
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    days: integer("days").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("leave_adj_emp_year").on(t.employeeId, t.year)],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => employees.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  detail: text("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Expo push tokens (PRD-Mobile §6.6). One row per device, not per employee: a
 * person may carry a phone and a tablet, and both should get told when their
 * leave is approved.
 *
 * The token is the primary key. Expo reissues the same token to the same install,
 * so an upsert on it keeps re-registration idempotent — and if a device is handed
 * to another employee, the upsert moves the row instead of leaving the old owner
 * subscribed to somebody else's notifications.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    token: text("token").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("push_tokens_employee").on(t.employeeId)],
);

/** Registered passkeys (PRD §7). Binary values are stored base64url so the rows
 *  stay portable and the credential id can be indexed and looked up directly. */
export const authenticators = pgTable("authenticators", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  /** signature counter; must never move backwards (replay detection) */
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type").notNull().default("singleDevice"),
  backedUp: boolean("backed_up").notNull().default(false),
  transports: text("transports"),
  /** user-facing label, e.g. "MacBook Pro (Touch ID)" */
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

/** Short-lived WebAuthn challenges. Kept server-side and single-use so a captured
 *  assertion cannot be replayed. */
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  challenge: text("challenge").notNull(),
  /** set for registration (who is enrolling); null for discoverable-credential login */
  employeeId: integer("employee_id").references(() => employees.id, {
    onDelete: "cascade",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Single-use tokens for the "lupa kata sandi" link.
 *
 * Shape and lifecycle copied from webauthnChallenges above, including the
 * DELETE ... RETURNING consumption in lib/reset.ts. `id` holds sha256(token), not
 * the token: the link is the secret, and a database read must not be redeemable.
 */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("password_resets_employee_idx").on(t.employeeId)],
);

/** single-row config table; avoids hardcoding quotas/shifts in app code.
 *  No pay rates here — this app records presence, not payroll (PRD §3). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default(PERUSAHAAN),
  /** R2 object key for the company mark shown in the admin shell. */
  companyLogoUrl: text("company_logo_url"),
  weeklyOvertimeCapHours: integer("weekly_ot_cap_hours").notNull().default(14),
  baseLeaveQuota: integer("base_leave_quota").notNull().default(12),
  shiftStart: time("shift_start").notNull().default("08:00:00"),
  shiftEnd: time("shift_end").notNull().default("17:00:00"),
  lateToleranceMinutes: integer("late_tolerance_minutes").notNull().default(15),
  /**
   * Sejak kapan aplikasi ini benar-benar mencatat kehadiran.
   *
   * Hari kerja SEBELUM tanggal ini tidak dinilai sama sekali: tidak dituduh tanpa
   * keterangan, tidak masuk penyebut rekap. Tanpa batas ini, sistem yang baru
   * dipasang — atau yang datanya baru dikosongkan — akan melaporkan seluruh
   * karyawan sebagai tanpa keterangan untuk setiap hari kerja di masa lalu, dan
   * rekap bulan-bulan sebelumnya membaca 0% kehadiran. Keduanya bukan fakta
   * tentang orangnya, melainkan tentang aplikasinya yang belum ada di sana.
   *
   * NULL berarti tanpa batas — nilai yang benar untuk pemasangan yang memang
   * mencatat sejak hari pertama.
   */
  trackingSince: date("tracking_since"),
  /**
   * The office the phone offers first.
   *
   * The single office point that used to live here became the `office_locations`
   * table (0002_divisi_lokasi.sql, columns dropped by 0003) — one company can have
   * a head office and a warehouse yard that do not share a radius. What is left is
   * the choice of which one is primary: the app picks the nearest once GPS answers,
   * but that takes a second or two, and this is what it shows in the meantime.
   *
   * Nullable, and SET NULL on delete: a company that has not chosen falls back to
   * the first location by name, and deleting the chosen one must not take the
   * settings row down with it.
   */
  defaultLocationId: integer("default_location_id").references(
    () => officeLocations.id,
    { onDelete: "set null" },
  ),
});
