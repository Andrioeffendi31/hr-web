#!/usr/bin/env bash
# End-to-end smoke test against a running server.
# Usage: BASE=http://localhost:3000 ./scripts/smoke.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-andini.rahmawati@nanumindahsejati.co.id}"
PASS="${PASS:-securePass123}"
JAR="$(mktemp)"
fail=0

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    printf '  ok   %-42s %s\n' "$1" "$3"
  else
    printf '  FAIL %-42s expected %s, got %s\n' "$1" "$2" "$3"
    fail=1
  fi
}

code() { curl -s -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s -b "$JAR" -c "$JAR" "$@"; }

echo "1. unauthenticated access is refused"
check "/kehadiran without session" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/kehadiran")"
# API routes are no longer behind proxy.ts — it can only express one role, which
# broke the employee-facing endpoints. Each handler authorizes itself instead, so
# this is requireAdmin() answering rather than a redirect.
check "export route without session" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/export/karyawan")"
check "employee endpoint without session" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me")"
# Apple and Google fetch these anonymously and refuse redirects
check "well-known is public" 503 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/.well-known/assetlinks.json")"

echo "2. login"
CSRF="$(body "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
[ -n "$CSRF" ] || { echo "  FAIL could not read csrf token"; exit 1; }
curl -s -b "$JAR" -c "$JAR" -o /dev/null \
  -d "csrfToken=$CSRF" -d "email=$EMAIL" -d "password=$PASS" \
  "$BASE/api/auth/callback/credentials"
check "session established" "hr_admin" "$(body "$BASE/api/auth/session" | grep -o 'hr_admin' | head -1)"

echo "3. wrong password is rejected"
BADJAR="$(mktemp)"
BADCSRF="$(curl -s -c "$BADJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$BADJAR" -c "$BADJAR" -o /dev/null \
  -d "csrfToken=$BADCSRF" -d "email=$EMAIL" -d "password=wrongpassword" \
  "$BASE/api/auth/callback/credentials"
check "no session for bad password" "" "$(curl -s -b "$BADJAR" "$BASE/api/auth/session" | grep -o 'hr_admin' | head -1)"

echo "4. every module page renders"
for p in kehadiran cuti lembur karyawan divisi lokasi libur pengumuman berkas laporan pengaturan; do
  check "/$p" 200 "$(code "$BASE/$p")"
done
check "/kehadiran?tab=recap" 200 "$(code "$BASE/kehadiran?tab=recap")"
check "/karyawan?open=1 (modal detail)" 200 "$(code "$BASE/karyawan?open=1")"

echo "5. seeded data actually reaches the page"
check "employee name on attendance board" "Andini Rahmawati" \
  "$(body "$BASE/kehadiran" | grep -o 'Andini Rahmawati' | head -1)"
check "leave request on cuti page" "Citra Maharani" \
  "$(body "$BASE/cuti" | grep -o 'Citra Maharani' | head -1)"

echo "6. CSV export"
CSV="$(body "$BASE/api/export/karyawan")"
# leading BOM is deliberate (Excel UTF-8 detection), so strip it before comparing
check "csv header row" "NIK" "$(printf '%s' "$CSV" | head -1 | sed $'1s/^\xEF\xBB\xBF//' | cut -d, -f1)"
check "csv carries a BOM for Excel" "efbbbf" "$(printf '%s' "$CSV" | head -c 3 | xxd -p)"
# ≥ rather than = so a leftover test employee from section 11 doesn't fail it
check "csv has a row per employee" 1 \
  "$([ "$(printf '%s' "$CSV" | grep -c .)" -ge 17 ] && echo 1 || echo 0)"
check "kehadiran export" 200 "$(code "$BASE/api/export/kehadiran?date=2026-07-30")"
check "unknown report is 404" 404 "$(code "$BASE/api/export/tidakada")"

# Status dari badan SUKSES saja: `{"ok":true,"status":"…"}`. Ditambatkan di awal
# dengan sengaja — badan 409 juga memuat "status" (keadaan pengajuan saat itu), jadi
# pola yang tidak ditambatkan membaca penolakan sebagai persetujuan.
statusOk() { sed -n 's/^{"ok":true,"status":"\([^"]*\)".*/\1/p'; }

echo "7. approve a pending overtime request"
PENDING="$(body "$BASE/lembur" | grep -o 'Bagas Prasetyo' | head -1)"
check "pending request visible" "Bagas Prasetyo" "$PENDING"
check "approve returns disetujui" "disetujui" \
  "$(body -X POST -H 'Content-Type: application/json' \
      -d '{"kind":"lembur","id":1,"action":"disetujui"}' \
      "$BASE/api/requests" | statusOk)"
check "invalid payload rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' -d '{"kind":"nope"}' "$BASE/api/requests")"
check "decision is persisted, not just echoed" "Disetujui" \
  "$(body "$BASE/lembur" | grep -o 'Disetujui' | head -1)"

echo "7b. cuti: dua tingkat, dan tingkat kedua milik Pimpinan"
# Lembur di atas tetap satu tingkat — sekali ketuk admin langsung "disetujui".
# Cuti tidak: ia berhenti di "menunggu_pimpinan" sampai Pimpinan memutus, dan
# itulah yang membuat "wajib" berarti wajib.
PIMJAR="$(mktemp)"
PIMCSRF="$(curl -s -b "$PIMJAR" -c "$PIMJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$PIMJAR" -c "$PIMJAR" -o /dev/null \
  -d "csrfToken=$PIMCSRF" -d "email=${PIMEMAIL:-fajar.nugroho@nanumindahsejati.co.id}" \
  -d "password=$PASS" "$BASE/api/auth/callback/credentials"
check "pimpinan signs in" "pimpinan" \
  "$(curl -s -b "$PIMJAR" "$BASE/api/auth/session" | grep -o 'pimpinan' | head -1)"

putus() { # jar kind id action
  curl -s -b "$1" -X POST -H 'Content-Type: application/json' \
    -d "{\"kind\":\"$2\",\"id\":$3,\"action\":\"$4\"}" "$BASE/api/requests"
}
kode() { curl -s -o /dev/null -w '%{http_code}' -b "$1" -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"kind\":\"$2\",\"id\":$3,\"action\":\"$4\"}" "$BASE/api/requests"; }

# id 1 = pengajuan cuti pertama seed (Citra Maharani, status menunggu)
check "admin menyetujui cuti → menunggu pimpinan" "menunggu_pimpinan" \
  "$(putus "$JAR" cuti 1 disetujui | statusOk)"
# inilah intinya: admin TIDAK bisa menuntaskan sendiri
check "admin tidak bisa menuntaskan sendiri" 409 "$(kode "$JAR" cuti 1 disetujui)"
check "pimpinan menuntaskan" "disetujui" \
  "$(putus "$PIMJAR" cuti 1 disetujui | statusOk)"
# dan keputusan yang sudah final tidak bisa ditimpa — bug lama yang ikut tertutup
check "keputusan final tidak bisa diputus ulang" 409 "$(kode "$PIMJAR" cuti 1 disetujui)"
# Pimpinan dari 'menunggu' menutup dua tingkat sekali ketuk (id 2 = cuti Dimas)
check "pimpinan menutup dua tingkat sekaligus" "disetujui" \
  "$(putus "$PIMJAR" cuti 2 disetujui | statusOk)"
# label tingkat kedua terlihat di halaman: tab-nya ada dan barisnya bisa ditemukan
check "tab 'Menunggu pimpinan' ada di /cuti" 1 \
  "$(body "$BASE/cuti" | grep -c 'Menunggu pimpinan')"

echo "8. search API"
first_name() { grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4; }
check "search by name" "Bagas Prasetyo" \
  "$(body "$BASE/api/search?q=bagas" | first_name)"
check "search by NIK" 1 \
  "$(body "$BASE/api/search?q=NIS-0044" | grep -c 'Bagas Prasetyo')"
check "search by division returns many" 1 \
  "$([ "$(body "$BASE/api/search?q=Engineering" | grep -o '"id":' | grep -c .)" -ge 4 ] && echo 1 || echo 0)"
check "case-insensitive" 1 "$(body "$BASE/api/search?q=CITRA" | grep -c 'Citra Maharani')"
check "single char returns nothing" "[]" "$(body "$BASE/api/search?q=a" | sed 's/{"hits":\(.*\)}/\1/')"
check "no match returns empty" "[]" \
  "$(body "$BASE/api/search?q=zzzznotarealname" | sed 's/{"hits":\(.*\)}/\1/')"
