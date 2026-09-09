import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  auditLog,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { type Role } from "@/lib/access";
import { queueEmail, type Template } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { deleteObject } from "@/lib/r2";

const body = z
  .object({
    kind: z.enum(["cuti", "lembur"]),
    id: z.coerce.number().int().positive(),
    action: z.enum(["disetujui", "ditolak", "revisi", "dibatalkan"]),
    note: z.string().max(500).optional(),
  })
  /**
   * Alasan WAJIB untuk pembatalan, dan ditegakkan di sini — bukan hanya di
   * dialognya.
   *
   * Cuti yang dibatalkan adalah satu-satunya keputusan di rute ini yang mencabut
   * sesuatu yang sudah berlaku: orangnya mungkin sudah menandai kalender dan
   * memberi tahu keluarganya. Kalimat yang ia terima berasal dari kolom ini, dan
   * "dibatalkan" tanpa sebab hanya menimbulkan pertanyaan alih-alih menjawabnya.
   *
   * Dialog yang mewajibkan sementara server menerima bukan aturan, hanya
   * kebiasaan — dan kebiasaan tidak bertahan melewati pemanggil berikutnya.
   */
  .refine((v) => v.action !== "dibatalkan" || (v.note?.trim().length ?? 0) >= 3, {
    message: "Alasan pembatalan wajib diisi",
    path: ["note"],
  });

/** Status yang boleh dijadikan titik awal keputusan, dan hasilnya. */
type Status =
  | "menunggu"
  | "revisi"
  | "menunggu_pimpinan"
  | "disetujui"
  | "ditolak"
  | "dibatalkan";

/**
 * Persetujuan cuti dua tingkat, lembur satu tingkat.
 *
 * Cuti menuntut dua tanda tangan: satu admin, lalu Pimpinan. Pimpinan boleh
 * menutup keduanya sekali ketuk — tapi admin **tidak pernah** bisa menutup tingkat
 * kedua, dan itulah yang membuat "wajib" berarti wajib.
 *
 * Tabel transisinya ditulis sebagai data, bukan sebagai rantai `if`: aturan
 * persetujuan adalah hal yang paling sering ditanyakan ulang dan paling mahal kalau
 * salah, jadi ia harus bisa dibaca sekali pandang.
 */
function tujuan(
  kind: "cuti" | "lembur",
  dari: Status,
  action: "disetujui" | "ditolak" | "revisi" | "dibatalkan",
  role: Role,
): Status | null {
  const pimpinan = role === "pimpinan";

  // Lembur: satu tingkat, kedua peran boleh, hanya dari `menunggu`.
  if (kind === "lembur") {
    if (dari !== "menunggu") return null;
    return action === "revisi" || action === "dibatalkan" ? null : action;
  }

  /**
   * Pembatalan cuti oleh admin/Pimpinan — satu-satunya jalan mundur di tabel ini.
   *
   * Sah juga dari `disetujui`, dan itu memang pengecualian terhadap aturan di
   * atasnya: admin tidak pernah bisa MENUTUP tingkat kedua, tapi dengan aksi ini
   * ia bisa mencabut cuti yang sudah ditutup Pimpinan. Sengaja, atas permintaan —
   * dan disebut di sini supaya pembaca berikutnya tidak mengira ini kelalaian.
   * Yang menahannya bukan peran, melainkan alasan yang wajib ditulis dan jejak
   * audit yang menyebut siapa mencabut keputusan siapa.
   *
   * Tidak sah dari `ditolak` dan `dibatalkan`: tidak ada yang bisa dicabut dua
   * kali, dan pengajuan yang tidak pernah berlaku tidak perlu dibatalkan.
   */
  if (action === "dibatalkan") {
    return dari === "ditolak" || dari === "dibatalkan" ? null : "dibatalkan";
  }

  // Penolakan menutup pengajuan di tingkat mana pun ia berada.
  if (action === "ditolak") {
    return dari === "menunggu" || dari === "menunggu_pimpinan" ? "ditolak" : null;
  }
  // "Minta revisi" hanya masuk akal sebelum ada tanda tangan sama sekali.
  if (action === "revisi") return dari === "menunggu" ? "revisi" : null;

  // Persetujuan cuti.
  if (dari === "menunggu") {
    // Pimpinan menutup dua tingkat sekaligus; admin baru tingkat pertama.
    return pimpinan ? "disetujui" : "menunggu_pimpinan";
  }
  if (dari === "menunggu_pimpinan") {
    // Bukan giliran admin — dan bukan sekadar "sudah diputus": inilah gerbang
    // yang menjaga tingkat kedua tetap milik Pimpinan.
    return pimpinan ? "disetujui" : null;
  }
  return null;
}

/** Pimpinan yang aktif — penerima pemberitahuan tingkat kedua. Kosong berarti
 *  tidak ada yang bisa menuntaskan cuti, dan itu keadaan yang layak terlihat di
 *  log ketimbang gagal diam-diam. */
