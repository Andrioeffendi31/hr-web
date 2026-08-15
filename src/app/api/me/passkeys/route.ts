import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authenticators } from "@/db/schema";
import { withMe } from "@/lib/me";

/** Passkey ids are only needed on the Settings screen, not during Home startup. */
export const GET = withMe(async (me) => {
  const rows = await db
    .select({ id: authenticators.credentialId })
    .from(authenticators)
    .where(eq(authenticators.employeeId, me.id));

  return Response.json({ ids: rows.map((row) => row.id) });
});
