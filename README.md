# Ruang HR — konsol web HR Admin

Implementasi [`../PRD.md`](../PRD.md). Next.js 16 (App Router) · Tailwind v4 · shadcn/ui ·
Zustand · TanStack Query · Framer Motion · Drizzle + Postgres (Neon) · NextAuth.

Token warna, tipografi, dan layout diambil langsung dari mockup
`../Ruang HR Lite.dc.html`, dipetakan ke nama token shadcn agar komponen bawaan
ikut bergaya tanpa restyling.

## Menjalankan

```bash
npm install
npm run db:up                # Postgres lokal via docker (port 55432)
cp .env.example .env.local   # untuk dev lokal, isi DATABASE_URL sesuai db:up
npm run db:push              # buat skema
npm run db:seed              # data demo dari mockup (16 karyawan, ~700 baris absensi)
npm run dev
```

Login: `andini.rahmawati@nusantaradigital.co.id` / `password123`

Untuk Neon, cukup ganti `DATABASE_URL` — driver `node-postgres` yang sama dipakai
untuk lokal dan Neon, tidak ada perubahan kode.

> `AUTH_URL` harus sama dengan URL aplikasi yang sebenarnya. Kalau tidak,
> NextAuth membangun URL redirect ke host yang salah.

Postgres di docker tidak ikut hidup otomatis setelah restart mesin. Kalau
aplikasi menampilkan "Database tidak dapat dihubungi", jalankan `npm run db:up`.

## Verifikasi

```bash
npm run check   # aturan bisnis: kuota cuti, hari kerja, biaya lembur, status telat
npm run build   # tipe + build produksi
npm run smoke   # end-to-end: login, 7 halaman, approve, ekspor CSV, guard akses
                # butuh server jalan → BASE=http://localhost:3000 npm run smoke
```

## Struktur

| Path | Isi |
|---|---|
| `src/lib/hr.ts` | Semua aturan bisnis (kuota, hari kerja, biaya lembur, status). Satu sumber kebenaran — aplikasi mobile nanti memakai server yang sama, jadi tidak bisa drift. |
| `src/db/schema.ts` | Skema 7 modul + `settings` (tarif, kuota, shift) dan `audit_log`. |
| `src/auth.ts` | NextAuth + `requireAdmin()` yang dipanggil ulang di setiap mutasi. |
| `src/proxy.ts` | Route guard. Next 16 mengganti nama `middleware.ts` → `proxy.ts`. |
| `src/app/(app)/*` | 7 halaman modul, server component, filter lewat URL. |
| `src/app/api/*` | Mutasi (approve/tolak, pin, reminder) + ekspor CSV. |
| `src/components/search-dialog.tsx` | Modal pencarian (⌘K / Ctrl+K) → `GET /api/search`, debounce 250 ms. |
| `src/store/ui.ts` | Zustand: hanya tema. Drawer memakai URL params, modal pencarian memegang state input-nya sendiri. |

Pembagian state: baca data lewat server component + filter di URL (bisa
di-bookmark, tanpa kode fetch klien); TanStack Query dipakai di tempat yang
memang membutuhkannya — mutasi approve/tolak/pin/reminder, lengkap dengan status
pending dan toast.

## Yang sudah jalan

Ketujuh modul PRD §6 berjalan di atas data asli: papan kehadiran + rekap bulanan
teragregasi di SQL, antrian cuti dengan saldo per karyawan, lembur dengan
estimasi biaya, tabel karyawan + drawer detail, pengumuman (pin), berkas
(metadata), laporan + ekspor CSV. Approve/tolak menulis ke DB, mencatat
`audit_log`, dan memicu notifikasi.

## Yang ditunda (dan kenapa)

| Ditunda | Alasan | Tambahkan saat |
|---|---|---|
| **WebAuthn / passkey** | Butuh RP ID dari domain nyata + tabel authenticator; tidak bisa diuji tanpa perangkat. Login credentials sudah jalan. | Aplikasi punya domain ter-deploy (PRD Fase 1). |
| **Kirim email nyata** | `src/lib/email.ts` menulis ke stdout. Template dan titik panggilnya sudah benar. | `RESEND_API_KEY`/`SMTP_URL` tersedia — ganti satu fungsi, pemanggil tidak berubah. |
| **Upload/unduh berkas** | Metadata sudah di DB; tombol unduh sengaja `disabled`. | Bucket S3/R2 tersedia (PRD Fase 4). |
| **Ekspor PDF** | CSV (UTF-8 BOM) terbuka langsung di Excel dan memenuhi kebutuhan audit tanpa dependensi baru. | Ada permintaan format PDF spesifik. |
| **CRUD karyawan & editor pengumuman** | Halaman baca + approval adalah alur harian HR; form tulis lebih jarang dipakai. | PRD Fase 2/4. |
| **Approval oleh atasan langsung** | `employees.manager_id` sudah ada dan terisi, jadi tidak perlu migrasi. Mengikuti mockup yang hanya menampilkan approval HR. | Peran manager diaktifkan. |
| **Pagination** | Baru 16 karyawan di seed. Filter sudah server-side, jadi tinggal menambah `limit/offset`. | Mendekati ratusan baris (PRD §9). |

Dua database (Neon + MariaDB) di draft PRD awal sudah dihapus — tidak ada sistem
lama untuk diintegrasikan, jadi Neon adalah satu-satunya database.