async function penerimaPimpinan() {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.role, "pimpinan"), eq(employees.active, true)));
  if (rows.length === 0) console.warn("[requests] tidak ada Pimpinan aktif");
  return rows.map((r) => r.id);
}

/** Approve / reject a leave or overtime request. Authorization is re-checked
 *  here, not assumed from the UI (PRD §7). */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    // pesan zod-nya, bukan "Permintaan tidak valid": aturan seperti alasan
    // pembatalan yang wajib harus terbaca oleh yang menekan tombolnya
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }
  const { kind, id, action, note } = parsed.data;
  const table = kind === "cuti" ? leaveRequests : overtimeRequests;
  const aktor = Number(admin.id);

  const [sekarang] = await db
    .select({ status: table.status, employeeId: table.employeeId })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!sekarang) {
    return Response.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 });
  }

  const status = tujuan(kind, sekarang.status, action, admin.role);
  if (!status) {
    // 409, bukan 403: pemanggilnya berwenang, keadaan pengajuannya yang tidak
    // mengizinkan — dan pesannya menyebut sebabnya, karena "gagal" tanpa alasan
    // membuat orang menekan tombolnya lagi.
    return Response.json(
      {
        error:
          sekarang.status === "menunggu_pimpinan" && admin.role !== "pimpinan"
            ? "Pengajuan ini menunggu persetujuan Pimpinan"
            : `Pengajuan sudah berstatus "${sekarang.status}" dan tidak bisa diputus lagi`,
        status: sekarang.status,
      },
      { status: 409 },
    );
  }

  /** Tingkat pertama cuti: yang disimpan jejak pemeriksanya, bukan keputusan akhir. */
  const tingkatSatu = kind === "cuti" && status === "menunggu_pimpinan";
  /**
   * Pembatalan TIDAK menimpa `decided_*` maupun `checked_*`.
   *
   * Jalur karyawan (PATCH /api/me/requests) mengosongkan `checked_*` supaya
   * pengajuan yang dibatalkan tidak menyimpan jejak persetujuan untuk sesuatu
   * yang tidak pernah berlaku. Itu benar di sana, karena di sana pembatalan
   * hanya mungkin sebelum disetujui.
   *
   * Di sini cuti yang dibatalkan BISA berstatus `disetujui` — ia pernah berlaku,
   * dan siapa yang menyetujuinya justru fakta yang paling perlu bertahan sesudah
   * dicabut. Menimpanya dengan id pembatal akan menghapus satu-satunya bukti
   * bahwa persetujuan itu pernah diberikan, tepat pada baris yang paling mungkin
   * dipertanyakan kemudian. Pembatalnya dicatat di `decisionNote` dan audit_log.
   */
  const batal = action === "dibatalkan";
  /** Pimpinan menutup dua tingkat sekaligus dari `menunggu`. */
  const sekaligus =
    kind === "cuti" && status === "disetujui" && sekarang.status === "menunggu";

  /**
   * Penjaganya ada di `where`, bukan hanya di `if` di atas.
   *
   * Dua penyetuju yang menekan pada detik yang sama akan sama-sama lolos
   * pemeriksaan di atas; yang membuat hanya satu di antaranya menang adalah baris
   * ini. Yang kalah mendapat 409, bukan menimpa keputusan yang sudah tercatat.
   */
  const [updated] = await db
    .update(table)
    .set({
      status,
      decisionNote: batal ? `Dibatalkan HR: ${note!.trim()}` : (note ?? null),
      // tingkat pertama belum keputusan akhir: kolom akhir dibiarkan kosong
      ...(batal
        ? null
        : tingkatSatu
          ? { checkedById: aktor, checkedAt: new Date() }
          : { decidedById: aktor, decidedAt: new Date() }),
      // Pimpinan yang memutus sendirian menandatangani kedua tingkat, dan
      // catatannya menyebut orang yang sama dua kali — bukan mengarang admin
      ...(sekaligus ? { checkedById: aktor, checkedAt: new Date() } : null),
    })
    .where(and(eq(table.id, id), eq(table.status, sekarang.status)))
    .returning({ id: table.id, employeeId: table.employeeId });

  if (!updated) {
    return Response.json(
      { error: "Pengajuan baru saja diputus orang lain, muat ulang halaman" },
      { status: 409 },
    );
  }

  await db.insert(auditLog).values({
    actorId: aktor,
    // dibedakan per tingkat, supaya jejaknya terbaca tanpa menebak siapa menutup apa
    action: tingkatSatu ? `${kind}.diperiksa` : `${kind}.${action}`,
    entity: kind === "cuti" ? "leave_requests" : "overtime_requests",
    entityId: id,
    detail: [
      note ?? null,
      sekaligus ? "disetujui Pimpinan langsung (dua tingkat)" : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
  });

  const label = kind === "cuti" ? "cuti" : "lembur";

  if (tingkatSatu) {
    // Pimpinan yang tidak diberi tahu adalah tingkat kedua yang tidak pernah tahu
    // ada yang menunggunya.
    await queueEmail({
      to: await penerimaPimpinan(),
      template: "request_perlu_pimpinan",
      context: { kind, requestId: id, note },
    });
    await sendPush({
      to: updated.employeeId,
      title: `Pengajuan ${label} disetujui admin`,
      body: "Menunggu persetujuan Pimpinan.",
      route: "/pengajuan",
    });
  } else {
    /** Pemetaan eksplisit, bukan `request_${action}`: interpolasi string akan
     *  menghasilkan nama template yang tidak ada begitu ada aksi atau status baru,
     *  dan TypeScript melebur template literal menjadi `string` tanpa mengeluh. */
    const template: Template =
      action === "disetujui"
        ? "request_disetujui"
        : action === "ditolak"
          ? "request_ditolak"
          : action === "dibatalkan"
            ? "request_dibatalkan"
            : "request_revision";
    await queueEmail({
      to: updated.employeeId,
      template,
      context: { kind, requestId: id, note },
    });

    // and to the phone, which is where the employee actually is (PRD-Mobile §6.6).
    // Deliberately after the DB write and never awaited for success: a decision is
    // recorded whether or not a notification lands.
    await sendPush({
      to: updated.employeeId,
      title:
        action === "disetujui"
          ? `Pengajuan ${label} disetujui`
          : action === "ditolak"
            ? `Pengajuan ${label} ditolak`
            : action === "dibatalkan"
              ? `Pengajuan ${label} dibatalkan`
              : `Pengajuan ${label} perlu direvisi`,
      body: note?.trim() || `Buka Riwayat Pengajuan untuk detailnya.`,
      route: "/pengajuan",
    });
  }

  revalidatePath(kind === "cuti" ? "/cuti" : "/lembur");
  revalidatePath("/kehadiran");

  return Response.json({ ok: true, status });
}

