import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { employees, leaveRequests, settings } from "@/db/schema";
import {
  PERUSAHAAN,
  isoWib,
  jam,
  rentangResmi,
  tanggalResmi,
} from "@/lib/hr";
import { idDariToken, nomorSurat, tokenSurat } from "@/lib/surat";
import { suratPdf } from "@/lib/surat-pdf";
import { safeName } from "@/lib/r2";
import { baseUrl } from "@/lib/url";

/**
 * Surat izin/cuti sebagai PDF — publik, diotorisasi oleh token di path-nya.
 *
 * Tanpa sesi, dan itu memang syaratnya: aplikasi ponsel memegang sesinya sebagai
 * header di SecureStore, bukan sebagai cookie browser, jadi URL yang butuh
 * cookie akan menjawab 401 begitu diserahkan ke pembaca PDF Android. Tokennya
 * (HMAC 128 bit, lib/surat.ts) yang menggantikan sesi — dan token yang sama
 * itulah yang dikodekan di QR pada suratnya.
 *
 * Konsekuensinya jujur: siapa pun yang memegang tautan atau kertasnya bisa
 * membuka PDF-nya. Sama seperti signed URL yang sudah dipakai lampiran, hanya
 * tanpa batas waktu — dan tokennya hanya bisa didapat dari dalam aplikasi, oleh
 * pemilik pengajuan atau admin.
 */

/** Judul per jenis. `Record` supaya jenis cuti baru GAGAL KOMPILASI di sini,
 *  bukan diam-diam mencetak surat tanpa judul. */
const JUDUL: Record<
  "Cuti Tahunan" | "Cuti Sakit" | "Izin Khusus" | "Izin Setengah Hari",
  string
> = {
  "Cuti Tahunan": "SURAT IZIN CUTI TAHUNAN",
  "Cuti Sakit": "SURAT IZIN SAKIT",
  "Izin Khusus": "SURAT IZIN KHUSUS",
  "Izin Setengah Hari": "SURAT IZIN SETENGAH HARI",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const id = idDariToken(token);
  // token ngawur dan pengajuan yang tidak ada dijawab sama: 404, tanpa memberi
  // tahu penebak bahwa ia sedang menebak sesuatu yang ada
  if (!id) return new Response("Tidak ditemukan", { status: 404 });

  const pemeriksa = alias(employees, "pemeriksa");
  const penyetuju = alias(employees, "penyetuju");
  const delegate = alias(employees, "delegate");

  const [row] = await db
    .select({
      id: leaveRequests.id,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      startTime: leaveRequests.startTime,
      endTime: leaveRequests.endTime,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      decisionNote: leaveRequests.decisionNote,
      decidedAt: leaveRequests.decidedAt,
      createdAt: leaveRequests.createdAt,
      nama: employees.name,
      nik: employees.nik,
      jabatan: employees.position,
      divisi: employees.division,
      pemeriksa: pemeriksa.name,
      penyetuju: penyetuju.name,
      pengganti: delegate.name,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    // decided_by_id dan checked_by_id bukan foreign key (lihat schema.ts), jadi
    // namanya harus dijoin manual — dan left, karena tingkat yang belum diputus
    // memang belum punya penandatangan
    .leftJoin(pemeriksa, eq(pemeriksa.id, leaveRequests.checkedById))
    .leftJoin(penyetuju, eq(penyetuju.id, leaveRequests.decidedById))
    .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
    .where(eq(leaveRequests.id, id))
    .limit(1);
  if (!row) return new Response("Tidak ditemukan", { status: 404 });

  const [cfg] = await db
    .select({ companyName: settings.companyName })
    .from(settings)
    .limit(1);

  const setengahHari = Boolean(row.startTime && row.endTime);
  const rincian: [string, string][] = [
    ["Jenis", row.type],
    [
      "Tanggal",
      setengahHari
        ? tanggalResmi(row.startDate)
        : rentangResmi(row.startDate, row.endDate),
    ],
  ];
  if (setengahHari) {
    rincian.push(["Jam izin", `${jam(row.startTime)}–${jam(row.endTime)}`]);
  } else {
    rincian.push(["Lama", `${row.days} hari kerja`]);
  }
  if (row.pengganti) rincian.push(["Pengganti tugas", row.pengganti]);
  if (row.decisionNote) rincian.push(["Catatan HR", row.decisionNote]);

  // tanggal surat = tanggal keputusan; yang belum diputus memakai tanggal
  // pengajuannya, bukan hari ini — kalau tidak, nomor dan tanggalnya berubah
  // setiap kali diunduh ulang
  const tanggalSurat = isoWib(row.decidedAt ?? row.createdAt);

  const pdf = await suratPdf({
    nomor: nomorSurat(row.id, tanggalSurat),
    perusahaan: cfg?.companyName ?? PERUSAHAAN,
    status: row.status,
    judul: JUDUL[row.type],
    nama: row.nama,
    nik: row.nik,
    jabatan: row.jabatan,
    divisi: row.divisi,
    rincian,
    alasan: row.reason,
    tempatTanggal: tanggalResmi(tanggalSurat),
    pemeriksa: row.pemeriksa,
    penyetuju: row.penyetuju,
    urlVerifikasi: `${baseUrl()}/verifikasi/${tokenSurat(row.id)}`,
  });

  const berkas = safeName(
    `Surat-Izin-${String(row.id).padStart(3, "0")}-${row.nama}.pdf`,
  );
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${berkas}"`,
      // isinya data pribadi seseorang, dan statusnya bisa berubah kapan saja
      "cache-control": "private, no-store",
    },
  });
}
