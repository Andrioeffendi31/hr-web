/**
 * Tambahkan karyawan yang ada di `karyawan-data.ts` tapi belum ada di database.
 *
 * Pendamping `import-karyawan.ts`, dan kebalikannya dalam hal risiko: importer
 * meng-TRUNCATE lalu menulis ulang semuanya — berguna untuk memasang dari nol,
 * mematikan untuk database yang sudah dipakai, karena ia menghapus kehadiran dan
 * mengembalikan setiap sandi ke sandi impor bersama. Skrip ini hanya **menambah**:
 * tidak pernah UPDATE, tidak pernah DELETE.
 *
 * Dicocokkan lewat email (kolomnya unique), jadi menjalankannya dua kali tidak
 * membuat baris kembar. NIK diambil dari nomor NIS tertinggi yang ada + 1, bukan
 * dari indeks array — di database yang sudah hidup, indeks array tidak tahu apa-apa
 * tentang nomor mana yang sudah terpakai.
 *
 * KERING SECARA BAWAAN: tanpa `--tulis` ia hanya melaporkan.
 *
 *   npm run db:sync                                    # lihat semua yang belum ada
 *   npm run db:sync -- --email=a@b.com --tulis         # tambah satu orang saja
 *   npm run db:sync:neon -- --email=a@b.com --tulis
 *
 * `--email` penting untuk database yang isinya bukan dataset produksi (mis. data
 * seed di mesin pengembang): tanpa penyaring, "semua yang belum ada" berarti
 * seluruh daftar — dua puluh delapan orang yang tidak semestinya ada di sana.
 */
import bcrypt from "bcryptjs";
import { inArray } from "drizzle-orm";
import { db } from "./index";
import { employees } from "./schema";
import { KARYAWAN } from "./karyawan-data";

const TULIS = process.argv.includes("--tulis");
/** Batasi ke email tertentu; kosong = pertimbangkan seluruh daftar. */
const HANYA = new Set(
  process.argv
    .filter((a) => a.startsWith("--email="))
    .flatMap((a) => a.slice("--email=".length).split(","))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Sandi awal bersama, sama seperti importer — dan sama-sama sekali pakai: setiap
 *  baris ditandai `mustChangePassword`, jadi ia mati begitu orangnya login. */
const PASSWORD = process.env.IMPORT_PASSWORD ?? "nanum2026";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diisi");
  const host = new URL(url).host;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Target : ${host}${host.includes("neon.tech") ? "  ← PRODUKSI" : "  (lokal)"}`);
  console.log(`  Mode   : ${TULIS ? "MENULIS" : "jalan kering"}`);
  console.log("=".repeat(60));

  const daftar = HANYA.size
    ? KARYAWAN.filter((k) => HANYA.has(k.email.toLowerCase()))
    : KARYAWAN;
  if (HANYA.size) {
    console.log(`  Filter : ${[...HANYA].join(", ")}`);
    const asing = [...HANYA].filter(
      (e) => !KARYAWAN.some((k) => k.email.toLowerCase() === e),
    );
    if (asing.length) {
      throw new Error(
        `Email ini tidak ada di karyawan-data.ts: ${asing.join(", ")}. ` +
          "Tambahkan dulu di sana supaya db:import bisa membuatnya ulang kelak.",
      );
    }
  }

  const email = daftar.map((k) => k.email.toLowerCase());
  const ada = new Set(
    (
      await db
        .select({ email: employees.email })
        .from(employees)
        .where(inArray(employees.email, email))
    ).map((r) => r.email.toLowerCase()),
  );

  const kurang = daftar.filter((k) => !ada.has(k.email.toLowerCase()));
  if (kurang.length === 0) {
    console.log("\nTidak ada yang perlu ditambahkan — semuanya sudah ada.\n");
    return;
  }

  // nomor NIS tertinggi yang sudah terpakai; format lain (mis. sisa uji smoke)
  // diabaikan supaya tidak ikut menentukan nomor berikutnya
  const semua = await db.select({ nik: employees.nik }).from(employees);
  const tertinggi = semua
    .map((r) => /^NIS-(\d{4})$/.exec(r.nik)?.[1])
    .filter((x): x is string => Boolean(x))
    .reduce((a, b) => Math.max(a, Number(b)), 0);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const baris = kurang.map((k, i) => ({
    nik: `NIS-${String(tertinggi + 1 + i).padStart(4, "0")}`,
    name: k.name,
    email: k.email.toLowerCase(),
    passwordHash,
    mustChangePassword: true,
    role: k.role,
    position: k.position ?? null,
    birthPlace: k.birthPlace,
    birthDate: k.birthDate,
    address: k.address,
    gender: k.gender,
    religion: k.religion,
    phone: k.phone,
    emergencyName: k.emergencyName,
    emergencyPhone: k.emergencyPhone,
  }));

  console.log("\nAkan ditambahkan:");
  for (const b of baris) {
    console.log(`  ${b.nik}  ${b.name.padEnd(22)} ${b.email.padEnd(30)} ${b.role}  ${b.position ?? "—"}`);
  }

  if (!TULIS) {
    console.log("\nJalan kering selesai. Tambahkan --tulis untuk menyimpan.\n");
    return;
  }

  const hasil = await db
    .insert(employees)
    .values(baris)
    .returning({ id: employees.id, nik: employees.nik, email: employees.email });
  console.log(`\n${hasil.length} baris tersimpan:`);
  for (const r of hasil) console.log(`  #${r.id}  ${r.nik}  ${r.email}`);
  console.log(
    `\nSandi awal: ${PASSWORD} — wajib diganti saat login pertama, dan mati setelahnya.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\n${(e as Error).message}\n`);
    process.exit(1);
  });
