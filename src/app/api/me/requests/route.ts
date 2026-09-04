import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import {
  attendance,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import {
  MAKS_MUNDUR_HARI,
  durasi,
  isIsoDate,
  isHariKerja,
  jam,
  overtimeMinutes,
  resolveShift,
  rentangTanggal,
  tanggalPendek,
  terlaluMundur,
  todayWib,
  workingDays,
} from "@/lib/hr";
import { holidaySet, leaveBalances } from "@/lib/leave";
import { tokenSurat } from "@/lib/surat";
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
import { PERAN_KONSOL } from "@/lib/access";

/** "Pengajuan Saya" (PRD-Mobile §6.3). Duration and balance are computed here,
 *  never taken from the phone — the client only previews them. */

/** A submission is the first event in this app the employee starts and HR must
 *  react to, so the notification goes to the approvers, not back to the sender. */
/**
 * Penerima notifikasi pengajuan: admin DAN Pimpinan.
 *
 * Namanya tertinggal dari zaman satu peran, tapi isinya sekarang "siapa saja yang
 * berwenang memutus" — Pimpinan yang tidak pernah diberi tahu adalah tingkat kedua
 * yang tidak pernah tahu ada yang menunggunya.
 */
async function hrAdmins() {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(inArray(employees.role, [...PERAN_KONSOL]), eq(employees.active, true)));
  return rows.map((r) => r.id);
}

