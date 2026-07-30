import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// node-postgres works against both local Postgres and Neon's pooled endpoint,
// so dev and prod share one driver.
// ponytail: single shared Pool. If serverless connection limits bite on Neon,
// swap to drizzle-orm/neon-http + @neondatabase/serverless (one-line change here).
const globalForDb = globalThis as unknown as { pool?: Pool };
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech")
      ? { rejectUnauthorized: true }
      : undefined,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
