import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) object storage — PRD §5 "File storage".
 *
 * The bucket stays private: nothing is ever served straight from R2. Every read
 * goes through GET /api/files/[...key], which authorizes by key prefix before
 * streaming the object back. That means no public bucket, no custom domain, no
 * CORS rule, and no images.remotePatterns in next.config.ts.
 *
 * What the DB stores in documents.url / attendance.selfie_url / employees.photo_url
 * is the R2 **object key**, not a URL. The columns keep their old names to avoid
 * renaming columns that already hold seeded data.
 */

const MB = 1024 * 1024;
/**
 * Documents go browser → R2 with a presigned PUT, so the serverless request-body
 * limit (4.5 MB on Vercel) does not apply to them and 100 MB fits. The size is
 * enforced after the fact by HEAD-ing the object on confirm: a presigned URL
 * cannot cap what gets written to it.
 *
 * Photos and selfies stay proxied through the route handler — they are small, and
 * that path needs no CORS rule and no confirm round-trip.
 */
export const MAX_DOC = 100 * MB;
/** 4 MB, not 1.5: a phone camera selfie at reduced quality still lands around
 *  2 MB, and the mobile clock-in has no way to re-encode it further. */
export const MAX_IMAGE = 4 * MB;
/**
 * 10 MB for a leave attachment: a phone photo of a doctor's note or a scanned PDF
 * fits several times over, and it is small enough that the multipart request the
 * pengajuan form sends still completes on a phone connection.
 */
export const MAX_ATTACHMENT = 10 * MB;
/** A presigned URL is a bearer token for one key, so it lives briefly: long
 *  enough to push 100 MB on a slow line, short enough that a leaked link is
 *  stale by the time it is shared. */
const PUT_TTL = 20 * 60;
const GET_TTL = 60;

export type Kind = "doc" | "photo" | "selfie" | "logo" | "lampiran";

// webp ada di sini, bukan hanya di IMAGE_EXT: aplikasi mobile mengecilkan setiap
// gambar menjadi WebP sebelum mengunggahnya sebagai dokumen, jadi tanpa baris ini
// setiap unggahan hasil kompresi ditolak "Tipe file tidak didukung"
const DOC_EXT = ["pdf", "csv", "xlsx", "docx", "jpg", "jpeg", "png", "webp"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

/** Lowercase extension without the dot, "" when there is none. */
export function extOf(filename: string): string {
  const base = filename.slice(filename.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function allowed(ext: string, kind: Kind): boolean {
  // a leave attachment is a document (a scanned note, a photo of one), so it
  // takes the document list rather than the image-only one
  return (kind === "doc" || kind === "lampiran" ? DOC_EXT : IMAGE_EXT).includes(
    ext,
  );
}

/**
 * Strip everything an object key has no business containing. Path separators and
 * dots collapse to "-", so "../../etc/passwd" can never climb out of its prefix.
 */
export function safeName(filename: string): string {
  const cleaned = filename
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "berkas";
}

/**
 * Document keys carry a uuid because two people upload "kontrak.pdf"; photo and
 * selfie keys are deterministic so re-uploading overwrites instead of orphaning.
 */
export function keyFor(
  kind: Kind,
  scope: string,
  filename = "",
  uuid = crypto.randomUUID(),
): string {
  switch (kind) {
    case "doc":
      return `docs/${scope}/${uuid}-${safeName(filename)}`;
    /**
     * A fresh key per upload, not a stable `photo/<id>`.
     *
     * Overwriting one object meant a replaced photo kept showing for up to the
     * five minutes the proxy tells browsers to cache it — and longer in a phone's
     * image cache. A new key changes the URL, so the new face appears at once while
     * avatars in a fifty-row list stay cacheable. The caller deletes the old object.
     */
    case "photo":
      return `photo/${scope}/${uuid}`;
    case "selfie":
      return `selfie/${scope}`;
    /** its own prefix, so the files route can authorize it from the request row
     *  rather than from the documents table (a leave attachment is not a document
     *  in "Berkas saya") */
    case "lampiran":
      return `lampiran/${scope}/${uuid}-${safeName(filename)}`;
    case "logo":
      return `logo/${scope}/${uuid}-${safeName(filename)}`;
  }
}

/** False when the env vars are missing, so the app still boots and builds
 *  without R2 configured — the routes answer 503 instead of crashing. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
  );
}

// Constructed per call on purpose: AwsClient only holds the credentials, so
// caching it buys nothing and would go stale whenever the env changes.
function client(): AwsClient {
  if (!r2Configured()) throw new Error("Object storage belum dikonfigurasi");
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    // R2 only accepts "auto"; the local S3 stand-ins reject it and want a real one
    region: process.env.R2_ENDPOINT ? "us-east-1" : "auto",
  });
}

/** R2_ENDPOINT overrides the host so a local S3 stand-in (LocalStack, MinIO) can
 *  be used in dev; in production only the four R2_* keys are set. */
const objectUrl = (key: string) =>
  `${
    process.env.R2_ENDPOINT?.replace(/\/$/, "") ??
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  }/${process.env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** URL the browser can PUT straight to, no credentials involved. Content type is
 *  deliberately left unsigned so the browser may send its own. */
export async function presignPut(key: string) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(PUT_TTL));
  const signed = await client().sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Download URL that makes R2 serve the object under its original name, so a
 *  100 MB file never passes through the function. `inline` is for the preview
 *  dialog; the caller decides, and only for types it can safely render. */
export async function presignGet(
  key: string,
  filename?: string,
  disposition: "attachment" | "inline" = "attachment",
) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(GET_TTL));
  if (filename) {
    url.searchParams.set(
      "response-content-disposition",
      `${disposition}; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
    );
  }
  const signed = await client().sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Real size of what was actually uploaded — null when the object is missing.
 *  The only trustworthy size: the client's claim is just a claim. */
export async function headObject(key: string): Promise<number | null> {
  const res = await client().fetch(objectUrl(key), { method: "HEAD" });
  if (!res.ok) return null;
  return Number(res.headers.get("content-length") ?? 0);
}

/** Body is buffered (not streamed) because SigV4 has to hash it. Images only. */
export async function putObject(
  key: string,
  body: ArrayBuffer,
  contentType: string,
) {
  const res = await client().fetch(objectUrl(key), {
    method: "PUT",
    body,
    headers: {
      "content-type": contentType || "application/octet-stream",
      // R2 rejects a chunked PUT (411 MissingContentLength), and fetch omits the
      // header on the first request of a cold process — so state it ourselves
      "content-length": String(body.byteLength),
    },
  });
  if (!res.ok) {
    // S3 errors are XML in the body; without it a misconfigured bucket or key
    // is just an opaque status code in the server log
    throw new Error(
      `R2 PUT ${key} gagal (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
}

export function getObject(key: string) {
  return client().fetch(objectUrl(key));
}

export async function deleteObject(key: string) {
  const res = await client().fetch(objectUrl(key), { method: "DELETE" });
  // 404 means it is already gone, which is the state we wanted anyway
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} gagal (${res.status})`);
  }
}
