-- Drop the single office point from `settings`, now that `office_locations` holds
-- it (0002_divisi_lokasi.sql).
--
-- SEPARATE FILE ON PURPOSE, AND RUN LAST. Statement 5 of 0002 reads these three
-- columns to create the first location row; dropping them in the same pass would
-- destroy the source before the copy exists.
--
-- Irreversible: after this there is no way back to the old shape without restoring
-- from a Neon branch. Confirm both of these return what you expect BEFORE running:
--
--   SELECT * FROM office_locations;
--   SELECT count(*) FROM attendance WHERE location_id IS NULL AND lat IS NOT NULL;  -- 0
--
-- DROP COLUMN itself is instant — Postgres only marks the column dead in the
-- catalogue, no table rewrite — but it takes a brief ACCESS EXCLUSIVE lock.

ALTER TABLE "settings" DROP COLUMN IF EXISTS "office_lat";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "office_lng";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "geofence_radius_m";
