-- Alasan terlambat / pulang cepat, dan tinjauan admin atasnya.
--
-- Enam kolom nullable pada `attendance` — perubahan katalog saja: tidak satu pun
-- menulis ulang tabelnya, jadi ini aman dijalankan ke produksi yang sedang
-- berjalan sebelum kodenya menyusul. Hand-written like 0002–0010.
--
-- Yang PENTING dipahami sebelum membaca kodenya: pemutihan TIDAK menimpa
-- `attendance.status`. Barisnya tetap 'telat' selamanya; `review_ok = true`
-- hanya membuat statusHarianSql() membacanya sebagai 'hadir'. Statusnya memang
-- dihitung saat ditampilkan di aplikasi ini, jadi buktinya tidak perlu
-- dihancurkan untuk mengubah apa yang dilihat orang.

-- Alasan dari karyawan, diisi di titik absen. Wajib menurut server (bukan
-- menurut CHECK constraint: yang menentukan "terlambat" adalah shift divisi +
-- toleransi settings, yang tidak bisa dilihat dari satu baris ini).
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "late_reason" text;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "early_reason" text;

-- NULL = belum ditinjau · true = alasannya diterima (telat diputihkan)
-- false = ditinjau dan ditolak, tetap telat. Tiga keadaan, satu kolom.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "review_ok" boolean;

-- set null, bukan cascade: karyawan yang keluar tidak boleh membawa serta
-- keputusan yang pernah ia buat atas hari orang lain.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "reviewed_by_id" integer
  REFERENCES "employees"("id") ON DELETE SET NULL;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "review_note" text;
