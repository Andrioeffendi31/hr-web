import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, employees } from "@/db/schema";

/**
 * HR resetting somebody else's password (PRD §7 — HR administers accounts).
 *
 * Its own route rather than a fourth body shape on PATCH /api/employees: that
 * handler already has to guess between a full update and a toggle by sniffing for
 * `"nik" in raw`, and a third guess is how that turns into a bug.
 */
const body = z.object({ id: z.coerce.number().int().positive() });

/**
 * Generated, never typed by HR.
 *
 * A human-chosen temporary password is the same one for all 26 people, is known to
 * HR afterwards, and needs its own validation pass. Generating it guarantees the
 * cekSandi() rule passes by construction.
 *
 * The alphabet drops O/0 and l/1 because this gets read out over the phone.
 *
 * ponytail: the class order is fixed (caps, lower, digits, symbol), which leaks a
 * few bits — ~2^45 remains, and the password is single-use by definition since
 * mustChangePassword retires it at first sign-in.
 */
function sandiSementara() {
  const pick = (set: string, n: number) =>
    Array.from(randomBytes(n), (b) => set[b % set.length]).join("");
  return (
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 3) +
    pick("abcdefghijkmnopqrstuvwxyz", 4) +
    pick("23456789", 3) +
    pick("!@#$?", 1)
  );
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const { id } = parsed.data;

  // Same reasoning as the self-deactivation guard in the sibling route: this would
  // leave HR holding a password that only ever existed in one HTTP response, on an
  // account forced to change it before it can do anything.
  if (Number(admin.id) === id) {
    return Response.json(
      {
        error:
          "Untuk akun sendiri, pakai halaman Ganti kata sandi di menu profil",
      },
      { status: 400 },
    );
  }

  const password = sandiSementara();
  const [row] = await db
    .update(employees)
    .set({
      passwordHash: await bcrypt.hash(password, 10),
      // they must retire it at first sign-in, and every device still holding the
      // old session is signed out (see stale() in auth.ts)
      mustChangePassword: true,
      passwordChangedAt: new Date(),
    })
    .where(eq(employees.id, id))
    .returning({ name: employees.name });

  if (!row) {
    return Response.json(
      { error: "Karyawan tidak ditemukan" },
      { status: 404 },
    );
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "employee.password_reset",
    entity: "employees",
    entityId: id,
    // the name, never the password: an audit trail records that a reset happened,
    // and a log anyone with read access can grep is not a place to keep credentials
    detail: row.name,
  });

  revalidatePath("/karyawan");
  return Response.json({ ok: true, password });
}