check "wildcard is escaped, not injected" "[]" \
  "$(body "$BASE/api/search?q=%25%25" | sed 's/{"hits":\(.*\)}/\1/')"
check "prefix match ranks first" "Maya Sari" \
  "$(body "$BASE/api/search?q=Ma" | first_name)"
# the value depends on today's attendance row; only the field is contractual
check "hit carries today status" 1 "$(body "$BASE/api/search?q=bagas" | grep -c '"status":')"
# 403 from requireAdmin() now that proxy.ts leaves /api to its handlers
check "search needs a session" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/search?q=bagas")"

echo "9. WebAuthn / passkey"
# the login challenge is pre-authentication, so it must NOT be behind the proxy
check "login options is public" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/webauthn/login")"
check "login options returns json challenge" 1 \
  "$(curl -s "$BASE/api/webauthn/login" | grep -c '"challengeId"')"
check "login options carries rpId" 1 \
  "$(curl -s "$BASE/api/webauthn/login" | grep -c '"rpId"')"
# registration must stay behind a session
# 401 from the route's own session check, not a proxy redirect
check "register options needs session" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/webauthn/register")"
check "register options with session" 200 "$(code "$BASE/api/webauthn/register")"
check "register options offers a challenge" 1 \
  "$(body "$BASE/api/webauthn/register" | grep -c '"challengeId"')"
check "residentKey required (discoverable login)" 1 \
  "$(body "$BASE/api/webauthn/register" | grep -c '"residentKey":"required"')"
# a forged assertion must not mint a session
check "unknown challenge rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d '{"challengeId":"nope","response":{}}' "$BASE/api/webauthn/register")"
check "revoking someone else's passkey 404s" 404 \
  "$(code -X DELETE -H 'Content-Type: application/json' -d '{"id":999999}' \
      "$BASE/api/webauthn/register")"
check "profil page renders" 200 "$(code "$BASE/profil")"

echo "10. reminder email endpoint"
check "remind sends to 3 absentees" 3 \
  "$(body -X POST -H 'Content-Type: application/json' \
      -d '{"ids":[10,13,16],"date":"2026-07-30"}' \
      "$BASE/api/remind" | sed 's/.*"sent":\([0-9]*\).*/\1/')"

echo "11. CRUD karyawan"
NEWNIK="NIS-TEST-$$"
NEWEMAIL="smoke.$$@nanumindahsejati.co.id"
emp() { # method json
  body -X "$1" -H 'Content-Type: application/json' -d "$2" "$BASE/api/employees"
}
NEWEMP='{"nik":"'"$NEWNIK"'","name":"Smoke Tester","email":"'"$NEWEMAIL"'","role":"employee","division":"Engineering","position":"QA","contractType":"Kontrak","joinedAt":"2026-02-01","workLocation":"Kantor Pusat","managerId":null,"password":"Password123!"}'
NEWID="$(emp POST "$NEWEMP" | sed 's/.*"id":\([0-9]*\).*/\1/')"
check "employee created" 1 "$([ -n "$NEWID" ] && echo 1 || echo 0)"
check "duplicate nik/email is 409" 409 \
  "$(code -X POST -H 'Content-Type: application/json' -d "$NEWEMP" "$BASE/api/employees")"
check "short password rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d "${NEWEMP/Password123!/short}" "$BASE/api/employees")"
# long but weak: the rule is not just a length check (lib/hr.ts cekSandi)
check "password without symbol rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d "${NEWEMP/Password123!/Password12345}" "$BASE/api/employees")"
check "new employee listed" "Smoke Tester" \
  "$(body "$BASE/karyawan?q=Smoke" | grep -o 'Smoke Tester' | head -1)"
emp PATCH '{"id":'"$NEWID"',"nik":"'"$NEWNIK"'","name":"Smoke Tested","email":"'"$NEWEMAIL"'","role":"employee","division":"Engineering","position":"QA Lead","contractType":"Kontrak","joinedAt":"2026-02-01","workLocation":"Kantor Pusat","managerId":null,"active":true}' > /dev/null
check "edit persists" "Smoke Tested" \
  "$(body "$BASE/karyawan?q=Smoke" | grep -o 'Smoke Tested' | head -1)"
check "deactivate" "false" \
  "$(emp PATCH '{"id":'"$NEWID"',"active":false}' | grep -o 'false' | head -1)"
check "deactivated hidden from aktif filter" 0 \
  "$(body "$BASE/karyawan?q=Smoke" | grep -c 'Smoke Tested')"
check "deactivated visible under status=nonaktif" 1 \
  "$(body "$BASE/karyawan?q=Smoke&status=nonaktif" | grep -c 'Smoke Tested')"
check "cannot deactivate self" 400 \
  "$(code -X PATCH -H 'Content-Type: application/json' -d '{"id":1,"active":false}' \
      "$BASE/api/employees")"
check "unknown employee is 404" 404 \
  "$(code -X PATCH -H 'Content-Type: application/json' -d '{"id":999999,"active":false}' \
      "$BASE/api/employees")"

echo "12. hari libur & cuti bersama"
check "template is CSV with BOM" "efbbbf" \
  "$(body "$BASE/api/holidays/template" | head -c 3 | xxd -p)"
check "add holiday" 200 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d '{"date":"2026-12-25","name":"Hari Raya Natal","collective":false}' \
      "$BASE/api/holidays")"
check "bad date rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d '{"date":"25-12-2026","name":"Natal","collective":false}' "$BASE/api/holidays")"
check "holiday on page" "Hari Raya Natal" \
  "$(body "$BASE/libur?year=2026" | grep -o 'Hari Raya Natal' | head -1)"
CSVIMPORT=$'tanggal,nama,cuti_bersama\r\n2026-12-26,Cuti Bersama Natal,ya\r\n2026-13-40,Tanggal Ngawur,tidak\r\n'
IMPORT_OUT="$(printf '%s' "$CSVIMPORT" > /tmp/hol.$$.csv; \
  curl -s -b "$JAR" -c "$JAR" -F "file=@/tmp/hol.$$.csv;type=text/csv" \
    "$BASE/api/holidays/import")"
check "import accepts good row" 1 "$(printf '%s' "$IMPORT_OUT" | sed 's/.*"imported":\([0-9]*\).*/\1/')"
check "import reports bad row" 1 "$(printf '%s' "$IMPORT_OUT" | sed 's/.*"skipped":\([0-9]*\).*/\1/')"
curl -s -b "$JAR" -c "$JAR" -F "file=@/tmp/hol.$$.csv;type=text/csv" \
  "$BASE/api/holidays/import" > /dev/null
check "re-import is idempotent (no duplicate)" 1 \
  "$(body "$BASE/libur?year=2026" | grep -c 'Cuti Bersama Natal')"
check "cuti bersama deducted from balance" 1 \
  "$(body "$BASE/cuti" | grep -c 'cuti bersama')"
check "delete holiday" 200 \
  "$(code -X DELETE -H 'Content-Type: application/json' -d '{"date":"2026-12-25"}' \
      "$BASE/api/holidays")"
# external calendar feed: 200 with items, or a clean 502 when offline — never 500
SUGGEST="$(code "$BASE/api/holidays/suggest?year=2026")"
check "suggest degrades gracefully" 1 \
  "$([ "$SUGGEST" = 200 ] || [ "$SUGGEST" = 502 ] && echo 1 || echo 0)"
check "suggest rejects a bad year" 400 "$(code "$BASE/api/holidays/suggest?year=abcd")"
check "delete unknown holiday is 404" 404 \
  "$(code -X DELETE -H 'Content-Type: application/json' -d '{"date":"1999-01-01"}' \
      "$BASE/api/holidays")"
code -X DELETE -H 'Content-Type: application/json' -d '{"date":"2026-12-26"}' \
  "$BASE/api/holidays" > /dev/null
rm -f "/tmp/hol.$$.csv"

echo "13. koreksi saldo cuti"
bal() { body -X PATCH -H 'Content-Type: application/json' -d "$1" "$BASE/api/leave-balance"; }
check "adjustment saved" "true" "$(bal '{"employeeId":2,"year":2026,"days":3,"note":"carry-over 2025"}' | grep -o 'true' | head -1)"
check "adjustment shown on cuti page" "koreksi 3" \
  "$(body "$BASE/cuti" | grep -o 'koreksi 3' | head -1)"
