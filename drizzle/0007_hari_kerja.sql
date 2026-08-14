-- Hari kerja per divisi.
--
-- Sebelum ini aplikasi menganggap semua orang bekerja Senin–Jumat: satu-satunya
-- aturan adalah `isWeekend` global. Akibatnya divisi yang liburnya hari Jumat
-- tercatat "tanpa keterangan" setiap Jumat — tuduhan yang dihasilkan oleh
-- asumsi, bukan oleh data.
--
-- Hand-written like 0002–0006: production DDL runs one statement at a time
-- against the DIRECT endpoint, reviewed, not diffed by a tool. Idempotent.

-- Nomor hari Postgres (extract(dow): 0 = Minggu … 6 = Sabtu), supaya kolom ini
-- bisa dipakai langsung di dalam kueri tanpa penerjemahan.
--
-- Nullable dan sengaja TIDAK di-backfill: NULL berarti "ikut default perusahaan",
-- nilai yang benar untuk setiap divisi yang belum pernah diatur. Mengisinya dengan
-- {1,2,3,4,5} akan membekukan jawaban hari ini menjadi keputusan eksplisit yang
-- tidak pernah diambil siapa pun.
ALTER TABLE "divisions" ADD COLUMN IF NOT EXISTS "work_days" integer[];

-- Isi yang masuk akal saja: minimal satu hari, dan hanya nomor 0–6. Array kosong
-- akan membuat setiap hari menjadi hari libur diam-diam, dan nomor 9 tidak akan
-- pernah cocok dengan hari apa pun.
--
-- Duplikat sengaja tidak dilarang: `= any(work_days)` tidak peduli, jadi melarangnya
-- hanya menambah satu subkueri (yang bahkan tidak diizinkan Postgres di dalam CHECK)
-- untuk mencegah keadaan yang tidak merugikan siapa pun.
ALTER TABLE "divisions" DROP CONSTRAINT IF EXISTS "divisions_work_days_valid";
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_work_days_valid" CHECK (
  "work_days" IS NULL OR (
    array_length("work_days", 1) BETWEEN 1 AND 7
    AND "work_days" <@ ARRAY[0,1,2,3,4,5,6]
  )
);
