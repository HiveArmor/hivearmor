#!/usr/bin/env bash
# Category 1: backend-health (Req 12.3, validates health endpoint availability)
#
# Calls GET /management/health and asserts status == "UP".
# Runtime dependencies: bash, curl, python3 — nothing else (Req 12.2)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088}"

echo "[CAT1] Probing backend health at ${BASE_URL}/management/health"

response=$(curl -sf --max-time 10 "${BASE_URL}/management/health") || {
    echo "[FAIL] curl request to /management/health failed (server unreachable or HTTP error)" >&2
    exit 1
}

status=$(echo "${response}" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data['status'])
except (KeyError, ValueError) as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
") || {
    echo "[FAIL] Failed to parse JSON response from /management/health" >&2
    exit 1
}

if [[ "${status}" == "UP" ]]; then
    echo "[PASS] Backend health: UP"
    exit 0
else
    echo "[FAIL] Backend health status is not UP: got '${status}'" >&2
    exit 1
fi
