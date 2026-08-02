# Ruang HR — konsol web HR Admin

Implementasi [`../PRD.md`](../PRD.md). Next.js 16 (App Router) · Tailwind v4 · shadcn/ui ·
Zustand · TanStack Query · Framer Motion · Drizzle + Postgres (Neon) · NextAuth.

Token warna, tipografi, dan layout diambil langsung dari mockup
`../Ruang HR Lite.dc.html`, dipetakan ke nama token shadcn agar komponen bawaan
ikut bergaya tanpa restyling.

## Production

Live di **https://web-khaki-eight-38.vercel.app**, database di Neon project
`ruang-hr` (`small-union-33863299`, region `aws-us-west-2`).

- `DATABASE_URL` dan `AUTH_SECRET` sudah diset sebagai Vercel env var
  (Production + Preview). `AUTH_URL` sengaja tidak diset — Auth.js otomatis
  mempercayai host saat `process.env.VERCEL` ada (lihat `@auth/core/lib/utils/env.js`).
- Database production **sudah di-seed** dengan data demo dari mockup untuk
  keperluan preview. Password akun HR Admin default (`securePass123`) **sudah
  diganti** — hint kredensial demo di halaman login otomatis disembunyikan saat
  `VERCEL_ENV=production` (`src/app/login/page.tsx`).
- **Sebelum dipakai sungguhan**: ganti password seluruh akun demo, atau lebih
  aman lagi, `TRUNCATE` semua tabel dan isi data karyawan asli — data demo
  hanya dimaksudkan untuk preview.
- GitHub auto-deploy belum tersambung — `vercel git connect` gagal karena
  Vercel App belum diotorisasi untuk repo ini. Sambungkan lewat
  **Vercel dashboard → Project → Settings → Git → Connect Git Repository**
  (satu klik, butuh otorisasi GitHub yang tidak bisa dilakukan lewat CLI).
  Sampai saat itu, deploy ulang manual dengan `npx vercel --prod`.

## Menjalankan

```bash
npm install
npm run db:up                # Postgres lokal via docker (port 55432)
cp .env.example .env.local   # untuk dev lokal, isi DATABASE_URL sesuai db:up
npm run db:push              # buat skema
npm run db:seed              # data demo dari mockup (16 karyawan, ~700 baris absensi)
npm run dev
```

Login: `andini.rahmawati@nusantaradigital.co.id` / `securePass123`

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
| `src/auth.ts` | NextAuth: provider `credentials` (email+sandi) dan `passkey` (WebAuthn), plus `requireAdmin()` yang dipanggil ulang di setiap mutasi. |
| `src/lib/webauthn.ts` | RP ID diturunkan dari host request (bukan konstanta — satu build melayani localhost dan Vercel), plus challenge sekali-pakai. |
| `src/app/(app)/profil/*` | Daftarkan dan hapus passkey. |
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

## Passkey / WebAuthn

Login utama memakai passkey (PRD §7); kata sandi tetap ada sebagai cadangan.

- **Alur**: masuk dengan kata sandi → `/profil` → "Daftarkan perangkat ini" →
  login berikutnya cukup passkey. Credential bersifat *discoverable*
  (`residentKey: "required"`), jadi login tidak perlu mengetik email lebih dulu
  dan server tidak membocorkan email mana yang terdaftar.
- **Verifikasi assertion terjadi di dalam `authorize()`**, bukan di route
  handler, supaya sesi hanya terbit setelah tanda tangan benar-benar valid —
  tidak ada state "sudah terverifikasi" yang bisa dipalsukan pemanggil.
- **`rpID`/`origin` selalu diambil dari header request**, tidak pernah dari
  payload klien, dan tidak pernah di-hardcode: satu build melayani `localhost`
  dan domain Vercel.
- Challenge disimpan di DB, **sekali pakai** (dihapus saat dibaca) dan kedaluwarsa
  3 menit. Counter tanda tangan wajib naik, sebagai deteksi authenticator kloningan.
- `api/webauthn/login` **harus** dikecualikan dari `proxy.ts` — endpoint ini
  dipanggil sebelum sesi ada. `api/webauthn/register` tetap dijaga.

## Yang ditunda (dan kenapa)

| Ditunda | Alasan | Tambahkan saat |
|---|---|---|
| **Kirim email nyata** | `src/lib/email.ts` menulis ke stdout. Template dan titik panggilnya sudah benar. | `RESEND_API_KEY`/`SMTP_URL` tersedia — ganti satu fungsi, pemanggil tidak berubah. |
| **Upload/unduh berkas** | Metadata sudah di DB; tombol unduh sengaja `disabled`. | Bucket S3/R2 tersedia (PRD Fase 4). |
| **Ekspor PDF** | CSV (UTF-8 BOM) terbuka langsung di Excel dan memenuhi kebutuhan audit tanpa dependensi baru. | Ada permintaan format PDF spesifik. |
| **CRUD karyawan & editor pengumuman** | Halaman baca + approval adalah alur harian HR; form tulis lebih jarang dipakai. | PRD Fase 2/4. |
| **Approval oleh atasan langsung** | `employees.manager_id` sudah ada dan terisi, jadi tidak perlu migrasi. Mengikuti mockup yang hanya menampilkan approval HR. | Peran manager diaktifkan. |
| **Pagination** | Baru 16 karyawan di seed. Filter sudah server-side, jadi tinggal menambah `limit/offset`. | Mendekati ratusan baris (PRD §9). |

Dua database (Neon + MariaDB) di draft PRD awal sudah dihapus — tidak ada sistem
lama untuk diintegrasikan, jadi Neon adalah satu-satunya database.