check "adjustment is replaced, not summed" "koreksi 2" \
  "$(bal '{"employeeId":2,"year":2026,"days":2}' > /dev/null; \
     body "$BASE/cuti" | grep -o 'koreksi 2' | head -1)"
check "out-of-range adjustment rejected" 400 \
  "$(code -X PATCH -H 'Content-Type: application/json' \
      -d '{"employeeId":2,"year":2026,"days":999}' "$BASE/api/leave-balance")"
bal '{"employeeId":2,"year":2026,"days":0}' > /dev/null

echo "14. datatable: pagination & sorting via URL"
check "page 2 renders" 200 "$(code "$BASE/karyawan?page=2")"
check "page beyond the end still renders" 200 "$(code "$BASE/lembur?page=999")"
check "range label present" 1 \
  "$(body "$BASE/karyawan" | grep -cE '[0-9]+–[0-9]+ dari [0-9]+')"
first_row() { grep -o 'text-\[13px\] font-medium">[A-Za-z ]*' | head -1 | sed 's/.*">//'; }
check "default order is name A-Z" "Andini Rahmawati" \
  "$(body "$BASE/karyawan" | first_row)"
check "sorting changes the order" 1 \
  "$([ "$(body "$BASE/karyawan?sort=divisi&dir=desc" | first_row)" != "Andini Rahmawati" ] && echo 1 || echo 0)"
# a crafted ?sort must never reach SQL — it falls back to the default ordering
check "crafted sort falls back, no 500" "Andini Rahmawati" \
  "$(body "$BASE/karyawan?sort=name;drop%20table%20employees" | first_row)"
check "crafted dir falls back" 200 "$(code "$BASE/karyawan?sort=nama&dir=;delete")"
check "negative page falls back to 1" 200 "$(code "$BASE/berkas?page=-3")"
check "berkas sorting" 200 "$(code "$BASE/berkas?sort=ukuran&dir=desc")"
# the stat card counts every employee, not just the visible page.
# 2026-07-30 adalah tanggal seed dan sudah lewat, jadi embernya "alpa" (tanpa
# keterangan), bukan "belum" — pada hari yang sudah selesai tidak ada lagi orang
# yang "belum" absen, dan panelnya ikut berganti judul.
check "status filter total matches panel" 1 \
  "$(body "$BASE/kehadiran?status=alpa&date=2026-07-30" > /tmp/keh.$$.html; \
     PANEL=$(grep -o 'Tanpa keterangan ([0-9]*)' /tmp/keh.$$.html | grep -o '[0-9]*' | head -1); \
     TABLE=$(grep -oE '[0-9]+–[0-9]+ dari [0-9]+' /tmp/keh.$$.html | head -1 | sed 's/.*dari //'); \
     rm -f /tmp/keh.$$.html; [ -n "$PANEL" ] && [ "$PANEL" = "$TABLE" ] && echo 1 || echo "panel=$PANEL table=$TABLE")"

# dan hari ini tetap memakai ember "belum": statusnya kontekstual, jadi keduanya
# harus diuji atau separuh aturannya tidak terjaga
check "papan hari ini masih memakai 'belum absen'" 1 \
  "$(body "$BASE/kehadiran?status=belum" | grep -c 'Belum absen masuk (')"

# feed dan panel membaca aturan status yang sama; kalau salah satunya menyalin
# ulang SQL-nya (dulu begitu) angkanya langsung berbeda. Yang sedang cuti tidak
# boleh muncul di keduanya.
check "feed belum-absen sama dengan panel" 3 \
  "$(body "$BASE/api/feed/belum-absen?date=2026-07-30" | grep -o '\"id\":' | wc -l | tr -d ' ')"
check "yang cuti tidak ada di feed belum-absen" 0 \
  "$(body "$BASE/api/feed/belum-absen?date=2026-07-30" | grep -c 'Eka Wulandari')"

# Hari kerja per divisi: Operations (gudang) libur Jumat–Sabtu dan masuk Minggu.
# 24 Juli 2026 adalah Jumat — hari liburnya, jadi tidak seorang pun dari sana boleh
# ditagih absen; dan 26 Juli (Minggu) justru hari kerjanya.
check "divisi tidak ditagih absen pada hari liburnya" 0 \
  "$(body "$BASE/api/feed/belum-absen?date=2026-07-24" | grep -c 'Operations')"
# Batas "mulai mencatat": hari kerja sebelum settings.tracking_since tidak dinilai.
# Seed tidak mengisi kolomnya (NULL = tanpa batas), jadi di sini yang diuji adalah
# bahwa perilaku LAMA tetap utuh saat batasnya kosong — cabang barunya diuji oleh
# assert di hr.check.ts, tempat aturannya tinggal.
check "tanpa batas, hari lampau tetap dinilai" 1 \
  "$(body "$BASE/kehadiran?date=2026-07-16" | grep -c 'Tanpa keterangan')"

check "hari libur divisi tampil sebagai Libur" 3 \
  "$(body "$BASE/kehadiran?date=2026-07-24" | grep -o '>Libur<' | wc -l | tr -d ' ')"

# Skenario "tanpa keterangan": Joko mengajukan izin pada 16 Juli, ditolak, lalu
# tetap tidak masuk dan tidak pernah absen. Harinya tidak punya baris absensi sama
# sekali, jadi drawer-nya dikunci dengan id KARYAWAN — dengan id absensi hari ini
# justru satu-satunya hari yang tidak bisa dibuka.
check "hari tanpa baris absensi tetap bisa dibuka" 1 \
  "$(body "$BASE/kehadiran?date=2026-07-16&open=$(body "$BASE/api/search?q=Joko" | sed 's/.*"id":\([0-9]*\).*/\1/')" \
     | grep -c 'Tanpa bukti pendukung')"

# Alasan terlambat + pemutihannya. Fixture seed pada 2026-07-30: Bagas menulis
# alasan yang BELUM ditinjau (tetap terlambat), Gita alasannya sudah DITERIMA.
# Yang diuji di sini adalah hal yang membedakan rancangannya dari "timpa saja":
# statusnya di database tetap 'telat', dan yang berubah hanya apa yang dibaca.
# Papan 2026-07-30 dipatok seed: tepat dua orang terlambat (Bagas, Gita), dan
# Gita sudah diputihkan — jadi filternya harus menyisakan satu, bukan dua.
check "filter telat menyisakan satu orang" 1 \
  "$(body "$BASE/kehadiran?status=telat&date=2026-07-30" \
     | grep -oE '[0-9]+–[0-9]+ dari [0-9]+' | head -1 | sed 's/.*dari //')"
check "yang belum ditinjau tetap terlambat" 1 \
  "$(body "$BASE/kehadiran?status=telat&date=2026-07-30" | grep -c 'Bagas Prasetyo')"
# inti fiturnya: sudah diputihkan, jadi ia keluar dari ember terlambat...
check "yang diputihkan tidak lagi terlambat" 0 \
  "$(body "$BASE/kehadiran?status=telat&date=2026-07-30" | grep -c 'Gita Permata')"
# ...dan masuk ke ember hadir, tanpa satu baris pun statusnya ditulis ulang
check "yang diputihkan terbaca hadir" 1 \
  "$(body "$BASE/kehadiran?status=hadir&date=2026-07-30" | grep -c 'Gita Permata')"
# papan menandai alasan yang menunggu keputusan, supaya tidak perlu dicari
check "papan menandai alasan belum ditinjau" 1 \
  "$([ "$(body "$BASE/kehadiran?date=2026-07-30" | grep -c 'Ada alasan yang belum ditinjau')" -ge 1 ] && echo 1 || echo 0)"
# laporan keterlambatan membaca kolom status MENTAH, jadi ia satu-satunya yang
# harus menyaring pemutihan sendiri — dan satu-satunya yang bisa diam-diam salah
KETCSV="$(body "$BASE/api/export/keterlambatan?from=2026-07-30&to=2026-07-30")"
check "laporan keterlambatan menghitung yang belum ditinjau" 1 \
  "$(printf '%s' "$KETCSV" | grep 'Bagas Prasetyo' | cut -d, -f4 | tr -d '\r')"
check "laporan keterlambatan melewati yang diputihkan" 0 \
  "$(printf '%s' "$KETCSV" | grep 'Gita Permata' | cut -d, -f4 | tr -d '\r')"
