-- Izin setengah hari: satu tanggal, dua jam.
--
-- Hand-written rather than `drizzle-kit push`, dengan alasan yang sama seperti
-- 0001 dan 0010: push bebas me-recreate tipe enum untuk menambah satu nilai, dan
-- untuk `leave_type` itu berarti menulis ulang `leave_requests.type` di bawah
-- lock. Tiga pernyataan di bawah adalah seluruh deltanya dan tidak satu pun
-- menulis ulang tabel.
--
-- Jalankan SATU PER SATU, bukan dalam satu transaksi: Postgres menolak memakai
-- nilai enum baru di transaksi yang sama dengan yang menambahkannya.

-- 1. Jenis baru. AFTER 'Izin Khusus' menjaga urutan enum SQL mengikuti urutan
--    render pilihan di ponsel: cuti dulu, izin sesudahnya, yang paling ringan
--    terakhir.
ALTER TYPE "leave_type" ADD VALUE IF NOT EXISTS 'Izin Setengah Hari' AFTER 'Izin Khusus';

-- 2. Jam izinnya. Nullable karena hanya jenis di atas yang memakainya — dan itu
--    juga yang membedakan izin berjam dari izin sehari tanpa kolom penanda
--    tersendiri. Tipe `time`, sama seperti `overtime_requests.start_time` dan
--    `divisions.shift_start`, jadi jamnya dibandingkan di SQL tanpa cast.
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "start_time" time;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "end_time" time;
