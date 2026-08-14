import { createTransport, type Transporter } from "nodemailer";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, settings } from "@/db/schema";
import { isiFor, renderHtml, renderText } from "./email-render";
import { baseUrl } from "./url";

type Template =
  | "request_submitted"
  | "request_disetujui"
  | "request_ditolak"
  | "request_revision"
  | "attendance_reminder"
  | "announcement_new"
  | "password_reset";

const SUBJECTS: Record<Template, string> = {
  request_submitted: "Pengajuan baru menunggu persetujuan",
  request_disetujui: "Pengajuan Anda disetujui",
  request_ditolak: "Pengajuan Anda ditolak",
  request_revision: "Pengajuan Anda perlu direvisi",
  attendance_reminder: "Anda belum absen masuk hari ini",
  announcement_new: "Pengumuman baru dari HR",
  password_reset: "Atur ulang kata sandi NanumHR",
};

/**
 * SMTP, over nodemailer.
 *
 * One transport for every provider instead of a per-provider HTTP client: Gmail,
 * Resend, Brevo and anything else all speak SMTP, so switching is four env vars
 * rather than a code change. Which matters here, because the sending story is
 * expected to change — Gmail today, a real domain later.
 *
 * With SMTP_USER/SMTP_PASS unset this logs to stdout exactly as before, so local
 * development needs no credentials and the reset link stays readable in the server
 * log. Callers never learn which happened.
 */
let transport: Transporter | null = null;

function smtp() {
  const user = process.env.SMTP_USER;
  // Google shows an app password as four spaced groups, and that is how everybody
  // pastes it. The spaces are not part of the secret, and leaving them in fails
  // authentication with a message that says nothing about spaces.
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
  if (!user || !pass || !process.env.EMAIL_FROM) return null;
  transport ??= createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user, pass },
    // ponytail: no connection pool. This runs on Vercel, where the function is
    // frozen between invocations, so a pooled socket is one that dies unnoticed and
    // fails the next send. Cost is a fresh handshake per email, which the reminder
    // run (one per absent employee) pays in serial — turn `pool: true` on if that
    // ever gets slow enough to notice, and only if this stops being serverless.
  });
  return transport;
}

async function send(to: string, subject: string, text: string, html: string) {
  const mailer = smtp();
  if (!mailer) {
    console.info(`[email] → ${to} · ${subject}\n${text}`);
    return;
  }
  try {
    // both parts, multipart/alternative: the text one is what a screen reader, a
    // watch notification and a spam scorer read, so it is not optional garnish
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    // Subject and recipient only, never the body: a successful send left no trace at
    // all, so "did the reset email go out?" had no answer short of asking the person.
    // The body is deliberately withheld — the reset link must not sit in a log.
    console.info(`[email] terkirim → ${to} · ${subject}`);
  } catch (e) {
    // A notification that cannot be delivered must never fail the request that
    // triggered it — an approval is still an approval if the email bounces.
    console.error("[email] gagal", (e as Error).message);
    // and for a reset link the content *is* the message, so outside production it
    // stays recoverable from the log rather than vanishing with the failed send
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] isi yang gagal terkirim → ${to}\n${text}`);
    }
  }
}

/**
 * Outbound email (PRD §8).
 *
 * Sends over SMTP when SMTP_USER, SMTP_PASS and EMAIL_FROM are set, and logs to
 * stdout when they are not — so dev and CI need no provider, and production needs
 * no code change.
 */
export async function queueEmail({
  to,
  template,
  context,
}: {
  to: number | number[];
  template: Template;
  context?: Record<string, unknown>;
}) {
  const ids = Array.isArray(to) ? to : [to];
  if (ids.length === 0) return { sent: 0 };

  const targets = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(inArray(employees.id, ids));

  // The company name belongs in the email, not just in the app: an employee who
  // gets this at 7am should see who it is from before deciding it is not phishing.
  const [cfg] = await db
    .select({ companyName: settings.companyName })
    .from(settings)
    .limit(1);
  const perusahaan = cfg?.companyName ?? "NanumHR";
  const base = baseUrl();

  await Promise.all(
    targets.map((r) => {
      const isi = isiFor(template, r.name, base, context);
      return send(
        r.email,
        SUBJECTS[template],
        renderText(isi, perusahaan),
        renderHtml(isi, perusahaan),
      );
    }),
  );
  return { sent: targets.length };
}
