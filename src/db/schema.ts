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

export const roleEnum = pgEnum("role", ["hr_admin", "manager", "employee"]);
export const contractEnum = pgEnum("contract_type", ["Tetap", "Kontrak"]);
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
  "disetujui",
  "ditolak",
  "dibatalkan",
]);
export const leaveTypeEnum = pgEnum("leave_type", [
  "Cuti Tahunan",
  "Cuti Sakit",
  "Izin Khusus",
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
]);

export const folderEnum = pgEnum("doc_folder", [
  "personal",
  "kontrak",
  "sertif",
  "legal",
]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("employee"),
  division: text("division").notNull(),
  position: text("position").notNull(),
  contractType: contractEnum("contract_type").notNull(),
  joinedAt: date("joined_at").notNull(),
  workLocation: text("work_location").notNull().default("Kantor Pusat"),
  /** direct supervisor — approver in a later phase, reference only in v1 (PRD §4) */
  managerId: integer("manager_id"),
  active: boolean("active").notNull().default(true),
  /** R2 object key of the profile photo (see src/lib/r2.ts), null = no photo */
  photoUrl: text("photo_url"),
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
  /** working days, computed server-side (PRD §6.2) */
  days: integer("days").notNull(),
  reason: text("reason").notNull(),
  delegateId: integer("delegate_id"),
  status: requestStatusEnum("status").notNull().default("menunggu"),
  decisionNote: text("decision_note"),
  decidedById: integer("decided_by_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

/** single-row config table; avoids hardcoding quotas/shifts in app code.
 *  No pay rates here — this app records presence, not payroll (PRD §3). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("PT Nusantara Digital"),
  weeklyOvertimeCapHours: integer("weekly_ot_cap_hours").notNull().default(14),
  baseLeaveQuota: integer("base_leave_quota").notNull().default(12),
  shiftStart: time("shift_start").notNull().default("08:00:00"),
  shiftEnd: time("shift_end").notNull().default("17:00:00"),
  lateToleranceMinutes: integer("late_tolerance_minutes").notNull().default(15),
  /** Office point every clock-in is measured against (PRD §6: "wajib
   *  geolocation match radius kantor"). Default is Jl. Sudirman, per the mockup. */
  officeLat: numeric("office_lat", { precision: 9, scale: 6 })
    .notNull()
    .default("-6.224900"),
  officeLng: numeric("office_lng", { precision: 9, scale: 6 })
    .notNull()
    .default("106.809200"),
  geofenceRadiusM: integer("geofence_radius_m").notNull().default(150),
});