check "tinjauan menolak id yang tidak ada" 404 \
  "$(code -X POST -H 'Content-Type: application/json' -d '{"id":999999,"ok":true}' \
     "$BASE/api/attendance/review")"
check "menolak alasan tanpa catatan ditolak" 400 \
  "$(code -X POST -H 'Content-Type: application/json' -d '{"id":1,"ok":false}' \
     "$BASE/api/attendance/review")"

# Izin setengah hari: satu tanggal, dua jam, dan absen masuk yang jauh lewat
# toleransi tapi TIDAK terlambat. Fixture seed pada 2026-07-30: Indah izin
# 08.00–12.00 (disetujui) lalu masuk 12.05.
check "izin setengah hari terbaca hadir, bukan telat" 1 \
  "$(body "$BASE/kehadiran?status=hadir&date=2026-07-30" | grep -c 'Indah Lestari')"
check "izin setengah hari tidak masuk ember telat" 0 \
  "$(body "$BASE/kehadiran?status=telat&date=2026-07-30" | grep -c 'Indah Lestari')"
# ...dan juga bukan "sedang cuti": orangnya memang masuk dan bekerja separuh hari
check "izin setengah hari bukan cuti sehari" 0 \
  "$(body "$BASE/kehadiran?status=cuti&date=2026-07-30" | grep -c 'Indah Lestari')"
# Penanda di drawer — inilah yang menjelaskan kenapa 12.05 terbaca hadir.
# Dicocokkan pada PROPS drawernya, bukan pada teksnya: dialognya dirender klien
# lewat portal, jadi kalimatnya tidak pernah ada di HTML pertama (pelajaran yang
# sama seperti uji "Tanpa bukti pendukung" di atas).
check "drawer dibekali jam izinnya" 1 \
  "$(body "$BASE/kehadiran?date=2026-07-30&open=$(body "$BASE/api/search?q=Indah" | sed 's/.*"id":\([0-9]*\).*/\1/')" \
     | grep -c 'izin.\{0,3\}:{.\{0,3\}start.\{0,3\}:.\{0,3\}08:00')"
# jamnya sampai ke antrean admin (kolom Durasi berisi jam, bukan "1 hari kerja")
check "antrean cuti menampilkan jam izin" 1 \
  "$(body "$BASE/cuti?tab=disetujui" | grep -c '08:00–12:00')"
# dan ke CSV, di kolomnya sendiri
check "ekspor cuti memuat jam izin" 1 \
  "$(body "$BASE/api/export/cuti?from=2026-07-01&to=2026-07-31" | grep -c '08:00-12:00')"

# Surat izin PDF + QR verifikasi. Tokennya (HMAC, lib/surat.ts) diambil dari
# halaman antrean, seperti yang dilakukan browser admin.
SURAT_OK="$(body "$BASE/cuti?tab=disetujui" | grep -o '/api/surat/cuti/[0-9]*-[A-Za-z0-9_-]*' | head -1 | sed 's|.*/||')"
SURAT_TUNGGU="$(body "$BASE/cuti?tab=menunggu" | grep -o '/api/surat/cuti/[0-9]*-[A-Za-z0-9_-]*' | head -1 | sed 's|.*/||')"
check "antrean memuat tautan surat" 1 \
  "$([ -n "$SURAT_OK" ] && echo 1 || echo 0)"
# TANPA jar: rutenya diotorisasi token, bukan sesi — dan memang harus begitu,
# karena pembaca PDF Android tidak memegang cookie aplikasinya
check "surat bisa diunduh tanpa sesi" 200 \
  "$(curl -s -o /tmp/surat.$$.pdf -w '%{http_code}' "$BASE/api/surat/cuti/$SURAT_OK")"
check "yang terunduh benar-benar PDF" "%PDF" \
  "$(head -c 4 /tmp/surat.$$.pdf)"
check "surat dilayani sebagai application/pdf" "application/pdf" \
  "$(curl -s -o /dev/null -w '%{content_type}' "$BASE/api/surat/cuti/$SURAT_OK")"
rm -f /tmp/surat.$$.pdf
# tanda yang dikutak-kutik: satu karakter terakhir diubah
check "tanda tangan yang diubah ditolak" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/surat/cuti/${SURAT_OK%?}$([ "${SURAT_OK: -1}" = "A" ] && echo B || echo A)")"
# nomor pengajuan ditukar tapi tandanya dibiarkan — percobaan paling wajar,
# karena nomornya terbaca jelas di URL
check "nomor yang ditukar ditolak" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/surat/cuti/999${SURAT_OK#*-}")"
check "token ngawur ditolak" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/surat/cuti/bukan-token")"

# Halaman verifikasi: publik (bukan 307/401/403), dan jawabannya dibaca dari
# status TERKINI, bukan dari apa yang tercetak di kertas
check "verifikasi publik menjawab sah" 1 \
  "$(curl -s "$BASE/verifikasi/$SURAT_OK" | grep -c 'Surat ini sah')"
check "verifikasi yang belum disetujui jujur" 1 \
  "$(curl -s "$BASE/verifikasi/$SURAT_TUNGGU" | grep -c 'Belum disetujui')"
check "verifikasi tidak memuat alasan izin" 0 \
  "$(curl -s "$BASE/verifikasi/$SURAT_TUNGGU" | grep -c 'Alasan')"
check "verifikasi token ngawur 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/verifikasi/bukan-token")"

# Jejak lokasi yang berhenti padahal masih clock in — satu-satunya jawaban untuk
# aplikasi yang di-force-close, karena Android tidak mengizinkan apa pun berjalan
# sesudah itu. Fixture seed pada tanggal HARI INI: Hendra ping terakhir 5 jam lalu
# (lewat ambang 240 menit), Dimas 30 menit lalu.
HARIINI_WIB="$(TZ=Asia/Jakarta date +%F)"
check "jejak yang berhenti ditandai di papan" 1 \
  "$(body "$BASE/kehadiran?date=$HARIINI_WIB&div=Operations" | grep -c 'Jejak lokasi berhenti')"
# sisi lain ambangnya, dan ini yang mencegahnya terbalik tanpa ada yang memerah
check "jejak yang masih hidup tidak ditandai" 0 \
  "$(body "$BASE/kehadiran?date=$HARIINI_WIB&div=Finance" | grep -c 'Jejak lokasi berhenti')"
# hari yang sudah lewat selalu "berhenti" — menandainya di sana hanya kebisingan
check "hari lampau tidak ditandai" 0 \
  "$(body "$BASE/kehadiran?date=2026-07-30" | grep -c 'Jejak lokasi berhenti')"

echo "15. feed API for infinite scroll"
feed() { body "$BASE/api/feed/$1"; }
check "pengumuman page 1 has items" 1 \
  "$(feed "pengumuman?page=1" | grep -c '"items":\[{')"
check "last page reports no next" "null" \
  "$(feed "pengumuman?page=99" | sed 's/.*"nextPage":\([^,}]*\).*/\1/')"
check "cuti feed filters by status" 1 \
  "$([ "$(feed "cuti?status=ditolak" | grep -c '"status":"ditolak"')" -ge 0 ] && echo 1 || echo 0)"
check "saldo feed returns balances" 1 "$(feed "saldo?year=2026" | grep -c '"remaining"')"
check "belum-absen feed" 1 \
  "$([ "$(feed "belum-absen?date=2026-07-30" | grep -c '"items"')" = 1 ] && echo 1 || echo 0)"
check "unknown feed is 404" 404 "$(code "$BASE/api/feed/tidakada")"
check "bad page is 400" 400 "$(code "$BASE/api/feed/pengumuman?page=0")"
# 403 from requireAdmin(), not a redirect — see the note in section 1
check "feed needs a session" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/feed/pengumuman")"

echo "16. karyawan di web: tidak punya halaman apa pun, API tetap miliknya"
# The whole point of the (admin) route group and lib/access.ts: nine admin pages
# have no guard of their own and used to rely on the proxy refusing every
# non-admin. If this section ever goes green-to-red, that guard has come undone.
EMPJAR="$(mktemp)"
EMPCSRF="$(curl -s -b "$EMPJAR" -c "$EMPJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$EMPJAR" -c "$EMPJAR" -o /dev/null \
  -d "csrfToken=$EMPCSRF" -d "email=${EMPEMAIL:-bagas.prasetyo@nanumindahsejati.co.id}" \
  -d "password=$PASS" "$BASE/api/auth/callback/credentials"
empcode() { curl -s -b "$EMPJAR" -c "$EMPJAR" -o /dev/null -w '%{http_code}' "$@"; }

