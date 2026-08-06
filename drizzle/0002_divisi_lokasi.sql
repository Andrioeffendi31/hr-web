-- Divisions with their own shift, and office locations as rows instead of three
-- columns on the settings row.
--
-- Hand-written because `drizzle-kit push` cannot do either half safely:
--   · it would create `divisions` and add the employees FK in one diff pass, with
--     no window to backfill, so the constraint would validate against an empty
--     table and fail;
--   · it never moves data, so the single office point on `settings` would simply
--     be dropped rather than becoming the first `office_locations` row.
--
-- Run one statement at a time against the DIRECT Neon endpoint (not the pooler),
-- checking each. Every statement is idempotent, so a re-run is harmless.
--
-- Order matters: the settings columns must still exist when step 5 reads them.
-- Dropping them is deliberately NOT here — do that one deploy later, once a
-- rollback can no longer need the source data.

-- 1 ────────────────────────────────────────────────────────────── divisions
CREATE TABLE IF NOT EXISTS "divisions" (
  "name" text PRIMARY KEY,
  "shift_start" time,
  "shift_end" time,
  "late_tolerance_minutes" integer
);

-- 2 ── every division names by an employee today, so the FK below can validate
INSERT INTO "divisions" ("name")
  SELECT DISTINCT "division" FROM "employees"
  ON CONFLICT DO NOTHING;

-- 3 ── the constraint name matches what drizzle generates
--      (<table>_<column>_<reftable>_<refcolumn>_fk), so a later `db:push` sees a
--      no-op instead of trying to recreate it
ALTER TABLE "employees"
  DROP CONSTRAINT IF EXISTS "employees_division_divisions_name_fk";
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_division_divisions_name_fk"
  FOREIGN KEY ("division") REFERENCES "divisions"("name") ON UPDATE CASCADE;

-- 4 ─────────────────────────────────────────────────────── office locations
CREATE TABLE IF NOT EXISTS "office_locations" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "lat" numeric(9, 6) NOT NULL,
  "lng" numeric(9, 6) NOT NULL,
  "radius_m" integer NOT NULL DEFAULT 150,
  "active" boolean NOT NULL DEFAULT true
);

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "location_id" integer;

ALTER TABLE "attendance"
  DROP CONSTRAINT IF EXISTS "attendance_location_id_office_locations_id_fk";
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_location_id_office_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "office_locations"("id") ON DELETE RESTRICT;

-- 5 ── the one office that used to live on the settings row becomes the first
--      location, keeping its exact coordinates and radius
INSERT INTO "office_locations" ("name", "lat", "lng", "radius_m", "active")
  SELECT 'Kantor Pusat', "office_lat", "office_lng", "geofence_radius_m", true
  FROM "settings" WHERE "id" = 1
    AND NOT EXISTS (SELECT 1 FROM "office_locations");

-- 6 ── there was only ever one office, so every geofenced punch in history was
--      measured against it. Rows without coordinates (leave, sick, WFH, anything
--      HR typed by hand) keep a NULL, which every reader renders as "no distance".
UPDATE "attendance"
  SET "location_id" = (SELECT min("id") FROM "office_locations")
  WHERE "location_id" IS NULL AND "lat" IS NOT NULL;
