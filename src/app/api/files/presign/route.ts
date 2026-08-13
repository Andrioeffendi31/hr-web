import { z } from "zod";
import { requireAdmin } from "@/auth";
import {
  MAX_DOC,
  allowed,
  extOf,
  keyFor,
  presignPut,
  r2Configured,
} from "@/lib/r2";

const body = z.object({
  folder: z.enum(["personal", "kontrak", "sertif", "legal"]),
  filename: z.string().trim().min(1).max(200),
  size: z.coerce.number().int().positive(),
});

/**
 * Step 1 of a document upload: hand the browser a URL it can PUT the bytes to
 * directly, so a 100 MB file never touches the serverless request body (capped
 * at 4.5 MB). The row is written in step 2 by POST /api/files, which HEADs the
 * object — `size` here is only used to fail fast on something obviously too big.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  if (!r2Configured()) {
    return Response.json(
      { error: "Object storage belum dikonfigurasi" },
      { status: 503 },
    );
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }
  const { folder, filename, size } = parsed.data;

  if (!allowed(extOf(filename), "doc")) {
    return Response.json(
      { error: "Tipe file tidak didukung (PDF, CSV, XLSX, DOCX, JPG, PNG)" },
      { status: 400 },
    );
  }
  if (size > MAX_DOC) {
    return Response.json(
      { error: `File terlalu besar (maks ${MAX_DOC / (1024 * 1024)} MB)` },
      { status: 413 },
    );
  }

  const key = keyFor("doc", folder, filename);
  return Response.json({ key, url: await presignPut(key) });
}
