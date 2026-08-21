#!/usr/bin/env bash
# Category 2: authentication (Req 12.3, validates JWT acquisition)
#
# POSTs admin credentials to /api/authenticate and exports JWT.
# The JWT is written to a temp file so subsequent category scripts can pick
# it up even when sourced from a different sub-shell context.
#
# Runtime dependencies: bash, curl, python3 — nothing else (Req 12.2)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-localdev123!}"

# Phase-1 runner passes a shared temp directory via PHASE1_TMP if available;
# fall back to a predictable path in /tmp.
JWT_FILE="${PHASE1_TMP:-/tmp/hivearmor_phase1}/jwt.env"

echo "[CAT2] Authenticating as '${ADMIN_USER}' at ${BASE_URL}/api/authenticate"

response=$(curl -sf --max-time 15 -X POST "${BASE_URL}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\",\"rememberMe\":false}") || {
    echo "[FAIL] curl request to /api/authenticate failed (server unreachable or HTTP error)" >&2
    exit 1
}

jwt=$(echo "${response}" | python3 -c "
import json, sys
try:
    token = json.load(sys.stdin)['id_token']
    if not token:
        raise ValueError('id_token is empty')
    print(token)
except (KeyError, ValueError) as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
") || {
    echo "[FAIL] Failed to extract id_token from /api/authenticate response" >&2
    exit 1
}

# Export into current shell environment (used when this script is sourced)
export JWT="${jwt}"

# Also persist to a file so subsequent scripts launched as sub-shells can load it
mkdir -p "$(dirname "${JWT_FILE}")"
echo "JWT='${jwt}'" > "${JWT_FILE}"
chmod 600 "${JWT_FILE}"

echo "[PASS] Authentication OK; JWT acquired and exported"
exit 0
