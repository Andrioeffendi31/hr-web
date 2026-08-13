/**
 * Reading the constraint Postgres actually rejected on.
 *
 * Letting the database enforce uniqueness and referential integrity means the
 * failure arrives as an exception rather than as a pre-flight `SELECT count(*)`
 * — one round trip instead of two, and no race between the check and the write.
 * The cost is that the useful part is buried: drizzle wraps the pg error, so the
 * code and constraint name live somewhere down the `.cause` chain.
 */
type PgError = {
  code?: string;
  constraint?: string;
  detail?: string;
  cause?: unknown;
};

/** The pg error with this SQLSTATE somewhere in the cause chain, or null. */
export function pgError(e: unknown, code: string): PgError | null {
  let err = e as PgError;
  while (err && err.code !== code && err.cause) err = err.cause as PgError;
  return err?.code === code ? err : null;
}

/** unique_violation */
export const duplicate = (e: unknown) => pgError(e, "23505");

/** foreign_key_violation — either the value points at nothing, or something
 *  still points at the row being deleted. `detail` says which table. */
export const fkViolation = (e: unknown) => pgError(e, "23503");
