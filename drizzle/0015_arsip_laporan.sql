-- Arsip laporan bulanan: penanda admin-only dan periodenya.
--
-- Dua kolom, keduanya perubahan katalog saja — tidak menulis ulang tabelnya,
-- jadi aman dijalankan ke produksi yang sedang berjalan sebelum kodenya
-- menyusul. Ditulis tangan seperti 0002–0014.
--
-- `admin_only` DEFAULT false: satu-satunya arti yang aman untuk baris yang sudah
-- ada. Kolom ini adalah gerbang keamanan, dan gerbang keamanan yang menebak akan
-- menebak salah pada baris yang paling tidak diperhatikan.
--
-- Sebelum kolom ini, "berkas perusahaan" berarti `owner_id is null`, dan itu
-- dibaca sebagai "boleh dilihat semua orang" oleh /api/me/documents maupun
-- /api/files/[...key]. Arsip laporan memuat data seluruh karyawan.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "admin_only" boolean NOT NULL DEFAULT false;

-- `periode` (YYYY-MM) null untuk berkas biasa. Dipakai panel Arsip Bulanan dan
-- oleh gerbang di db/purge.ts yang menolak menghapus data mentah suatu bulan
-- kalau arsip bulan itu tidak ada.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "periode" text;
