import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";

type Template =
  | "request_disetujui"
  | "request_ditolak"
  | "request_revision"
  | "attendance_reminder"
  | "announcement_new";

const SUBJECTS: Record<Template, string> = {
  request_disetujui: "Pengajuan Anda disetujui",
  request_ditolak: "Pengajuan Anda ditolak",
  request_revision: "Pengajuan Anda perlu direvisi",
  attendance_reminder: "Anda belum absen masuk hari ini",
  announcement_new: "Pengumuman baru dari HR",
};

/**
 * Outbound email (PRD §8).
 *
 * ponytail: logs to stdout until SMTP credentials exist. The call sites and
 * templates are already correct, so switching to a real provider is one
 * implementation swap here — set RESEND_API_KEY (or SMTP_URL) and replace the
 * console.info with the provider call. No caller changes.
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

  for (const r of targets) {
    console.info(
      `[email] → ${r.email} · ${SUBJECTS[template]}`,
      context ? JSON.stringify(context) : "",
    );
  }
  return { sent: targets.length };
}
