-- Which office the app offers first, while GPS is still answering.
--
-- Additive and nullable, so `npm run db:push` would handle it too; kept here for
-- the same reason as 0002 and 0003 — production DDL runs statement by statement
-- against the direct endpoint, reviewed, not diffed by a tool.
--
-- SET NULL rather than RESTRICT, unlike attendance.location_id: that column is
-- evidence of where a punch happened and must not be erased, this one is a
-- preference with a sensible fallback (first location by name).

ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "default_location_id" integer;

ALTER TABLE "settings"
  DROP CONSTRAINT IF EXISTS "settings_default_location_id_office_locations_id_fk";
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_default_location_id_office_locations_id_fk"
  FOREIGN KEY ("default_location_id") REFERENCES "office_locations"("id")
  ON DELETE SET NULL;

-- a company that already had exactly one office clearly means that one
UPDATE "settings"
  SET "default_location_id" = (SELECT min("id") FROM "office_locations")
  WHERE "id" = 1 AND "default_location_id" IS NULL;