export const GET = withMe(async (me) => {
  const year = Number(todayWib().slice(0, 4));
  // aliased join: the delegate is an employee row too, and `employees` is already
  // in this query for the delegate *list*
  const delegate = alias(employees, "delegate");
  const [cuti, lembur, balances, delegates] = await Promise.all([
    db
      .select({
        row: leaveRequests,
        /** resolved here rather than matched against the delegate list on the
         *  phone: that list only holds active colleagues, so somebody who has
         *  since left would silently show as "—" */
        delegateName: delegate.name,
      })
      .from(leaveRequests)
      .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
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
      // no division on file yet: offer every active colleague rather than nobody —
      // an employee who cannot name a delegate cannot file leave at all
      .where(
        and(
          eq(employees.active, true),
          me.division ? eq(employees.division, me.division) : undefined,
        ),
      ),
  ]);

  return Response.json({
    balance: balances[0] ?? null,
    delegates: delegates.filter((d) => d.id !== me.id),
    cuti: cuti.map(({ row: r, delegateName }) => ({
      id: r.id,
      kind: "cuti" as const,
      title: r.type,
      detail:
        r.startTime && r.endTime
          ? `${tanggalPendek(r.startDate)} · ${jam(r.startTime)}–${jam(r.endTime)}`
          : `${rentangTanggal(r.startDate, r.endDate)} · ${r.days} hari`,
      note:
        r.decisionNote ??
        (r.status === "menunggu_pimpinan"
          ? "Disetujui admin · menunggu persetujuan Pimpinan"
          : "Menunggu persetujuan HR"),
      status: r.status,
      createdAt: r.createdAt,
      days: r.days,
      /** the raw fields, so a request sent back for revision can be reopened in
       *  the same form that created it rather than retyped from its summary */
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      startTime: r.startTime ? jam(r.startTime) : undefined,
      endTime: r.endTime ? jam(r.endTime) : undefined,
      /** tanda tangan surat izinnya; ponsel memakainya sebagai URL unduhan, dan
       *  QR di suratnya memuat tanda yang sama */
      suratToken: tokenSurat(r.id),
      reason: r.reason,
      delegateId: r.delegateId,
      delegateName,
      attachment: r.attachmentKey
        ? {
            key: r.attachmentKey,
            name: r.attachmentName,
            size: r.attachmentSize,
          }
        : null,
    })),
    lembur: lembur.map((r) => ({
      id: r.id,
      kind: "lembur" as const,
      title: `Lembur ${r.kind.toLowerCase()}`,
      detail: `${tanggalPendek(r.date)} · ${r.startTime.slice(0, 5)}–${r.endTime.slice(0, 5)} · ${durasi(r.minutes)}`,
      // lembur satu tingkat: tidak ada keadaan antara untuk dijelaskan
      note: r.decisionNote ?? "Menunggu persetujuan HR",
      status: r.status,
      createdAt: r.createdAt,
      date: r.date,
      minutes: r.minutes,
      /** the raw times too: the phone opens a filed request in the same form that
       *  created it, and a form that defaulted its time fields would show hours
       *  nobody submitted */
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
      reason: r.reason,
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
    return {
      data: (await req.json().catch(() => ({}))) as Record<string, unknown>,
      file: null,
    };
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
    throw new Bad(
      `Lampiran terlalu besar (maks ${MAX_ATTACHMENT / (1024 * 1024)} MB)`,
      413,
    );
  }
  const key = keyFor("lampiran", String(requestId), file.name);
  await putObject(key, await file.arrayBuffer(), file.type);
  return {
    attachmentKey: key,
    attachmentName: file.name,
    attachmentSize: file.size,
  };
}

/**
 * Aturan jam izin setengah hari — satu tempat, dipakai POST maupun PUT, karena
 * dua salinan aturan jam adalah dua aturan yang akan berbeda pendapat.
 *
 * Yang ditegakkan di sini: jamnya hanya untuk jenis itu, wajib berdua, satu
 * tanggal saja, selesai sesudah mulai, dan TIDAK boleh menutup seluruh shift —
 * izin sehari punya jenisnya sendiri, dan izin yang menutup semuanya akan
 * membuat `geserShift()` tidak punya batas yang tersisa untuk dinilai.
 */
function jamIzin(
  input: {
    type: string;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
  },
  shift: { start: string; end: string },
) {
  const m = (t: string) => {
    const [h, min] = t.split(":").map(Number);
    return h * 60 + min;
  };
  if (input.type !== "Izin Setengah Hari") {
    if (input.startTime || input.endTime) {
      throw new Bad("Jam izin hanya untuk pengajuan Izin Setengah Hari");
    }
    return { startTime: null, endTime: null };
  }
  const { startTime, endTime } = input;
  if (!startTime || !endTime) {
    throw new Bad("Isi jam mulai dan jam selesai izin");
  }
  if (input.endDate !== input.startDate) {
    throw new Bad("Izin setengah hari hanya untuk satu tanggal");
  }
  if (m(endTime) <= m(startTime)) {
    throw new Bad("Jam selesai izin harus setelah jam mulai");
  }
  if (m(startTime) <= m(shift.start) && m(endTime) >= m(shift.end)) {
    throw new Bad(
      `Izin itu menutup seluruh shift ${shift.start}–${shift.end}. Ajukan Izin Khusus untuk izin sehari`,
    );
  }
  return { startTime, endTime };
}

/**
 * Seluruh aturan yang berlaku atas satu rentang cuti — dipakai jalur BUAT dan
 * jalur EDIT.
 *
 * Disatukan bukan demi kerapian. Keduanya dulu menyalin blok yang sama persis,
 * dan itu membuat jalur edit menjadi pintu belakang: karyawan mengajukan tanggal
 * yang sah, lalu mengubahnya menjadi tanggal yang tidak akan pernah diterima
 * kalau diajukan langsung. Aturan yang hanya dijaga di satu pintu bukan aturan.
 */
async function validasiCuti(
  me: { id: number; workDays?: number[] | null },
  input: {
    type: string;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
  },
  shift: { start: string; end: string; toleranceMinutes: number },
) {
  if (input.endDate < input.startDate) {
    throw new Bad("Tanggal selesai lebih awal dari tanggal mulai");
  }

  /**
   * Batas mundur. Pesannya menyebut angkanya: orang yang melaporkan sakit tiga
   * hari lalu harus tahu yang salah adalah JARAKNYA, bukan tanggalnya, dan
   * sampai kapan ia masih boleh melapor.
   */
  const hariIni = todayWib();
  if (terlaluMundur(input.startDate, hariIni)) {
    throw new Bad(
      `Pengajuan mundur paling jauh ${MAKS_MUNDUR_HARI} hari. ` +
        `Untuk tanggal yang lebih lama, hubungi HR.`,
    );
  }

  /**
   * Hari libur DUA tahun kalau rentangnya melewati Tahun Baru. Satu set dari
   * tahun `startDate` saja membuat libur Januari luput pada rentang 28 Des–3 Jan,
   * dan `days` terhitung lebih banyak dari seharusnya — memotong saldo untuk hari
   * yang sebenarnya libur. Pola yang sama dipakai `laporanKehadiran()`.
   */
  const y1 = Number(input.startDate.slice(0, 4));
  const y2 = Number(input.endDate.slice(0, 4));
  const libur = new Set([
    ...(await holidaySet(y1)),
    ...(y2 !== y1 ? await holidaySet(y2) : []),
  ]);

  const days = workingDays(
    input.startDate,
    input.endDate,
    libur,
    me.workDays ?? undefined,
  );
  if (days < 1) throw new Bad("Rentang tanggal tidak memuat hari kerja");

  /**
   * Hari yang sudah diabsen tidak boleh ikut diklaim sebagai cuti.
   *
   * Konsekuensi langsung dari pengajuan mundur: sebelum ini rentang cuti selalu
   * di masa depan, jadi mustahil bertabrakan dengan absensi yang sudah ada.
   * Sekarang bisa — dan `statusHarianSql` memberi prioritas pada baris absensi,
   * sehingga harinya tetap terbaca 'hadir' SEMENTARA saldonya tetap terpotong.
   * Kuota hilang tanpa hari cuti yang didapat, tanpa ada yang tahu.
   *
   * `clock_in is not null`, bukan sekadar ada barisnya: baris berstatus
   * 'belum_absen' tanpa jam masuk hanya dibuat seed dan tidak membuktikan
   * orangnya bekerja.
   */
  if (input.startDate <= hariIni) {
    const bentrok = await db
      .select({ date: attendance.date })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, me.id),
          gte(attendance.date, input.startDate),
          lte(attendance.date, input.endDate),
          isNotNull(attendance.clockIn),
        ),
      )
      .orderBy(asc(attendance.date));
    if (bentrok.length) {
      const tgl = bentrok.map((b) => tanggalPendek(b.date)).join(", ");
      throw new Bad(
        `Sudah ada absensi pada ${tgl}. Keluarkan tanggal itu dari rentang cutinya.`,
      );
    }
  }

  const jamnya = jamIzin(input as never, shift);
  return { days, jamnya, year: y1 };
}

const create = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cuti"),
    type: z.enum([
      "Cuti Tahunan",
      "Cuti Sakit",
      "Izin Khusus",
      "Izin Setengah Hari",
    ]),
    startDate: z.string().refine(isIsoDate, "tanggal mulai harus YYYY-MM-DD"),
    endDate: z.string().refine(isIsoDate, "tanggal selesai harus YYYY-MM-DD"),
    reason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500),
    delegateId: z.coerce.number().int().positive().optional(),
    /** hanya Izin Setengah Hari; aturannya ditegakkan `jamIzin()` di bawah */
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "jam mulai harus HH:MM").optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "jam selesai harus HH:MM").optional(),
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
    // hari kerja divisinya, bukan Senin–Jumat untuk semua: cuti Sabtu di divisi
    // yang memang masuk hari Sabtu adalah satu hari cuti sungguhan
    const { days, jamnya, year } = await validasiCuti(
      me,
      input,
      resolveShift(me, cfg),
    );

    if (input.type === "Cuti Tahunan") {
      const [bal] = await leaveBalances(year, me.id);
      if (bal && days > bal.remaining) {
        throw new Bad(
          `Saldo cuti tinggal ${bal.remaining} hari, diminta ${days} hari`,
        );
      }
    }

    const [row] = await db
      .insert(leaveRequests)
      .values({
        employeeId: me.id,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        ...jamnya,
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
      context: {
        kind: "cuti",
        requestId: row.id,
        from: me.name,
        days,
        // izin berjam: yang perlu dibaca penyetujunya adalah jamnya, bukan
        // "1 hari kerja" yang secara teknis benar dan sama sekali tidak berguna
        ...(jamnya.startTime
          ? { jam: `${jam(jamnya.startTime)}–${jam(jamnya.endTime)}` }
          : {}),
      },
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
      minutes:
        sql<number>`coalesce(sum(${overtimeRequests.minutes}), 0)`.mapWith(
          Number,
        ),
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

  // "Hari libur" menurut jadwal divisinya: yang liburnya Jumat berhak atas tarif
  // hari libur pada hari Jumat, bukan pada hari Sabtu yang justru hari kerjanya
  const hariKerja = isHariKerja(
    input.date,
    await holidaySet(Number(input.date.slice(0, 4))),
    me.workDays ?? undefined,
  );
  const [row] = await db
    .insert(overtimeRequests)
    .values({
      employeeId: me.id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      minutes,
      kind: hariKerja ? "Hari kerja" : "Hari libur",
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
 * Edit a leave request that is still open — `menunggu` or `revisi`.
 *
 * Correcting a request HR has not looked at yet is the same operation as answering
 * a revision, so it is the same endpoint: a pending row stays `menunggu`, and a
 * returned one goes back to `menunggu` with the HR note cleared, which is what puts
 * it in front of an approver again.
 *
 * Only your own — the where clause is the authorization, so a
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
  type: z.enum([
    "Cuti Tahunan",
    "Cuti Sakit",
    "Izin Khusus",
    "Izin Setengah Hari",
  ]),
  startDate: z.string().refine(isIsoDate, "tanggal mulai harus YYYY-MM-DD"),
  endDate: z.string().refine(isIsoDate, "tanggal selesai harus YYYY-MM-DD"),
  reason: z.string().trim().min(5, "alasan minimal 5 karakter").max(500),
  delegateId: z.coerce.number().int().positive().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "jam mulai harus HH:MM").optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "jam selesai harus HH:MM").optional(),
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
        inArray(leaveRequests.status, ["menunggu", "revisi"]),
      ),
    )
    .limit(1);
  if (!current)
    throw new Bad("Pengajuan tidak ditemukan atau sudah diputuskan", 404);

  const { days, jamnya, year } = await validasiCuti(
    me,
    input,
    resolveShift(me, await config()),
  );

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
      throw new Bad(
        `Saldo cuti tinggal ${bal.remaining} hari, diminta ${days} hari`,
      );
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
      // ditulis apa adanya, termasuk null: jenis yang diubah dari izin berjam
      // menjadi cuti biasa harus ikut membuang jamnya
      ...jamnya,
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
    context: {
      kind: "cuti",
      requestId: input.id,
      from: me.name,
      days,
      revised: true,
    },
  });
  revalidatePath("/cuti");
  return Response.json({ ok: true, id: input.id, days });
});

