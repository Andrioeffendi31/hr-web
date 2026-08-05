import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { employees, leaveRequests, overtimeRequests } from "@/db/schema";
import {
  durasi,
  isIsoDate,
  overtimeMinutes,
  rentangTanggal,
  tanggalPendek,
  todayWib,
  workingDays,
} from "@/lib/hr";
import { holidaySet, leaveBalances } from "@/lib/leave";
import { Bad, config, withMe } from "@/lib/me";
import {
  MAX_ATTACHMENT,
  allowed,
  deleteObject,
  extOf,
  keyFor,
  putObject,
  r2Configured,
} from "@/lib/r2";
import { queueEmail } from "@/lib/email";

/** "Pengajuan Saya" (PRD-Mobile §6.3). Duration and balance are computed here,
 *  never taken from the phone — the client only previews them. */

/** A submission is the first event in this app the employee starts and HR must
 *  react to, so the notification goes to the approvers, not back to the sender. */
async function hrAdmins() {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.role, "hr_admin"), eq(employees.active, true)));
  return rows.map((r) => r.id);
}

export const GET = withMe(async (me) => {
  const year = Number(todayWib().slice(0, 4));
  const [cuti, lembur, balances, delegates] = await Promise.all([
    db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.employeeId, me.id))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(50),
    db
      .select()
      .from(overtimeRequests)
      .where(eq(overtimeRequests.employeeId, me.id))
      .orderBy(desc(overtimeRequests.createdAt))
      .limit(50),
    leaveBalances(year, me.id),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.active, true), eq(employees.division, me.division))),
  ]);

  return Response.json({
    balance: balances[0] ?? null,
    delegates: delegates.filter((d) => d.id !== me.id),
    cuti: cuti.map((r) => ({
      id: r.id,
      kind: "cuti" as const,
      title: r.type,
      detail: `${rentangTanggal(r.startDate, r.endDate)} · ${r.days} hari`,
      note: r.decisionNote ?? "Menunggu persetujuan HR",
      status: r.status,
      createdAt: r.createdAt,
      days: r.days,
      /** the raw fields, so a request sent back for revision can be reopened in
       *  the same form that created it rather than retyped from its summary */
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      delegateId: r.delegateId,
      attachment: r.attachmentKey
        ? { key: r.attachmentKey, name: r.attachmentName, size: r.attachmentSize }
        : null,
    })),
    lembur: lembur.map((r) => ({
      id: r.id,
      kind: "lembur" as const,
      title: `Lembur ${r.kind.toLowerCase()}`,
      detail: `${tanggalPendek(r.date)} · ${r.startTime.slice(0, 5)}–${r.endTime.slice(0, 5)} · ${durasi(r.minutes)}`,
      note: r.decisionNote ?? "Menunggu persetujuan HR",
      status: r.status,
      createdAt: r.createdAt,
      date: r.date,
      minutes: r.minutes,
    })),
  });
});


/**
 * The body, whichever way it arrived.
 *
 * A leave request can carry one file, so the phone sends multipart; overtime has
 * nothing to attach and stays JSON. Reading both here keeps one zod schema and
 * one set of rules for each kind — the alternative was a second endpoint that
 * would have to re-check the balance and the working days all over again.
 */
async function payload(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("multipart/form-data")) {
    return { data: (await req.json().catch(() => ({}))) as Record<string, unknown>, file: null };
  }
  const form = await req.formData();
  const data: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") data[k] = v;
  const file = form.get("attachment");
  return { data, file: file instanceof File && file.size > 0 ? file : null };
}

/** Validate and store one leave attachment, returning the columns to write. */
async function storeAttachment(file: File, requestId: number) {
  if (!r2Configured()) throw new Bad("Object storage belum dikonfigurasi", 503);
  if (!allowed(extOf(file.name), "lampiran")) {
    throw new Bad("Lampiran harus PDF, JPG, PNG, DOCX, XLSX atau CSV");
  }
  if (file.size > MAX_ATTACHMENT) {
    throw new Bad(`Lampiran terlalu besar (maks ${MAX_ATTACHMENT / (1024 * 1024)} MB)`, 413);
  }
  const key = keyFor("lampiran", String(requestId), file.name);
  await putObject(key, await file.arrayBuffer(), file.type);
  return { attachmentKey: key, attachmentName: file.name, attachmentSize: file.size };
}

