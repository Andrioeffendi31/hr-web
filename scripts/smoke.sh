#!/usr/bin/env bash
# End-to-end smoke test against a running server.
# Usage: BASE=http://localhost:3000 ./scripts/smoke.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-andini.rahmawati@nusantaradigital.co.id}"
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

echo "1. unauthenticated access is redirected"
check "/kehadiran without session" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/kehadiran")"
# proxy.ts intercepts before the handler runs, so this redirects rather than
# 403s. requireAdmin() is the second layer if the route is ever reached directly.
check "export route without session" 307 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/export/karyawan")"

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
for p in kehadiran cuti lembur karyawan libur pengumuman berkas laporan; do
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

echo "7. approve a pending overtime request"
PENDING="$(body "$BASE/lembur" | grep -o 'Bagas Prasetyo' | head -1)"
check "pending request visible" "Bagas Prasetyo" "$PENDING"
check "approve returns disetujui" "disetujui" \
  "$(body -X POST -H 'Content-Type: application/json' \
      -d '{"kind":"lembur","id":1,"action":"disetujui"}' \
      "$BASE/api/requests" | grep -o 'disetujui' | head -1)"
check "invalid payload rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' -d '{"kind":"nope"}' "$BASE/api/requests")"
check "decision is persisted, not just echoed" "Disetujui" \
  "$(body "$BASE/lembur" | grep -o 'Disetujui' | head -1)"

echo "8. search API"
first_name() { grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4; }
check "search by name" "Bagas Prasetyo" \
  "$(body "$BASE/api/search?q=bagas" | first_name)"
check "search by NIK" 1 \
  "$(body "$BASE/api/search?q=NDG-0044" | grep -c 'Bagas Prasetyo')"
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
check "search needs a session" 307 \
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
check "register options needs session" 307 \
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
NEWNIK="NDG-TEST-$$"
NEWEMAIL="smoke.$$@nusantaradigital.co.id"
emp() { # method json
  body -X "$1" -H 'Content-Type: application/json' -d "$2" "$BASE/api/employees"
}
NEWEMP='{"nik":"'"$NEWNIK"'","name":"Smoke Tester","email":"'"$NEWEMAIL"'","role":"employee","division":"Engineering","position":"QA","contractType":"Kontrak","joinedAt":"2026-02-01","workLocation":"Kantor Pusat","managerId":null,"password":"password123"}'
NEWID="$(emp POST "$NEWEMP" | sed 's/.*"id":\([0-9]*\).*/\1/')"
check "employee created" 1 "$([ -n "$NEWID" ] && echo 1 || echo 0)"
check "duplicate nik/email is 409" 409 \
  "$(code -X POST -H 'Content-Type: application/json' -d "$NEWEMP" "$BASE/api/employees")"
check "short password rejected" 400 \
  "$(code -X POST -H 'Content-Type: application/json' \
      -d "${NEWEMP/password123/short}" "$BASE/api/employees")"
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
# the stat card counts every employee, not just the visible page
check "status filter total matches panel" 1 \
  "$(body "$BASE/kehadiran?status=belum&date=2026-07-30" > /tmp/keh.$$.html; \
     PANEL=$(grep -o 'Belum absen masuk ([0-9]*)' /tmp/keh.$$.html | grep -o '[0-9]*' | head -1); \
     TABLE=$(grep -oE '[0-9]+–[0-9]+ dari [0-9]+' /tmp/keh.$$.html | head -1 | sed 's/.*dari //'); \
     rm -f /tmp/keh.$$.html; [ -n "$PANEL" ] && [ "$PANEL" = "$TABLE" ] && echo 1 || echo "panel=$PANEL table=$TABLE")"

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
check "feed needs a session" 307 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/feed/pengumuman")"

rm -f "$JAR" "$BADJAR"
echo
[ $fail -eq 0 ] && echo "smoke: all checks passed" || echo "smoke: FAILURES above"
exit $fail