check "karyawan signs in" "employee" \
  "$(curl -s -b "$EMPJAR" "$BASE/api/auth/session" | grep -o 'employee' | head -1)"
for p in kehadiran karyawan cuti lembur berkas laporan libur pengumuman divisi lokasi pengaturan; do
  check "karyawan ditolak dari /$p" 307 "$(empcode "$BASE/$p")"
done
# Area /saya dihapus: kehadiran dan pengajuan dikerjakan di aplikasi ponsel, dan
# separuh salinan di web hanya menawarkan jalan yang tidak bisa diselesaikan.
#
# Dua jawaban berbeda, dan keduanya benar. Karyawan mendapat 307: proxy menolaknya
# sebelum Next sempat mencari rutenya, jadi bookmark lama mendarat di halaman
# "buka aplikasi" alih-alih di layar 404. Admin — yang boleh membuka apa saja —
# menembus proxy dan mendapat 404 dari Next, yaitu bukti halamannya benar-benar
# tidak ada lagi, bukan sekadar tertutup kebijakan.
for p in saya saya/kehadiran saya/pengajuan saya/berkas saya/pengumuman; do
  check "karyawan tidak lagi punya /$p" 307 "$(empcode "$BASE/$p")"
  check "/$p benar-benar dihapus" 404 "$(code "$BASE/$p")"
done
check "karyawan ditolak dari /profil" 307 "$(empcode "$BASE/profil")"
# ...dan mendarat di halaman "buka aplikasi", bukan di halaman yang menolaknya lagi
check "karyawan mendarat di /buka/absen" "/buka/absen" \
  "$(curl -s -b "$EMPJAR" -o /dev/null -w '%{redirect_url}' "$BASE/" | sed "s|$BASE||")"
# pendaratan tautan email: publik, tanpa sesi sama sekali
check "/buka/absen publik" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/buka/absen")"
check "tujuan yang dikarang 404" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/buka/karangan")"
# the API layer is the real authorization; the pages above are only the shortcut
check "karyawan tidak bisa PATCH settings" 403 \
  "$(empcode -X PATCH -H 'Content-Type: application/json' -d '{}' "$BASE/api/settings")"
check "karyawan tidak bisa POST employees" 403 \
  "$(empcode -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/employees")"
check "karyawan tidak bisa menyetujui pengajuan" 403 \
  "$(empcode -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/requests")"