const cancel = z.object({
  kind: z.enum(["cuti", "lembur"]),
  id: z.coerce.number().int().positive(),
});

/**
 * Only own requests, and only while still open. The where clause is the
 * authorization, so a guessed id from another employee simply matches nothing.
 *
 * Cuti yang sudah lolos admin (`menunggu_pimpinan`) MASIH boleh dibatalkan: itu
 * cuti miliknya sendiri, dan menariknya kembali tidak menghapus keputusan siapa
 * pun — beda dengan menyuntingnya, yang membuang persetujuan yang sudah diberikan
 * tanpa ada yang tahu (lihat PUT di atas, yang tetap dua status saja).
 *
 * `checked_*` ikut dikosongkan supaya pengajuan yang dibatalkan tidak menyimpan
 * jejak persetujuan untuk sesuatu yang tidak pernah berlaku.
 */
export const PATCH = withMe(async (me, req) => {
  const parsed = cancel.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new Bad("Permintaan tidak valid");
  const table = parsed.data.kind === "cuti" ? leaveRequests : overtimeRequests;

  const [row] = await db
    .update(table)
    .set({
      status: "dibatalkan",
      decisionNote: "Dibatalkan oleh karyawan",
      ...(parsed.data.kind === "cuti" ? { checkedById: null, checkedAt: null } : null),
    })
    .where(
      and(
        eq(table.id, parsed.data.id),
        eq(table.employeeId, me.id),
        inArray(
          table.status,
          parsed.data.kind === "cuti"
            ? ["menunggu", "revisi", "menunggu_pimpinan"]
            : ["menunggu", "revisi"],
        ),
      ),
    )
    .returning({ id: table.id });

  if (!row)
    throw new Bad("Pengajuan tidak ditemukan atau sudah diputuskan", 404);

  revalidatePath(parsed.data.kind === "cuti" ? "/cuti" : "/lembur");
  return Response.json({ ok: true });
});
