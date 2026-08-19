-- Sejak kapan aplikasi ini mencatat kehadiran.
--
-- Tanpa batas ini, sistem yang baru dipasang — atau yang datanya baru
-- dikosongkan — melaporkan SELURUH karyawan sebagai "tanpa keterangan" untuk
-- setiap hari kerja di masa lalu, dan rekap bulan-bulan sebelumnya membaca 0%
-- kehadiran. Keduanya bukan fakta tentang orangnya, melainkan tentang
-- aplikasinya yang belum ada di sana.
--
-- Hand-written like 0002–0008: production DDL runs one statement at a time
-- against the DIRECT endpoint, reviewed, not diffed by a tool. Idempotent.

-- NULL = tanpa batas, dan itu nilai yang benar untuk pemasangan yang memang
-- mencatat sejak hari pertama. Sengaja TIDAK diberi default: memilih tanggalnya
-- adalah keputusan HR, bukan keputusan migrasi.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "tracking_since" date;
