-- Password security: the session-invalidation stamp and the self-service reset
-- token store.
--
-- Hand-written like 0002–0005: production DDL runs one statement at a time
-- against the DIRECT endpoint, reviewed, not diffed by a tool. Every statement is
-- idempotent, so a re-run is harmless.

-- 1 ─────────────────────────────── when this account's password last changed
-- Compared against the JWT's `iat` on every request that already reads this row,
-- so a token minted before the change stops working — that is what makes
-- "I changed my password because it leaked" actually evict the other device.
--
-- Nullable, and deliberately NOT backfilled. NULL is the truthful value for a row
-- nobody has rotated since this deploy, and the staleness check reads it as "no
-- token is stale". Setting it to now() would sign every live session out on
-- deploy day and buy nothing.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;

-- 2 ───────────────────────────────────────── self-service reset tokens
-- Same shape and lifecycle as webauthn_challenges: opaque id, owner, expiry, and
-- single-use by DELETE ... RETURNING.
--
-- The id is sha256(token), never the token. The token itself exists only in the
-- emailed link, so reading this table gives an attacker nothing to redeem — the
-- difference between a leaked database and a leaked database plus every account.
-- The foreign key is named explicitly, in the shape drizzle generates
-- (<table>_<col>_<reftable>_<refcol>_fk), for the same reason 0002 does it: an
-- unnamed REFERENCES gets Postgres' own `..._fkey`, and the next `db:push` in dev
-- then "fixes" the name — a diff where there should be none.
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id"          text PRIMARY KEY,
  "employee_id" integer NOT NULL,
  "expires_at"  timestamptz NOT NULL,
  CONSTRAINT "password_resets_employee_id_employees_id_fk"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE
);

-- one live link per person: issuing a new one deletes the old, which is an index
-- scan rather than a sequential one
CREATE INDEX IF NOT EXISTS "password_resets_employee_idx"
  ON "password_resets" ("employee_id");
