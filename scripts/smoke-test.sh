#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "== BestDoctor smoke test =="
echo "BASE_URL=$BASE_URL"
echo

echo "[1/4] healthz"
curl -fsS "$BASE_URL/healthz"
echo
echo "OK"
echo

echo "[2/4] homepage"
curl -fsS -o /tmp/bestdoctor-home.html "$BASE_URL/"
grep -q "BestDoctor" /tmp/bestdoctor-home.html
echo "OK"
echo

echo "[3/4] Health160 search"
SEARCH_RESULT="$(curl -fsS "$BASE_URL/health160/search?city=sz&department_code=A05")"
echo "$SEARCH_RESULT" | head -c 600
echo
if ! echo "$SEARCH_RESULT" | grep -q '"results"'; then
  echo "ERROR: search response has no results field" >&2
  exit 1
fi
echo "OK (response structure)"
echo

echo "[4/4] chat"
CHAT_RESULT="$(curl -fsS -X POST "$BASE_URL/chat" \
  -H 'content-type: application/json' \
  -d '{"city":"深圳","message":"最近经常头晕，偶尔手麻，应该找什么医生？"}')"
echo "$CHAT_RESULT" | head -c 1000
echo
if ! echo "$CHAT_RESULT" | grep -Eq '"answer"|"error"'; then
  echo "ERROR: chat response has neither answer nor error" >&2
  exit 1
fi

echo
echo "Smoke test finished."