/**
 * Hapus permanen satu pengajuan cuti.
 *
 * Berbeda dari `dibatalkan` di atas, dan bedanya bukan derajat: membatalkan
 * menyisakan baris yang bisa dibaca karyawannya beserta alasannya, sedangkan
 * menghapus tidak menyisakan apa pun untuk dibaca siapa pun. Karena itu yang
 * menahannya bukan alasan wajib — tidak ada yang akan membacanya — melainkan
 * dialog konfirmasi di layar, dan nisan di `audit_log` yang harus lengkap
 * sendiri.
 *
 * Menghapus pengajuan yang berstatus `disetujui` mengembalikan saldo cutinya dan
 * membalikkan status hariannya, persis seperti membatalkan: `leaveBalances()`
 * dan `cutiPadaTanggal()` sama-sama hanya melihat baris `disetujui`, dan baris
 * yang hilang tidak lagi terlihat oleh keduanya.
 *
 * Hanya cuti. Lembur tidak diminta, dan menambahkannya diam-diam berarti
 * memberi wewenang yang tidak pernah diputuskan siapa pun.
 */
const hapus = z.object({
  kind: z.literal("cuti"),
  id: z.coerce.number().int().positive(),
});

export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const parsed = hapus.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 },
    );
  }

  /**
   * Potret + kunci lampiran dibaca SEBELUM barisnya hilang.
   *
   * Kunci objek R2 hanya hidup di kolom ini; lib/r2.ts tidak punya fungsi list
   * dan tidak akan pernah punya. Menghapus barisnya lebih dulu berarti tidak ada
   * lagi apa pun yang bisa menyebutkan kuncinya, dan lampirannya yatim selamanya
   * di bucket. Pelajaran yang sama sudah ditulis di db/purge.ts dan dipakai lagi
   * di DELETE /api/attendance.
   */
  const [row] = await db
    .select({
      id: leaveRequests.id,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      status: leaveRequests.status,
      attachmentKey: leaveRequests.attachmentKey,
      name: employees.name,
      nik: employees.nik,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(eq(leaveRequests.id, parsed.data.id))
    .limit(1);

  if (!row) {
    return Response.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 });
  }

  await db.delete(leaveRequests).where(eq(leaveRequests.id, row.id));

  /**
   * Objek R2 sesudah barisnya, dan kegagalannya diabaikan: penghapusannya sudah
   * terjadi dan tidak bisa diurungkan, jadi objek yang tertinggal tidak boleh
   * membuat aksi yang BERHASIL terlihat gagal — itu hanya mengundang admin
   * menekannya lagi untuk baris yang sudah tidak ada.
   */
  if (row.attachmentKey) await deleteObject(row.attachmentKey).catch(() => undefined);

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "cuti.dihapus",
    entity: "leave_requests",
    entityId: row.id,
    // lengkap sendiri: tidak ada alasan yang diketik, jadi potret inilah
    // satu-satunya yang tersisa untuk menjawab "apa yang hilang"
    detail:
      `${row.name} (${row.nik}) · ${row.type} · ${row.startDate} s/d ${row.endDate} · ` +
      `${row.days} hari · status ${row.status}` +
      (row.attachmentKey ? " · lampiran ikut dihapus" : ""),
  });

  revalidatePath("/cuti");
  revalidatePath("/kehadiran");
  return Response.json({ ok: true });
}