const create = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cuti"),
    type: z.enum(["Cuti Tahunan", "Cuti Sakit", "Izin Khusus"]),
    startDate: z.string().refine(isIsoDate, "tanggal mulai harus YYYY-MM-DD"),
    endDate: z.string().refine(isIsoDate, "tanggal selesai harus YYYY-MM-DD"),
    reason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500),
    delegateId: z.coerce.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("lembur"),
    date: z.string().refine(isIsoDate, "tanggal harus YYYY-MM-DD"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "jam mulai harus HH:MM"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "jam selesai harus HH:MM"),
    reason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500),
  }),
]);

export const POST = withMe(async (me, req) => {
  const { data, file } = await payload(req);
  const parsed = create.safeParse(data);
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const input = parsed.data;
  const cfg = await config();

  if (input.kind === "cuti") {
    if (input.endDate < input.startDate) {
      throw new Bad("Tanggal selesai lebih awal dari tanggal mulai");
    }
    const year = Number(input.startDate.slice(0, 4));
    const days = workingDays(
      input.startDate,
      input.endDate,
      await holidaySet(year),
    );
    if (days < 1) throw new Bad("Rentang tanggal tidak memuat hari kerja");

    if (input.type === "Cuti Tahunan") {
      const [bal] = await leaveBalances(year, me.id);
      if (bal && days > bal.remaining) {
        throw new Bad(`Saldo cuti tinggal ${bal.remaining} hari, diminta ${days} hari`);
      }
    }

    const [row] = await db
      .insert(leaveRequests)
      .values({
        employeeId: me.id,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        reason: input.reason,
        delegateId: input.delegateId ?? null,
      })
      .returning({ id: leaveRequests.id });

    // after the insert, so the object key can be scoped by request id — and so a
    // rejected request never leaves a file in the bucket with nothing pointing at it
    if (file) {
      await db
        .update(leaveRequests)
        .set(await storeAttachment(file, row.id))
        .where(eq(leaveRequests.id, row.id));
    }

    await queueEmail({
      to: await hrAdmins(),
      template: "request_submitted",
      context: { kind: "cuti", requestId: row.id, from: me.name, days },
    });
    revalidatePath("/cuti");
    return Response.json({ ok: true, id: row.id, days });
  }

  const minutes = overtimeMinutes(input.startTime, input.endTime);
  if (minutes < 30) throw new Bad("Lembur minimal 30 menit");

  // weekly cap (PRD §6.3) — the mockup only prints the rule, the server is
  // where it has to actually hold
  const monday = new Date(`${input.date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 6);
  const weekEnd = monday.toISOString().slice(0, 10);

  const [week] = await db
    .select({
      minutes: sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(Number),
    })
    .from(overtimeRequests)
    .where(
      and(
        eq(overtimeRequests.employeeId, me.id),
        gte(overtimeRequests.date, weekStart),
        lte(overtimeRequests.date, weekEnd),
        sql`${overtimeRequests.status} <> 'ditolak' and ${overtimeRequests.status} <> 'dibatalkan'`,
      ),
    );
  const capMinutes = cfg.weeklyOvertimeCapHours * 60;
  if (week.minutes + minutes > capMinutes) {
    throw new Bad(
      `Melewati batas ${cfg.weeklyOvertimeCapHours} jam/minggu (sudah ${durasi(week.minutes)})`,
    );
  }

  const day = new Date(`${input.date}T00:00:00Z`).getUTCDay();
  const holiday = (await holidaySet(Number(input.date.slice(0, 4)))).has(input.date);
  const [row] = await db
    .insert(overtimeRequests)
    .values({
      employeeId: me.id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      minutes,
      kind: day === 0 || day === 6 || holiday ? "Hari libur" : "Hari kerja",
      reason: input.reason,
    })
    .returning({ id: overtimeRequests.id });

  await queueEmail({
    to: await hrAdmins(),
    template: "request_submitted",
    context: { kind: "lembur", requestId: row.id, from: me.name, minutes },
  });
  revalidatePath("/lembur");
  return Response.json({ ok: true, id: row.id, minutes });
});


/**
 * Edit and resubmit a leave request HR sent back.
 *
 * Only `revisi`, and only your own — the where clause is the authorization, so a
 * guessed id belonging to somebody else simply matches nothing. Every rule the
 * create path enforces runs again: the working days are recounted against the
 * holiday table, the annual balance is rechecked, and the dates are re-validated,
 * because a revision is a new submission with a shorter journey, not a patch.
 *
 * Resubmitting clears the HR note and returns the row to `menunggu`, which is what
 * puts it back in the approval queue.
 */
const edit = z.object({
  id: z.coerce.number().int().positive(),
  type: z.enum(["Cuti Tahunan", "Cuti Sakit", "Izin Khusus"]),
  startDate: z.string().refine(isIsoDate, "tanggal mulai harus YYYY-MM-DD"),
  endDate: z.string().refine(isIsoDate, "tanggal selesai harus YYYY-MM-DD"),
  reason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500),
  delegateId: z.coerce.number().int().positive().optional(),
  /** "1" when the employee removed the existing file without picking a new one */
  removeAttachment: z.string().optional(),
});

export const PUT = withMe(async (me, req) => {
  const { data, file } = await payload(req);
  const parsed = edit.safeParse(data);
  if (!parsed.success) {
    throw new Bad(parsed.error.issues[0]?.message ?? "Permintaan tidak valid");
  }
  const input = parsed.data;

  const [current] = await db
    .select({ id: leaveRequests.id, key: leaveRequests.attachmentKey })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.id, input.id),
        eq(leaveRequests.employeeId, me.id),
        eq(leaveRequests.status, "revisi"),
      ),
    )
    .limit(1);
  if (!current) throw new Bad("Pengajuan tidak ditemukan atau tidak dalam revisi", 404);

  if (input.endDate < input.startDate) {
    throw new Bad("Tanggal selesai lebih awal dari tanggal mulai");
  }
  const year = Number(input.startDate.slice(0, 4));
  const days = workingDays(input.startDate, input.endDate, await holidaySet(year));
  if (days < 1) throw new Bad("Rentang tanggal tidak memuat hari kerja");

  if (input.type === "Cuti Tahunan") {
    /**
     * The same check the create path makes, deliberately: `leaveBalances` counts
     * only `disetujui` rows, so this request is not holding any balance while it
     * waits — adding its own days back would hand the employee days they do not
     * have. A revision is measured against the same remaining figure as a new
     * request, which is also the figure HR sees in the queue.
     */
    const [bal] = await leaveBalances(year, me.id);
    if (bal && days > bal.remaining) {
      throw new Bad(`Saldo cuti tinggal ${bal.remaining} hari, diminta ${days} hari`);
    }
  }

  const attachment = file
    ? await storeAttachment(file, input.id)
    : input.removeAttachment === "1"
      ? { attachmentKey: null, attachmentName: null, attachmentSize: null }
      : {};

  await db
    .update(leaveRequests)
    .set({
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      reason: input.reason,
      delegateId: input.delegateId ?? null,
      status: "menunggu",
      decisionNote: null,
      decidedById: null,
      decidedAt: null,
      ...attachment,
    })
    .where(eq(leaveRequests.id, input.id));

  // the old object only goes once the row no longer points at it, and never when
  // the failure would have left the request without its evidence
  const replaced = current.key && "attachmentKey" in attachment;
  if (replaced && current.key !== attachment.attachmentKey && r2Configured()) {
    await deleteObject(current.key!).catch(() => undefined);
  }

  await queueEmail({
    to: await hrAdmins(),
    template: "request_submitted",
    context: { kind: "cuti", requestId: input.id, from: me.name, days, revised: true },
  });
  revalidatePath("/cuti");
  return Response.json({ ok: true, id: input.id, days });
});

const cancel = z.object({
  kind: z.enum(["cuti", "lembur"]),
  id: z.coerce.number().int().positive(),
});

/** Only own requests, and only while still open — `menunggu` or `revisi`. The
 *  where clause is the authorization, so a guessed id from another employee simply
 *  matches nothing. */
export const PATCH = withMe(async (me, req) => {
  const parsed = cancel.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Permintaan tidak valid");
  const table = parsed.data.kind === "cuti" ? leaveRequests : overtimeRequests;

  const [row] = await db
    .update(table)
    .set({ status: "dibatalkan", decisionNote: "Dibatalkan oleh karyawan" })
    .where(
      and(
        eq(table.id, parsed.data.id),
        eq(table.employeeId, me.id),
        inArray(table.status, ["menunggu", "revisi"]),
      ),
    )
    .returning({ id: table.id });

  if (!row) throw new Bad("Pengajuan tidak ditemukan atau sudah diputuskan", 404);

  revalidatePath(parsed.data.kind === "cuti" ? "/cuti" : "/lembur");
  return Response.json({ ok: true });
});
