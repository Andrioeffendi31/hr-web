-- Foto banner untuk pengumuman.
--
-- Satu kolom nullable — perubahan katalog saja, tidak menulis ulang tabelnya,
-- jadi aman dijalankan ke produksi yang sedang berjalan sebelum kodenya
-- menyusul. Ditulis tangan seperti 0002–0013.
--
-- Isinya KUNCI OBJEK R2, bukan URL, mengikuti setiap kolom berkas lain di skema
-- ini (documents.url, employees.photo_url, settings.company_logo_url). Bucketnya
-- privat; yang menyajikannya kembali adalah /api/files/[...key].
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "banner_key" text;
