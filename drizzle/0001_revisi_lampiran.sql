-- Revisi status + lampiran pengajuan cuti.
--
-- Hand-written rather than `drizzle-kit push`, because pushing this particular
-- change at a production database is not safe: push diffs the schema and is free
-- to recreate an enum type to add a value to it, which rewrites every column that
-- uses it (leave_requests.status AND overtime_requests.status) under a lock.
-- These four statements are the whole delta and none of them rewrites a table.
--
-- Run them one at a time, NOT wrapped in a single transaction: Postgres refuses to
-- use a new enum value in the same transaction that added it, and some managed
-- providers still run PG < 12 where ADD VALUE cannot be in a transaction at all.

-- 1. the new state. AFTER 'menunggu' keeps the sort order matching the TS enum,
--    which is the order every status list in the app renders in.
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'revisi' AFTER 'menunggu';

-- 2-4. nullable columns, so this is a catalogue-only change in PG 11+ — instant,
--       no table rewrite, no default to backfill.
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "attachment_key" text;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "attachment_name" text;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "attachment_size" integer;
