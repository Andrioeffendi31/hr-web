-- Personal data for the employee record, and the four employment columns the HR
-- master data does not carry.
--
-- Hand-written for the same reason as 0002/0003/0004: production DDL runs one
-- statement at a time against the DIRECT endpoint, reviewed, not diffed by a
-- tool. Every statement is idempotent, so a re-run is harmless.
--
-- The four DROP NOT NULLs are the point of the file. The source sheet has no
-- division, jabatan, contract type or start date for anybody, and filling them
-- with a guess would put 26 wrong values in the columns the shift and the leave
-- quota are computed from. They stay empty until HR fills each one in through
-- /karyawan. Widening a column to nullable never rewrites the table.

-- 1 ─────────────────────────────────────────────────────────── gender as an enum
-- Trap the duplicate rather than rely on CREATE TYPE ... IF NOT EXISTS, which
-- Postgres does not have. Two values, genuinely closed; religion stays free text
-- because the official list is not stable and the source data already spells
-- Kristen as "Protestan".
DO $$ BEGIN
  CREATE TYPE "gender" AS ENUM ('Laki-laki', 'Perempuan');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2 ─────────────────────────────────────────────────────── personal data columns
-- All nullable and additive: the sheet has gaps (one row has no address), and a
-- blank is the truthful value for a field nobody has supplied.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "birth_place"     text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "birth_date"      date;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "address"         text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gender"          "gender";
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "religion"        text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone"           text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emergency_name"  text;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emergency_phone" text;

-- 3 ───────────────────────────────────────────── forced password change on import
-- NOT NULL with a default is safe here: existing rows get false, which is what
-- they mean — they chose their own password.
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

-- 4 ─────────────────────────── employment columns HR has not filled in yet
-- DROP NOT NULL is a catalogue-only change and re-running it is a no-op, so no
-- guard is needed. The division FK from 0002 is left exactly as it is: NULL
-- satisfies a foreign key, so an employee with no division yet is a valid row and
-- every division keeps its shift configuration.
ALTER TABLE "employees" ALTER COLUMN "division"      DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "position"      DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "contract_type" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "joined_at"     DROP NOT NULL;

-- Putting NOT NULL back, one deploy after HR has finished, is:
--   SELECT count(*) FROM "employees" WHERE "active"
--     AND ("division" IS NULL OR "position" IS NULL
--          OR "contract_type" IS NULL OR "joined_at" IS NULL);   -- must be 0
--   ALTER TABLE "employees" ALTER COLUMN "division" SET NOT NULL;  -- etc.
-- Deliberately not here: a validating SET NOT NULL scans the table and fails the
-- moment one row is still blank, which is the state this migration creates.
