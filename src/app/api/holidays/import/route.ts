import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { auditLog, holidays } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { isIsoDate } from "@/lib/hr";

const MAX_BYTES = 256 * 1024;

const row = z.object({
  date: z
    .string()
    .refine(isIsoDate, "tanggal harus YYYY-MM-DD dan tanggal nyata"),
  name: z.string().trim().min(2, "nama wajib diisi").max(120),
  collective: z.boolean(),
});
type Row = z.infer<typeof row>;

const TRUE = new Set(["ya", "y", "true", "1", "yes"]);
const FALSE = new Set(["tidak", "t", "false", "0", "no", ""]);

/**
 * Two ways in, one code path: a CSV file (multipart) or a JSON array from the
 * "ambil libur nasional" preview dialog. Bad rows are reported, not fatal —
 * a single typo shouldn't reject a whole calendar.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const errors: { line: number; message: string }[] = [];
  const rows: Row[] = [];

  if (req.headers.get("content-type")?.includes("application/json")) {
    const parsed = z
      .array(row)
      .max(400)
      .safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Daftar hari libur tidak valid" },
        { status: 400 },
      );
    }
    rows.push(...parsed.data);
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "File CSV tidak ditemukan" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: "File terlalu besar (maks 256 KB)" },
        { status: 413 },
      );
    }

    const table = parseCsv(await file.text());
    if (table.length === 0) {
      return Response.json({ error: "File kosong" }, { status: 400 });
    }

    // Skip the header row only when it actually looks like one.
    const start = /tanggal/i.test(table[0][0] ?? "") ? 1 : 0;
    for (let i = start; i < table.length; i++) {
      const line = i + 1;
      const [date = "", name = "", collective = ""] = table[i].map((c) =>
        c.trim(),
      );
      const flag = collective.toLowerCase();
      if (!TRUE.has(flag) && !FALSE.has(flag)) {
        errors.push({
          line,
          message: `kolom cuti_bersama "${collective}" tidak dikenal`,
        });
        continue;
      }
      const parsed = row.safeParse({ date, name, collective: TRUE.has(flag) });
      if (!parsed.success) {
        errors.push({ line, message: parsed.error.issues[0].message });
        continue;
      }
      rows.push(parsed.data);
    }
  }

  // Later duplicates of the same date win; Postgres rejects a batch that
  // touches the same key twice.
  const unique = [...new Map(rows.map((r) => [r.date, r])).values()];

  if (unique.length > 0) {
    await db
      .insert(holidays)
      .values(unique)
      .onConflictDoUpdate({
        target: holidays.date,
        set: {
          name: sql`excluded.name`,
          collective: sql`excluded.collective`,
        },
      });

    await db.insert(auditLog).values({
      actorId: Number(admin.id),
      action: "holiday.import",
      entity: "holidays",
      detail: `${unique.length} hari libur diimpor, ${errors.length} baris ditolak`,
    });

    revalidatePath("/libur");
    revalidatePath("/cuti");
  }

  return Response.json({
    imported: unique.length,
    skipped: errors.length,
    errors,
  });
}
