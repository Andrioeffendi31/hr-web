-- Alasan absen KELUAR dari luar radius kantor.
--
-- Satu kolom nullable pada `attendance` — perubahan katalog saja, tidak menulis
-- ulang tabelnya, jadi aman dijalankan ke produksi yang sedang berjalan sebelum
-- kodenya menyusul. Ditulis tangan seperti 0002–0012.
--
-- Sebelum ini absen keluar di luar radius MUSTAHIL, bukan sekadar dipersulit:
-- gerbang geofence di /api/me/clock hanya bersyarat "ada kantornya", dan pada
-- absen keluar kantornya selalu ada — dibaca dari baris absen masuk, bukan dari
-- yang dikirim telepon. Orang yang absen masuk di kantor lalu pulang dari tempat
-- lain tidak punya jalan keluar sama sekali.
--
-- Kolom sendiri, bukan menumpang `early_reason`: "kenapa pulang sebelum shift
-- selesai" dan "kenapa tidak di kantor" adalah dua pertanyaan berbeda yang bisa
-- dijawab pada hari yang sama.
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "away_reason" text;

-- Tidak ada kolom tinjauan baru: `review_ok` sejak 0011 memang satu keputusan
-- untuk harinya, bukan satu per alasan, jadi alasan ketiga ikut ke keputusan
-- yang sama.
