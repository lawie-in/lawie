#!/usr/bin/env bash
# ---------------------------------------------------------------
# Lawie — Document Template Smoke Test Runner
# Hits POST /api/documents/generate-from-template for all 6 templates,
# captures responses, builds a CLO-readable summary.
#
# Usage:
#   bash run-all.sh                                           # Bihar payloads (default)
#   PAYLOAD_DIR=./payloads-jharkhand bash run-all.sh          # Jharkhand payloads
#   API_URL=http://localhost:4000 bash run-all.sh             # custom endpoint
# ---------------------------------------------------------------

set -uo pipefail

# --- Config -----------------------------------------------------
API_URL="${API_URL:-http://localhost:4002}"
ENDPOINT="${ENDPOINT:-${API_URL}/generate-from-template}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PAYLOAD_DIR="${PAYLOAD_DIR:-${SCRIPT_DIR}/payloads}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULTS_DIR="${SCRIPT_DIR}/results/${TIMESTAMP}"
SUMMARY_FILE="${RESULTS_DIR}/SUMMARY.md"

mkdir -p "${RESULTS_DIR}"

# --- Colors -----------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Header -----------------------------------------------------
echo "================================================================"
echo " Lawie · Document Generation Smoke Test"
echo " Endpoint:  ${ENDPOINT}"
echo " Timestamp: ${TIMESTAMP}"
echo " Output:    ${RESULTS_DIR}"
echo "================================================================"
echo ""

# --- Pre-flight: health check -----------------------------------
echo -n "Pre-flight: pinging gateway... "
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/health" || echo "000")
if [ "${HEALTH}" = "200" ]; then
  echo -e "${GREEN}OK (HTTP 200)${NC}"
else
  echo -e "${YELLOW}WARN (HTTP ${HEALTH}) — continuing anyway${NC}"
fi
echo ""

# --- Summary header ---------------------------------------------
{
  echo "# Lawie · Template Generation Test Run"
  echo ""
  echo "**Timestamp:** ${TIMESTAMP}  "
  echo "**Endpoint:** \`${ENDPOINT}\`  "
  echo "**Tested:** 6 templates  "
  echo ""
  echo "| # | Template | HTTP | Latency | Output Tokens | Notes |"
  echo "|---|----------|------|---------|---------------|-------|"
} > "${SUMMARY_FILE}"

PASS=0
FAIL=0

# --- Run each payload -------------------------------------------
for PAYLOAD in "${PAYLOAD_DIR}"/*.json; do
  FILENAME="$(basename "${PAYLOAD}" .json)"
  TEMPLATE_ID="$(grep -o '"template_id"[[:space:]]*:[[:space:]]*"[^"]*"' "${PAYLOAD}" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"

  echo "----------------------------------------------------------------"
  echo "▶  ${FILENAME}  (template_id=${TEMPLATE_ID})"
  echo "----------------------------------------------------------------"

  RESPONSE_FILE="${RESULTS_DIR}/${FILENAME}.response.json"
  HEADERS_FILE="${RESULTS_DIR}/${FILENAME}.headers.txt"
  DRAFT_FILE="${RESULTS_DIR}/${FILENAME}.draft.md"

  START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')

  # Support both gateway (X-Dev-Bypass) and direct drafting service (internal secret)
  INTERNAL_SECRET="${INTERNAL_SECRET:-0b15312a51c251bb45489a85eb7b0f02660dacee2d3ab36feaecd785a1249643}"
  HTTP_CODE=$(curl -s \
    -o "${RESPONSE_FILE}" \
    -D "${HEADERS_FILE}" \
    -w "%{http_code}" \
    --max-time 300 \
    -X POST "${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -H "X-Dev-Bypass: true" \
    -H "X-Dev-User-Plan: pro" \
    -H "x-internal-secret: ${INTERNAL_SECRET}" \
    -H "x-user-id: 000000000000000000000001" \
    -H "x-user-email: smoke@lawie.in" \
    -H "x-user-plan: pro" \
    -H "x-user-name: Smoke Test" \
    --data-binary "@${PAYLOAD}")

  END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
  LATENCY_MS=$((END_MS - START_MS))

  # Extract draft content (best-effort — works for common JSON shapes)
  if command -v jq >/dev/null 2>&1 && [ -s "${RESPONSE_FILE}" ]; then
    jq -r '.data.content // .content // .draft // .document // .text // .body // empty' "${RESPONSE_FILE}" 2>/dev/null > "${DRAFT_FILE}" || true
    TOKEN_COUNT=$(jq -r '.data.usage.output_tokens // .usage.output_tokens // .meta.tokens // "n/a"' "${RESPONSE_FILE}" 2>/dev/null || echo "n/a")
  else
    cp "${RESPONSE_FILE}" "${DRAFT_FILE}"
    TOKEN_COUNT="n/a"
  fi

  # Status print
  NOTES=""
  if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "201" ]; then
    echo -e "   Status: ${GREEN}${HTTP_CODE}${NC}   Latency: ${LATENCY_MS}ms"
    PASS=$((PASS + 1))
    if [ ! -s "${DRAFT_FILE}" ]; then
      NOTES="empty draft body"
    fi
  else
    echo -e "   Status: ${RED}${HTTP_CODE}${NC}   Latency: ${LATENCY_MS}ms"
    FAIL=$((FAIL + 1))
    NOTES="see ${FILENAME}.response.json"
  fi

  echo "${TEMPLATE_ID} | HTTP ${HTTP_CODE} | ${LATENCY_MS}ms | tokens=${TOKEN_COUNT}" \
    >> "${RESULTS_DIR}/_run.log"

  printf "| %d | \`%s\` | %s | %sms | %s | %s |\n" \
    "$((PASS + FAIL))" "${TEMPLATE_ID}" "${HTTP_CODE}" "${LATENCY_MS}" "${TOKEN_COUNT}" "${NOTES}" \
    >> "${SUMMARY_FILE}"

  echo ""
done

# --- Final summary ----------------------------------------------
{
  echo ""
  echo "---"
  echo ""
  echo "**Result:** ${PASS} passed, ${FAIL} failed (of $((PASS + FAIL)))"
  echo ""
  echo "## Files in this run"
  echo ""
  echo "Each template produced 3 files in this folder:"
  echo "- \`*.response.json\` — full HTTP response body"
  echo "- \`*.headers.txt\`   — HTTP headers"
  echo "- \`*.draft.md\`      — extracted draft content (for CLO review)"
  echo ""
  echo "## Next step"
  echo ""
  echo "Share this folder path with Ajay (CLO) for legal review:"
  echo "\`${RESULTS_DIR}\`"
} >> "${SUMMARY_FILE}"

echo "================================================================"
echo " Done."
echo " Passed: ${PASS}    Failed: ${FAIL}"
echo " Summary: ${SUMMARY_FILE}"
echo "================================================================"

if [ ${FAIL} -gt 0 ]; then
  exit 1
fi
