#!/usr/bin/env bash
# End-to-end smoke test against a running server.
# Usage: BASE=http://localhost:3000 ./scripts/smoke.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-andini.rahmawati@nusantaradigital.co.id}"
PASS="${PASS:-password123}"
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
for p in kehadiran cuti lembur karyawan pengumuman berkas laporan; do
  check "/$p" 200 "$(code "$BASE/$p")"
done
check "/kehadiran?tab=recap" 200 "$(code "$BASE/kehadiran?tab=recap")"
check "/karyawan?open=1 (drawer)" 200 "$(code "$BASE/karyawan?open=1")"

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
check "csv row count (16 karyawan + header)" 17 "$(printf '%s' "$CSV" | grep -c .)"
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
check "search by division returns many" 4 \
  "$(body "$BASE/api/search?q=Engineering" | grep -o '"id":' | grep -c .)"
check "case-insensitive" 1 "$(body "$BASE/api/search?q=CITRA" | grep -c 'Citra Maharani')"
check "single char returns nothing" "[]" "$(body "$BASE/api/search?q=a" | sed 's/{"hits":\(.*\)}/\1/')"
check "no match returns empty" "[]" \
  "$(body "$BASE/api/search?q=zzzznotarealname" | sed 's/{"hits":\(.*\)}/\1/')"
check "wildcard is escaped, not injected" "[]" \
  "$(body "$BASE/api/search?q=%25%25" | sed 's/{"hits":\(.*\)}/\1/')"
check "prefix match ranks first" "Maya Sari" \
  "$(body "$BASE/api/search?q=Ma" | first_name)"
check "hit carries today status" 1 "$(body "$BASE/api/search?q=bagas" | grep -c '"status":"telat"')"
check "search needs a session" 307 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/search?q=bagas")"

echo "9. reminder email endpoint"
check "remind sends to 3 absentees" 3 \
  "$(body -X POST -H 'Content-Type: application/json' \
      -d '{"ids":[10,13,16],"date":"2026-07-30"}' \
      "$BASE/api/remind" | sed 's/.*"sent":\([0-9]*\).*/\1/')"

rm -f "$JAR" "$BADJAR"
echo
[ $fail -eq 0 ] && echo "smoke: all checks passed" || echo "smoke: FAILURES above"
exit $fail
