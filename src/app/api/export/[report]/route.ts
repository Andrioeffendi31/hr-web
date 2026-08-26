import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  attendance,
  auditLog,
  employees,
  leaveRequests,
  overtimeRequests,
} from "@/db/schema";
import { ATT_LABEL, durasi, jam, todayWib } from "@/lib/hr";
import {
  mulaiCatat,
  dowSql,
  hariKerjaSql,
  rekapSql,
  statusHarianSql,
  type RekapBaris,
} from "@/lib/kehadiran";
import { holidaySet } from "@/lib/leave";
import { toCsv } from "@/lib/csv";
import { REQ_LABEL } from "@/components/bits";

const REPORTS = new Set([
  "kehadiran",
  "keterlambatan",
  "cuti",
  "lembur",
  "divisi",
  "karyawan",
]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ report: string }> },
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 403 });
  }

  const { report } = await ctx.params;
  if (!REPORTS.has(report)) {
    return Response.json({ error: "Laporan tidak dikenal" }, { status: 404 });
  }

  const url = new URL(req.url);
  const today = todayWib();
  const from = url.searchParams.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get("to") ?? today;
  const div = url.searchParams.get("div");
  const divWhere =
    div && div !== "all" ? eq(employees.division, div) : undefined;

  let headers: string[] = [];
  let rows: (string | number | null)[][] = [];
  let filename = `${report}-${from}-${to}.csv`;

  if (report === "kehadiran") {
    /**
     * Satu kueri untuk dua pemanggil: papan harian mengirim `?date=` (jadi
     * d1 = d2, satu hari), halaman laporan mengirim `?from=&to=` (sebulan).
     * Sebelumnya cabang ini hanya membaca `date`, jadi ekspor dari /laporan
     * selalu berisi hari ini saja betapa pun panjang periode yang dipilih.
     *
     * Bentuknya sama dengan `bulanKaryawan()` di lib/kehadiran.ts: hari yang
     * dijelajahi, bukan baris absensi yang ada — hari yang dibolos wajib muncul.
     *
     * ponytail: satu baris per karyawan per hari kerja (±22 × jumlah karyawan
     * sebulan). Kalau nanti ribuan karyawan, streaming CSV atau tabel ringkasan —
     * bukan sebelum itu.
     */
    const d1 = url.searchParams.get("date") ?? from;
    const d2 = url.searchParams.get("date") ?? to;
    filename = d1 === d2 ? `kehadiran-${d1}.csv` : `kehadiran-${d1}-${d2}.csv`;

    // dua tahun kalau rentangnya melewati Tahun Baru; satu set libur dari tahun
    // `dari` saja membuat Januari tampak penuh hari tanpa keterangan
    const y1 = Number(d1.slice(0, 4));
    const y2 = Number(d2.slice(0, 4));
    const libur = new Set([
      ...(await holidaySet(y1)),
      ...(y2 !== y1 ? await holidaySet(y2) : []),
    ]);
    const kerja = sql`hk.kerja`;
    // aturan yang sama dengan papan /kehadiran — CSV yang berbeda dari layar
    // yang mengekspornya lebih buruk daripada tidak ada CSV sama sekali
    const st = statusHarianSql(
      sql`hk.d`,
      today,
      libur,
      kerja,
      await mulaiCatat(),
    );

    const data = (
      await db.execute(sql`
        select hk.d::text as date,
          ${employees.nik} as nik,
          ${employees.name} as name,
          ${employees.division} as division,
          ${employees.position} as position,
          ${attendance.clockIn} as "clockIn",
          ${attendance.clockOut} as "clockOut",
          ${st} as status,
          ${attendance.location} as location
        from ${employees}
        cross join lateral (
          select d::date as d,
            ${hariKerjaSql(dowSql(sql`d`))}
              ${
                libur.size
                  ? sql`and d::date not in (${sql.join(
                      [...libur].map((t) => sql`${t}::date`),
                      sql`, `,
                    )})`
                  : sql``
              } as kerja
          from generate_series(${d1}::date, ${d2}::date, interval '1 day') d
        ) hk
        left join ${attendance}
          on ${attendance.employeeId} = ${employees.id} and ${attendance.date} = hk.d
        where ${and(eq(employees.active, true), divWhere)}
          -- hari libur hanya kalau ada absennya: lembur Sabtu tetap terlihat,
          -- Sabtu yang kosong tidak dituduh apa-apa
          and (hk.kerja or ${attendance.id} is not null)
          and hk.d <= ${today}::date
        order by hk.d asc, ${employees.name} asc
      `)
    ).rows as {
      date: string;
      nik: string;
      name: string;
      division: string | null;
      position: string | null;
      clockIn: string | null;
      clockOut: string | null;
      status: string;
      location: string | null;
    }[];

    headers = [
      "Tanggal",
      "NIK",
      "Nama",
      "Divisi",
      "Jabatan",
      "Masuk",
      "Keluar",
      "Status",
      "Lokasi",
    ];
    rows = data.map((r) => [
      r.date,
      r.nik,
      r.name,
      r.division,
      r.position,
      jam(r.clockIn),
      jam(r.clockOut),
      ATT_LABEL[r.status as keyof typeof ATT_LABEL],
      r.location ?? "",
    ]);
  }

  if (report === "keterlambatan") {
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        // `review_ok is not true` bukan `is false`: yang belum ditinjau masih
        // terhitung terlambat. Satu-satunya kueri di aplikasi ini yang membaca
        // kolom status mentah, jadi satu-satunya yang harus menyaring pemutihan
        // sendiri — statusHarianSql() sudah melakukannya untuk semua yang lain.
        telat:
          sql<number>`count(*) filter (where ${attendance.status} = 'telat' and ${attendance.reviewOk} is not true)`.mapWith(
            Number,
          ),
        hari: sql<number>`count(${attendance.id})`.mapWith(Number),
      })
      .from(employees)
      .leftJoin(
        attendance,
        and(
          eq(attendance.employeeId, employees.id),
          gte(attendance.date, from),
          lte(attendance.date, to),
        ),
      )
      .where(and(eq(employees.active, true), divWhere))
      .groupBy(employees.id, employees.nik, employees.name, employees.division)
      .orderBy(asc(employees.name));

    headers = ["NIK", "Nama", "Divisi", "Jumlah terlambat", "Hari tercatat"];
    rows = data.map((r) => [r.nik, r.name, r.division, r.telat, r.hari]);
  }

  if (report === "cuti") {
    const delegate = alias(employees, "delegate");
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        startTime: leaveRequests.startTime,
        endTime: leaveRequests.endTime,
        days: leaveRequests.days,
        status: leaveRequests.status,
        reason: leaveRequests.reason,
        delegateName: delegate.name,
      })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .leftJoin(delegate, eq(delegate.id, leaveRequests.delegateId))
      .where(
        and(
          gte(leaveRequests.startDate, from),
          lte(leaveRequests.startDate, to),
          divWhere,
        ),
      )
      .orderBy(asc(leaveRequests.startDate));

    headers = [
      "NIK",
      "Nama",
      "Divisi",
      "Jenis",
      "Mulai",
      "Selesai",
      // kolomnya sendiri, bukan disisipkan ke "Jenis": kolom yang isinya
      // kadang tanggal kadang jam adalah kolom yang tidak bisa disortir
      "Jam izin",
      "Hari kerja",
      "Status",
      "Pengganti",
      "Alasan",
    ];
    rows = data.map((r) => [
      r.nik,
      r.name,
      r.division,
      r.type,
      r.startDate,
      r.endDate,
      r.startTime && r.endTime ? `${jam(r.startTime)}-${jam(r.endTime)}` : "",
      r.days,
      REQ_LABEL[r.status],
      r.delegateName ?? "",
      r.reason,
    ]);
  }

  if (report === "lembur") {
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        division: employees.division,
        date: overtimeRequests.date,
        startTime: overtimeRequests.startTime,
        endTime: overtimeRequests.endTime,
        minutes: overtimeRequests.minutes,
        kind: overtimeRequests.kind,
        status: overtimeRequests.status,
      })
      .from(overtimeRequests)
      .innerJoin(employees, eq(employees.id, overtimeRequests.employeeId))
      .where(
        and(
          gte(overtimeRequests.date, from),
          lte(overtimeRequests.date, to),
          divWhere,
        ),
      )
      .orderBy(asc(overtimeRequests.date));

    headers = [
      "NIK",
      "Nama",
      "Divisi",
      "Tanggal",
      "Mulai",
      "Selesai",
      "Durasi",
      "Tipe",
      "Status",
    ];
    rows = data.map((r) => [
      r.nik,
      r.name,
      r.division,
      r.date,
      jam(r.startTime),
      jam(r.endTime),
      durasi(r.minutes),
      r.kind,
      REQ_LABEL[r.status],
    ]);
  }

  if (report === "divisi") {
    const hariIni = todayWib();
    const data = (
      await db.execute(
        rekapSql({
          sejak: await mulaiCatat(),
          dari: from,
          sampai: to < hariIni ? to : hariIni,
          hariIni,
          libur: await holidaySet(Number(from.slice(0, 4))),
          pilih: sql`${employees.division} as division`,
          groupBy: sql`${employees.division}`,
          where: eq(employees.active, true),
          orderBy: sql`${employees.division} asc`,
        }),
      )
    ).rows as (RekapBaris & { division: string | null })[];

    headers = [
      "Divisi",
      "Hadir",
      "Terlambat",
      "Cuti/izin/sakit",
      "Tanpa keterangan",
      "Tingkat kehadiran (%)",
    ];
    rows = data.map((r) => [
      r.division ?? "Tanpa divisi",
      r.hadir,
      r.telat,
      r.cuti,
      r.alpa,
      r.hari ? Math.round(((r.hadir + r.telat) / r.hari) * 100) : 0,
    ]);
  }

  if (report === "karyawan") {
    const manager = alias(employees, "manager");
    const data = await db
      .select({
        nik: employees.nik,
        name: employees.name,
        email: employees.email,
        division: employees.division,
        position: employees.position,
        contractType: employees.contractType,
        joinedAt: employees.joinedAt,
        workLocation: employees.workLocation,
        managerName: manager.name,
        active: employees.active,
      })
      .from(employees)
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(divWhere)
      .orderBy(asc(employees.name));

    headers = [
      "NIK",
      "Nama",
      "Email",
      "Divisi",
      "Jabatan",
      "Tipe kontrak",
      "Mulai kerja",
      "Lokasi kerja",
      "Atasan langsung",
      "Status",
    ];
    rows = data.map((r) => [
      r.nik,
      r.name,
      r.email,
      r.division,
      r.position,
      r.contractType,
      r.joinedAt,
      r.workLocation,
      r.managerName ?? "",
      r.active ? "Aktif" : "Tidak aktif",
    ]);
  }

  await db.insert(auditLog).values({
    actorId: Number(admin.id),
    action: "report.export",
    entity: report,
    detail: `${rows.length} baris · ${filename}`,
  });

  return new Response(toCsv(headers, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
