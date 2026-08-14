-- Deteksi GPS palsu pada jejak lokasi.
--
-- Sebelum ini tidak ada satu pun sinyal anti-pemalsuan: aplikasi fake-GPS
-- menghasilkan koordinat yang tidak bisa dibedakan dari fix sungguhan, dan
-- geofence — satu-satunya pertahanan yang ada — justru yang paling mudah
-- dilewati dengan koordinat karangan.
--
-- Hand-written like 0002–0007: production DDL runs one statement at a time
-- against the DIRECT endpoint, reviewed, not diffed by a tool. Idempotent.

-- Alasan kecurigaan, bukan bendera boolean: yang dibutuhkan HR untuk menindak
-- adalah kalimatnya ("GPS palsu terdeteksi di perangkat", "Perpindahan 812 km
-- dalam 4 menit"). NULL = bersih, dan itu keadaan setiap baris yang sudah ada —
-- tidak ada backfill, karena tidak ada satu pun baris lama yang pernah diperiksa.
ALTER TABLE "attendance_events" ADD COLUMN IF NOT EXISTS "suspect" text;

-- Papan harian menanyakan "adakah titik mencurigakan pada absensi ini?" per baris.
-- Indeks parsial: yang dicurigai selalu segelintir, jadi indeks penuh akan
-- menyimpan ratusan ribu NULL untuk menjawab pertanyaan tentang belasan baris.
CREATE INDEX IF NOT EXISTS "att_events_suspect"
  ON "attendance_events" ("attendance_id")
  WHERE "suspect" IS NOT NULL;