check "karyawan tidak bisa mencari karyawan" 403 "$(empcode "$BASE/api/search?q=a")"
# memutihkan keterlambatannya sendiri adalah tepat hal yang tidak boleh bisa
# Izin setengah hari dari sisi karyawan. Bagas punya izin 08.00–11.00 yang
# DISETUJUI untuk hari ini (seed), jadi shift yang dikirim ke ponselnya harus
# sudah bergeser — angka itulah yang dipakai layar absen untuk memutuskan kapan
# field "alasan terlambat" muncul, dan yang membuat masuk jam 11 bukan telat.
check "shift efektif bergeser oleh izin yang disetujui" '"start":"11:00"' \
  "$(curl -s -b "$EMPJAR" "$BASE/api/me" | grep -o '"shift":{"start":"[^"]*"' | sed 's/.*{//')"
check "ponsel diberi tahu izinnya" '"izin":{"start":"08:00","end":"11:00"}' \
  "$(curl -s -b "$EMPJAR" "$BASE/api/me" | grep -o '"izin":{"start":"[^"]*","end":"[^"]*"}')"
empbad() { curl -s -b "$EMPJAR" -X POST -F "kind=cuti" -F "type=Izin Setengah Hari" \
  -F "reason=Kontrol dokter pagi hari" -F "startDate=$1" -F "endDate=$2" \
  ${3:+-F "startTime=$3"} ${4:+-F "endTime=$4"} "$BASE/api/me/requests"; }
# hari kerja berikutnya: Sabtu/Minggu ditolak lebih dulu oleh cek hari kerja,
# jadi uji jam di bawahnya tidak akan pernah tercapai kalau tanggalnya akhir pekan
BESOK=""
for n in 1 2 3 4 5 6 7; do
  D="$(TZ=Asia/Jakarta date -v+${n}d +%F 2>/dev/null || date -d "+$n days" +%F)"
  W="$(TZ=Asia/Jakarta date -v+${n}d +%u 2>/dev/null || date -d "+$n days" +%u)"
  [ "$W" -le 5 ] && { BESOK="$D"; break; }
done
check "izin setengah hari tanpa jam ditolak" "Isi jam mulai dan jam selesai izin" \
  "$(empbad "$BESOK" "$BESOK" | sed 's/.*"error":"\([^"]*\)".*/\1/')"
check "jam selesai sebelum mulai ditolak" "Jam selesai izin harus setelah jam mulai" \
  "$(empbad "$BESOK" "$BESOK" 13:00 11:00 | sed 's/.*"error":"\([^"]*\)".*/\1/')"
# izin yang menutup seluruh shift bukan setengah hari — itu izin sehari, dan
# membiarkannya lolos akan membuat geserShift() tidak punya batas yang tersisa
check "izin sehari penuh diarahkan ke Izin Khusus" 1 \
  "$(empbad "$BESOK" "$BESOK" 08:00 17:00 | grep -c 'menutup seluruh shift')"
check "izin setengah hari lebih dari satu tanggal ditolak" \
  "Izin setengah hari hanya untuk satu tanggal" \
  "$(empbad "$BESOK" "2026-12-31" 08:00 12:00 | sed 's/.*"error":"\([^"]*\)".*/\1/')"
check "izin setengah hari yang sah diterima" '"ok":true' \
  "$(empbad "$BESOK" "$BESOK" 08:00 12:00 | grep -o '"ok":true')"
check "jamnya kembali di daftar pengajuan" 1 \
  "$(curl -s -b "$EMPJAR" "$BASE/api/me/requests" | grep -c '08:00–12:00')"
check "jam izin ditolak pada jenis lain" \
  "Jam izin hanya untuk pengajuan Izin Setengah Hari" \
  "$(curl -s -b "$EMPJAR" -X POST -F "kind=cuti" -F "type=Izin Khusus" \
     -F "reason=Ada urusan keluarga" -F "startDate=$BESOK" -F "endDate=$BESOK" \
     -F "startTime=08:00" -F "endTime=12:00" "$BASE/api/me/requests" \
     | sed 's/.*"error":"\([^"]*\)".*/\1/')"

# Surat izin dari sisi karyawan: tokennya ikut di payload-nya sendiri, dan
# alasan izin Bagas memuat emoji — kalau `teksAman()` hilang, unduhan ini 500
SURAT_EMP="$(curl -s -b "$EMPJAR" "$BASE/api/me/requests" | grep -o '"suratToken":"[0-9]*-[A-Za-z0-9_-]*"' | head -1 | cut -d'"' -f4)"
check "karyawan menerima token suratnya" 1 \
  "$([ -n "$SURAT_EMP" ] && echo 1 || echo 0)"
check "alasan ber-emoji tetap bisa dicetak" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/surat/cuti/$SURAT_EMP")"

check "karyawan tidak bisa memutihkan telatnya sendiri" 403 \
  "$(empcode -X POST -H 'Content-Type: application/json' -d '{"id":1,"ok":true}' \
     "$BASE/api/attendance/review")"
check "karyawan tetap bisa baca datanya sendiri" 200 "$(empcode "$BASE/api/me")"
# sidebar tidak lagi punya cabang karyawan sama sekali — yang menjaganya sekarang
# adalah access.check.ts, bukan halaman yang harus dibuka untuk diperiksa

echo "17. jejak lokasi: waktu pengambilan, antrean, dan GPS palsu"
# Citra absen masuk 08:00 pada tanggal HARI INI (seed menulisnya khusus untuk ini —
# papan yang dipatok di 2026-07-30 tidak bisa menyentuh jalur yang memakai todayWib).
PINGJAR="$(mktemp)"
PINGCSRF="$(curl -s -b "$PINGJAR" -c "$PINGJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$PINGJAR" -c "$PINGJAR" -o /dev/null \
  -d "csrfToken=$PINGCSRF" -d "email=citra.maharani@nanumindahsejati.co.id" \
  -d "password=$PASS" "$BASE/api/auth/callback/credentials"
# Waktunya relatif terhadap jam jalan, bukan jam mati: fix di masa depan ditolak,
# jadi "14:30" akan benar sebelum tengah hari dan salah sesudahnya.
# argumen = detik ke BELAKANG; negatif berarti ke depan. BSD dan GNU date memakai
# bendera yang sama sekali berbeda, jadi keduanya dicoba.
iso() {
  if [ "$1" -lt 0 ]; then off="+$(( -$1 ))"; else off="-$1"; fi
  TZ=Asia/Jakarta date -v"${off}S" +%FT%T+07:00 2>/dev/null ||
    TZ=Asia/Jakarta date -d "${off} seconds" +%FT%T+07:00
}
ping() { # detik-ke-belakang lat lng [mocked]
  curl -s -b "$PINGJAR" -c "$PINGJAR" -X POST "$BASE/api/attendance/ping" \
    -H 'content-type: application/json' \
    -d "{\"lat\":$2,\"lng\":$3,\"at\":\"$(iso "$1")\"${4:+,\"mocked\":true}}"
}
check "ping butuh sesi" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/attendance/ping" \
     -H 'content-type: application/json' -d '{"lat":0,"lng":0}')"
check "koordinat ngawur ditolak" 400 \
  "$(curl -s -b "$PINGJAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/attendance/ping" \
     -H 'content-type: application/json' -d '{"lat":999,"lng":0}')"
# batas waktu: fix tidak boleh datang dari masa depan maupun dari sebelum absen masuk
check "waktu ping di masa depan ditolak" "Waktu ping di masa depan" \
  "$(ping -600 -6.2249 106.8092 | sed 's/.*"error":"\([^"]*\)".*/\1/')"

# Blok berikut MENULIS baris lokasi, jadi ia hanya benar sekali per seed: jalan
# kedua akan menabrak jeda 2,5 jam yang dibuat jalan pertama. Keduanya dideteksi
# dan dilewati dengan terang-terangan — uji yang diam-diam lolos di jalan kedua
# lebih buruk daripada uji yang mengaku dilewati.
#
# Fix bertanggal juga butuh ruang 2,5 jam DI DALAM hari ini, dan seed memasang
# absen masuk pukul 00:01; sebelum 03:00 WIB ruang itu belum ada.
BEKAS="$(curl -s -b "$PINGJAR" "$BASE/api/me/attendance/$(TZ=Asia/Jakarta date +%F)" | grep -c '"kind":"lokasi"')"
if [ "$BEKAS" != "0" ]; then
  echo "  skip jejak bertanggal: hari ini sudah punya baris lokasi · jalankan npm run db:seed dulu"
elif [ "$(TZ=Asia/Jakarta date +%H)" -lt 03 ]; then
  echo "  skip jejak bertanggal: sebelum 03:00 WIB belum ada ruang 2,5 jam sejak absen masuk"
else
  # antrean offline: fix yang tertahan 2,7 jam lalu menyusul, kemudian fix baru —
  # keduanya masuk hanya kalau jeda diukur pada waktu PENGAMBILAN, bukan waktu unggah.
  # `delayed` + `location` ikut dikirim seperti yang dilakukan telepon sungguhan.
  ANTREBODY="{\"lat\":-6.2249,\"lng\":106.8092,\"at\":\"$(iso 9720)\",\"delayed\":true,\"location\":\"Jalan Sudirman, Jakarta\"}"
  check "fix antrean yang menyusul diterima" 1 \
    "$(curl -s -b "$PINGJAR" -X POST "$BASE/api/attendance/ping" \
       -H 'content-type: application/json' -d "$ANTREBODY" \
       | grep -c '"ok":true')"
  check "fix baru sesudahnya juga diterima" 1 \
    "$(ping 30 -6.2249 106.8092 | grep -c '"ok":true')"
  # ...dan jeda itu tetap menjadi rate limit
  check "fix kedua di jendela yang sama ditolak 409" "Ping terlalu cepat" \
    "$(ping 20 -6.2249 106.8092 | sed 's/.*"error":"\([^"]*\)".*/\1/')"
  # Fix MUNDUR yang mendarat sesudah dua baris di atas: 5,2 jam ke belakang, jadi
  # lebih dari 2,5 jam dari tetangga terdekatnya. Dulu jeda diukur sebagai
  # `at - (baris TERBARU).at` — bertanda — jadi apa pun yang datang mundur
  # menghasilkan angka negatif, ditolak 409, dan telepon menghitung 409 sebagai
  # "diterima" lalu menghapusnya dari antrean. Hilang tanpa jejak; ini penjaganya.
  # Butuh 00:01 + 2,5 jam ruang DI BAWAH titik itu, jadi sebelum 06:00 dilewati.
  if [ "$(TZ=Asia/Jakarta date +%H)" -lt 06 ]; then
    echo "  skip fix mundur: sebelum 06:00 WIB belum ada ruang 5,2 jam sejak absen masuk"
  else
    MUNDURBODY="{\"lat\":-6.2249,\"lng\":106.8092,\"at\":\"$(iso 18780)\",\"delayed\":true}"
    check "fix mundur di luar jendela tetap diterima" 1 \
      "$(curl -s -b "$PINGJAR" -X POST "$BASE/api/attendance/ping" \
         -H 'content-type: application/json' -d "$MUNDURBODY" \
         | grep -c '"ok":true')"
  fi
  # Tetangga di sisi DEPAN, diuji sendiri supaya benar-benar kueri baru itu yang
  # menjawab: 7,5 jam ke belakang tidak punya tetangga di belakangnya sama sekali
  # (absen masuk 00:01), dan berjarak 2,28 jam dari baris 5,2 jam — di bawah
  # plafon. Sebelum perubahan ini tidak ada satu pun kueri yang melihat ke depan.
  if [ "$(TZ=Asia/Jakarta date +%H)" -lt 08 ]; then
    echo "  skip tetangga depan: sebelum 08:00 WIB belum ada ruang 7,5 jam sejak absen masuk"
  else
    DEPANBODY="{\"lat\":-6.2249,\"lng\":106.8092,\"at\":\"$(iso 27000)\",\"delayed\":true}"
    check "fix mundur yang menempel tetangga depan ditolak" "Ping terlalu cepat" \
      "$(curl -s -b "$PINGJAR" -X POST "$BASE/api/attendance/ping" \
         -H 'content-type: application/json' -d "$DEPANBODY" \
         | sed 's/.*"error":"\([^"]*\)".*/\1/')"
  fi
  # Ping "kembali online": kejadian tersendiri, di luar irama 3 jam.
  # 1,5 jam ke belakang berjarak >10 menit dari kedua tetangganya (2,7 jam dan
  # 30 detik) tapi <2,5 jam dari keduanya — jadi tanpa flag reconnect ia PASTI
  # ditolak 409, dan dengan flag itu ia harus diterima. Itu yang diuji di sini.
  reconnectping() { # detik-ke-belakang [--polos]
    local body="{\"lat\":-6.2249,\"lng\":106.8092,\"at\":\"$(iso "$1")\""
    [ "${2:-}" = "--polos" ] || body="$body,\"reconnect\":true"
    curl -s -b "$PINGJAR" -X POST "$BASE/api/attendance/ping" \
      -H 'content-type: application/json' -d "$body}"
  }
  check "tanpa flag, ping di jendela 3 jam tetap ditolak" "Ping terlalu cepat" \
    "$(reconnectping 5400 --polos | sed 's/.*"error":"\([^"]*\)".*/\1/')"
  check "ping kembali-online diterima di jendela yang sama" 1 \
    "$(reconnectping 5400 | grep -c '"ok":true')"
  check "barisnya bertanda Kembali online" 1 \
    "$(curl -s -b "$PINGJAR" "$BASE/api/me/attendance/$(TZ=Asia/Jakarta date +%F)" \
       | grep -c 'Kembali online')"
  # ...dan plafonnya tetap ada, cuma angkanya berbeda: 3 menit dari baris yang
  # baru saja masuk masih di dalam jeda 10 menit miliknya sendiri
  check "kembali-online pun punya plafon sendiri" "Ping terlalu cepat" \
    "$(reconnectping 5220 | sed 's/.*"error":"\([^"]*\)".*/\1/')"

  # nama tempat dan lubang jejak terbaca di endpoint detail hari
  HARIINI="$(TZ=Asia/Jakarta date +%F)"
  # $PINGJAR, bukan body(): body() memakai sesi admin, dan admin tidak punya
  # absensi hari ini — endpointnya akan menjawab tentang orang yang salah
  check "ping menyimpan nama tempatnya" 1 \
    "$(curl -s -b "$PINGJAR" "$BASE/api/me/attendance/$HARIINI" | grep -c 'Jalan Sudirman, Jakarta')"
  # absen masuk 00:01 lalu fix pertama 2,7 jam ke belakang dari sekarang: lubangnya
  # pasti lebih dari 4 jam kalau sekarang lewat pukul 07:00, jadi hanya diperiksa
  # bahwa medannya ada dan bentuknya benar
  check "endpoint hari membawa medan jeda" 1 \
    "$(curl -s -b "$PINGJAR" "$BASE/api/me/attendance/$HARIINI" | grep -c '"jedaSesudah"')"
fi

# GPS palsu: ping tidak pernah ditolak, tapi barisnya ditandai untuk HR.
# Karyawan lain, karena ping-ping di atas sudah memakai jendela jeda milik Citra.
MOCKJAR="$(mktemp)"
MOCKCSRF="$(curl -s -b "$MOCKJAR" -c "$MOCKJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$MOCKJAR" -c "$MOCKJAR" -o /dev/null \
  -d "csrfToken=$MOCKCSRF" -d "email=dimas.anggara@nanumindahsejati.co.id" \
  -d "password=$PASS" "$BASE/api/auth/callback/credentials"
MOCKBEKAS="$(curl -s -b "$MOCKJAR" "$BASE/api/me/attendance/$(TZ=Asia/Jakarta date +%F)" | grep -c '"kind":"lokasi"')"
MOCKBODY="{\"lat\":-6.2249,\"lng\":106.8092,\"at\":\"$(iso 10)\",\"mocked\":true}"
if [ "$MOCKBEKAS" != "0" ]; then
  echo "  skip uji GPS palsu: hari ini sudah punya baris lokasi · jalankan npm run db:seed dulu"
else
  check "ping ber-GPS palsu ditandai, bukan ditolak" "GPS palsu terdeteksi di perangkat" \
    "$(curl -s -b "$MOCKJAR" -X POST "$BASE/api/attendance/ping" \
       -H 'content-type: application/json' -d "$MOCKBODY" \
       | sed 's/.*"suspect":"\([^"]*\)".*/\1/')"
fi
rm -f "$MOCKJAR"
echo "18. absen keluar di luar kantor"
# Sebelum ini jalur ini BUNTU: gerbang geofence di /api/me/clock hanya bersyarat
# "ada kantornya", dan pada absen keluar kantornya selalu ada — dibaca dari baris
# absen masuk, bukan dari yang dikirim telepon. Siapa pun yang absen masuk di
# kantor tidak punya cara mengakhiri harinya dari tempat lain.
#
# Selfie wajib untuk setiap punch, dan yang diperiksa hanya NAMA berkas serta
# ukurannya (extOf + allowed + MAX_IMAGE), bukan isinya — jadi stub satu byte
# sudah melewati gerbang itu dan kita tidak perlu fixture gambar sungguhan.
SELFIE="$(mktemp -t selfie).jpg"
printf 'x' > "$SELFIE"
# Dimas: seed memberinya absen masuk 00:01 di Kantor Pusat hari ini, tanpa absen
# keluar — persis keadaan yang dibutuhkan, tanpa perlu punch masuk lebih dulu
# (punch masuk akan mengunggah selfie ke R2 sungguhan).
KELUARJAR="$(mktemp)"
KELUARCSRF="$(curl -s -b "$KELUARJAR" -c "$KELUARJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$KELUARJAR" -c "$KELUARJAR" -o /dev/null \
  -d "csrfToken=$KELUARCSRF" -d "email=dimas.anggara@nanumindahsejati.co.id" \
  -d "password=$PASS" "$BASE/api/auth/callback/credentials"
# Monas — jauh dari Kantor Pusat seed, pasti di luar radius berapa pun
JAUH_LAT=-6.1754
JAUH_LNG=106.8272
keluar() { # [alasan]
  curl -s -b "$KELUARJAR" -X POST "$BASE/api/me/clock" \
    -F action=out -F "lat=$JAUH_LAT" -F "lng=$JAUH_LNG" \
    -F "selfie=@$SELFIE;type=image/jpeg" ${1:+-F "awayReason=$1"}
}

DIMASBEKAS="$(curl -s -b "$KELUARJAR" "$BASE/api/me" | grep -c '"clockOut":null')"
if [ "$DIMASBEKAS" != "1" ]; then
  echo "  skip absen keluar di luar kantor: Dimas sudah absen keluar · jalankan npm run db:seed dulu"
else
  # Ketiga uji di bawah DITOLAK sebelum baris ditulis dan sebelum selfie diunggah,
  # jadi tidak satu pun menyentuh R2 maupun mengubah data.
  check "absen keluar di luar kantor tanpa alasan ditolak" "Isi alasan absen keluar di luar kantor dulu" \
    "$(keluar | sed 's/.*"error":"[^.]*\. \([^"]*\)".*/\1/')"
  check "alasan terlalu pendek ditolak" "alasan minimal 5 karakter" \
    "$(keluar "ok" | sed 's/.*"error":"\([^"]*\)".*/\1/')"
  # Penjaga bahwa kelonggaran ini TIDAK ikut membuka sisi masuk: kehadiran di
  # kantor adalah fakta yang sedang dibuktikan, dan alasan tidak menggantikannya.
  # Andini belum punya baris absensi hari ini, jadi ini benar-benar jalur masuk.
  MASUKJAR="$(mktemp)"
  MASUKCSRF="$(curl -s -b "$MASUKJAR" -c "$MASUKJAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
  curl -s -b "$MASUKJAR" -c "$MASUKJAR" -o /dev/null \
    -d "csrfToken=$MASUKCSRF" -d "email=andini.rahmawati@nanumindahsejati.co.id" \
    -d "password=$PASS" "$BASE/api/auth/callback/credentials"
  check "absen MASUK di luar radius tetap ditolak" "Di luar radius" \
    "$(curl -s -b "$MASUKJAR" -X POST "$BASE/api/me/clock" \
       -F action=in -F "lat=$JAUH_LAT" -F "lng=$JAUH_LNG" -F locationId=1 \
       -F "awayReason=alasan tidak berlaku di sini" \
       -F "selfie=@$SELFIE;type=image/jpeg" \
       | sed 's/.*"error":"\(Di luar radius\).*/\1/')"
  rm -f "$MASUKJAR"

  # Jalur SUKSES menulis baris dan MENGUNGGAH selfie. Hanya dijalankan kalau S3
  # diarahkan ke stand-in lokal (R2_ENDPOINT), supaya smoke tidak pernah
  # menitipkan sampah ke bucket produksi.
  if [ -z "${R2_ENDPOINT:-}" ]; then
    echo "  skip absen keluar diterima: setel R2_ENDPOINT ke S3 lokal supaya unggahannya tidak masuk R2 produksi"
  else
    check "absen keluar di luar kantor dengan alasan diterima" 1 \
      "$(keluar "dinas ke klien, langsung pulang dari sana" | grep -c '"ok":true')"
    check "alasannya tersimpan dan terlihat karyawan" 1 \
      "$(curl -s -b "$KELUARJAR" "$BASE/api/me/attendance/$(TZ=Asia/Jakarta date +%F)" \
         | grep -c '"awayReason":"dinas ke klien, langsung pulang dari sana"')"
  fi
fi
rm -f "$KELUARJAR" "$SELFIE"

# absen masuk dengan GPS palsu ditolak sebelum apa pun ditulis — termasuk sebelum selfie
check "absen ber-GPS palsu ditolak" 400 \
  "$(curl -s -b "$PINGJAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/me/clock" \
     -F action=in -F lat=-6.2249 -F lng=106.8092 -F locationId=1 -F mocked=1)"
rm -f "$PINGJAR"

echo "18b. paginasi selamat saat dialog dibuka/ditutup"
# Bug: pilih 100 per halaman, buka detail lalu tutup → kembali 20 per halaman.
# Penyebabnya URL tautan baris dan tombol tutup dibangun dari sebagian parameter
# saja, jadi perPage/sort/dir/page terbuang diam-diam. Yang diuji di sini adalah
# HTML yang benar-benar dirender: tautan barisnya harus tetap membawa perPage.
# perPage=5 (batas bawah parsePaging), bukan 100: seed hanya punya belasan
# karyawan, jadi pada 100 per halaman "halaman 2" kosong dan tidak punya satu pun
# tautan baris untuk diperiksa. Yang diuji tetap hal yang sama.
for hal in kehadiran karyawan; do
  H="$(body "$BASE/$hal?perPage=5&page=2")"
  check "$hal: tautan baris membawa perPage" 1 \
    "$(echo "$H" | grep -oE 'href="[^"]*open=[0-9]+[^"]*"' | head -1 | grep -c 'perPage=5')"
  check "$hal: tautan baris membawa page" 1 \
    "$(echo "$H" | grep -oE 'href="[^"]*open=[0-9]+[^"]*"' | head -1 | grep -c 'page=2')"
done
# ...dan tombol tutup dialognya kembali ke halaman yang SAMA. Diperiksa pada
# `backHref` di payload-nya, bukan sekadar mencari "perPage=5" di mana pun pada
# halaman — angka itu juga muncul di pemilih jumlah baris, jadi pencarian longgar
# akan tetap hijau meski bug-nya kembali.
for hal in kehadiran karyawan; do
  ID="$(body "$BASE/$hal?perPage=5" | grep -oE 'open=[0-9]+' | head -1 | cut -d= -f2)"
  BACK="$(body "$BASE/$hal?perPage=5&page=2&open=$ID" | grep -oE 'backHref[^,]{0,80}' | head -1)"
  check "$hal: tutup dialog membawa perPage" 1 "$(echo "$BACK" | grep -c 'perPage=5')"
  check "$hal: tutup dialog membawa page" 1 "$(echo "$BACK" | grep -c 'page=2')"
done

echo "19. buat pengumuman"
# Hak aksesnya bukan tombol yang disembunyikan, melainkan requireAdmin() di
# rutenya — jadi yang diuji di sini adalah rutenya, bukan halamannya.
BANNER="$(mktemp -t banner).png"
printf 'x' > "$BANNER"
buat() { # judul [--banner] [field=value ...]
  local judul="$1"; shift
  local args=(-F "title=$judul" -F "body=Isi pengumuman uji yang cukup panjang." -F "category=Kebijakan")
  for a in "$@"; do
    if [ "$a" = "--banner" ]; then args+=(-F "banner=@$BANNER;type=image/png")
    else args+=(-F "$a"); fi
  done
  curl -s -b "$JAR" -X POST "$BASE/api/announcements" "${args[@]}"
}
check "karyawan tidak bisa membuat pengumuman" 403 \
  "$(curl -s -b "$EMPJAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/announcements" \
     -F "title=Dari karyawan" -F "body=Seharusnya ditolak sebelum apa pun ditulis." -F "category=Kebijakan")"
check "tanpa sesi juga ditolak" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/announcements" \
     -F "title=Anonim" -F "body=Seharusnya ditolak sebelum apa pun ditulis." -F "category=Kebijakan")"
check "judul terlalu pendek ditolak" "Judul terlalu pendek" \
  "$(buat "ab" | sed 's/.*"error":"\([^"]*\)".*/\1/')"
check "kategori di luar daftar ditolak" 400 \
  "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/announcements" \
     -F "title=Kategori ngawur" -F "body=Isi pengumuman uji yang cukup panjang." -F "category=Gosip")"
check "admin bisa membuat pengumuman" 1 "$(buat "Uji pengumuman tanpa banner" | grep -c '"ok":true')"
# Ponsel membaca umpannya sendiri; medannya harus ada walau isinya null, kalau
# tidak aplikasi tidak akan pernah tahu ada banner untuk ditampilkan.
check "ponsel ikut menerima medan bannerKey" 1 \
  "$(curl -s -b "$EMPJAR" "$BASE/api/me/announcements" | grep -c '"bannerKey"')"
# Banner bertipe salah ditolak SEBELUM barisnya ditulis — kalau tidak, gambar yang
# ditolak akan menyisakan pengumuman tanpa gambar yang sudah terlanjur tayang.
BADBANNER="$(mktemp -t banner).exe"
printf 'x' > "$BADBANNER"
check "banner bertipe salah ditolak" "Banner harus JPG, PNG atau WEBP" \
  "$(curl -s -b "$JAR" -X POST "$BASE/api/announcements" \
     -F "title=Banner salah tipe" -F "body=Isi pengumuman uji yang cukup panjang." \
     -F "category=Kebijakan" -F "banner=@$BADBANNER;type=application/octet-stream" \
     | sed 's/.*"error":"\([^"]*\)".*/\1/')"
check "pengumuman gagal itu tidak tersimpan" 0 \
  "$(body "$BASE/api/feed/pengumuman?page=1" | grep -c 'Banner salah tipe')"
# Jalur banner yang berhasil menulis ke object storage, jadi dijaga sama seperti
# absen keluar di §18: hanya jalan kalau S3 diarahkan ke stand-in lokal.
if [ -z "${R2_ENDPOINT:-}" ]; then
  echo "  skip banner tersimpan: setel R2_ENDPOINT ke S3 lokal supaya unggahannya tidak masuk R2 produksi"
else
  check "pengumuman dengan banner diterima" 1 \
    "$(buat "Uji pengumuman dengan banner" --banner | grep -c '"bannerKey":"banner/')"
  check "bannerKey ikut di umpan" 1 \
    "$(body "$BASE/api/feed/pengumuman?page=1" | grep -c '"bannerKey":"banner/')"
  check "kunci bannernya sampai ke ponsel" 1 \
    "$(curl -s -b "$EMPJAR" "$BASE/api/me/announcements" | grep -c '"bannerKey":"banner/')"
  # dan karyawan biasa boleh benar-benar mengambil gambarnya: pengumuman memang
  # untuk semua orang, jadi prefiks banner/ tidak menanyakan kepemilikan apa pun
  BKEY="$(curl -s -b "$EMPJAR" "$BASE/api/me/announcements" | grep -o '"bannerKey":"banner/[^"]*"' | head -1 | sed 's/"bannerKey":"//;s/"$//')"
  check "karyawan boleh membuka bannernya" 200 \
    "$(curl -s -b "$EMPJAR" -o /dev/null -w '%{http_code}' "$BASE/api/files/$BKEY")"
  check "tanpa sesi banner ditolak" 401 \
    "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/$BKEY")"
fi
# Ubah dan hapus — dua rute yang sama-sama merusak kalau penjaganya bocor.
ID="$(buat "Uji ubah dan hapus" | sed 's/.*"id":\([0-9]*\).*/\1/')"
check "karyawan tidak bisa mengubah pengumuman" 403 \
  "$(curl -s -b "$EMPJAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/announcements" \
     -F "id=$ID" -F "title=Diubah karyawan" -F "body=Seharusnya ditolak sebelum apa pun berubah." -F "category=Libur")"
check "karyawan tidak bisa menghapus pengumuman" 403 \
  "$(curl -s -b "$EMPJAR" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/announcements" \
     -H 'content-type: application/json' -d "{\"id\":$ID}")"
check "admin bisa mengubah pengumuman" 1 \
  "$(curl -s -b "$JAR" -X PATCH "$BASE/api/announcements" \
     -F "id=$ID" -F "title=Judul sudah diubah" -F "body=Isi pengumuman uji yang cukup panjang." \
     -F "category=Libur" | grep -c '"ok":true')"
check "perubahannya benar-benar tersimpan" 1 \
  "$(body "$BASE/api/feed/pengumuman?page=1" | grep -c 'Judul sudah diubah')"
check "mengubah id yang tidak ada 404" 404 \
  "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/announcements" \
     -F "id=999999" -F "title=Tidak ada" -F "body=Isi pengumuman uji yang cukup panjang." -F "category=Libur")"
check "admin bisa menghapus pengumuman" 1 \
  "$(curl -s -b "$JAR" -X DELETE "$BASE/api/announcements" \
     -H 'content-type: application/json' -d "{\"id\":$ID}" | grep -c '"ok":true')"
check "yang dihapus hilang dari umpan" 0 \
  "$(body "$BASE/api/feed/pengumuman?page=1" | grep -c 'Judul sudah diubah')"
check "menghapus dua kali 404" 404 \
  "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/announcements" \
     -H 'content-type: application/json' -d "{\"id\":$ID}")"
rm -f "$BANNER" "$BADBANNER"

rm -f "$JAR" "$BADJAR" "$EMPJAR"
echo
[ $fail -eq 0 ] && echo "smoke: all checks passed" || echo "smoke: FAILURES above"
exit $fail
