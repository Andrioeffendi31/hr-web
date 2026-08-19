-- Peran Pimpinan + persetujuan cuti dua tingkat.
--
-- Hand-written rather than `drizzle-kit push`, dengan alasan yang sama seperti
-- 0001: push bebas me-recreate tipe enum untuk menambah satu nilai, dan itu
-- menulis ulang setiap kolom yang memakainya (`employees.role`, dan untuk
-- request_status: `leave_requests.status` DAN `overtime_requests.status`) di bawah
-- lock. Empat pernyataan di bawah adalah seluruh deltanya dan tidak satu pun
-- menulis ulang tabel.
--
-- Jalankan SATU PER SATU, bukan dalam satu transaksi: Postgres menolak memakai
-- nilai enum baru di transaksi yang sama dengan yang menambahkannya.

-- 1. Peran penyetuju akhir. AFTER 'hr_admin' menjaga urutan enum SQL mengikuti
--    urutan wewenang, sama seperti urutan di TypeScript.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'pimpinan' AFTER 'hr_admin';

-- 2. Status antara: sudah lolos admin, menunggu Pimpinan. AFTER 'revisi' menjaga
--    urutan enum mengikuti alur hidup pengajuan, yang juga urutan render setiap
--    daftar status di aplikasi.
ALTER TYPE "request_status" ADD VALUE IF NOT EXISTS 'menunggu_pimpinan' AFTER 'revisi';

-- 3-4. Jejak keputusan TINGKAT PERTAMA. Kolom `decided_by_id`/`decided_at` yang
--      sudah ada tetap berarti keputusan AKHIR, jadi dua tingkat butuh dua jejak —
--      tanpa ini, persetujuan Pimpinan menimpa nama admin yang memeriksa lebih dulu.
--
--      Nullable, jadi ini perubahan katalog saja di PG 11+: instan, tanpa rewrite,
--      tanpa default untuk di-backfill. Hanya di leave_requests — lembur tetap satu
--      tingkat dan tidak diberi kolom yang tidak akan pernah dipakai.
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "checked_by_id" integer;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "checked_at" timestamptz;
