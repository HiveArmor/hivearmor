#!/usr/bin/env bash
# Category 5: api-key CRUD with token format assertion (Req 12.3, validates 5.2, 5.5, 5.6, 6.3, 6.4)
#
# Assertions:
#   1. POST /api/ha-admin/api-keys     — response includes plaintext token matching ha_[A-Za-z0-9_-]{40}
#   2. GET  /api/ha-admin/api-keys     — response is an array; no element contains `token` or `keyHash`
#   3. DELETE /api/ha-admin/api-keys/{id} — HTTP 204
#   4. GET  /api/ha-admin/api-keys/{id}   — status equals "revoked"
#
# Requires JWT from Category 2. Loads it from $JWT env var if set, otherwise
# reads from the shared temp file written by authentication.sh.
#
# Runtime dependencies: bash, curl, python3 — nothing else (Req 12.2)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088}"
JWT_FILE="${PHASE1_TMP:-/tmp/hivearmor_phase1}/jwt.env"

# ── Resolve JWT ──────────────────────────────────────────────────────────────
if [[ -z "${JWT:-}" ]]; then
    if [[ -f "${JWT_FILE}" ]]; then
        # shellcheck source=/dev/null
        source "${JWT_FILE}"
    fi
fi

if [[ -z "${JWT:-}" ]]; then
    echo "[FAIL] JWT is not set. Run Category 2 (authentication) first." >&2
    exit 1
fi

AUTH_HEADER="Authorization: Bearer ${JWT}"

# Tracks the created key id for cleanup even on failure
_CREATED_KEY_ID=""

# ── Cleanup trap: revoke/delete any test key that was created ────────────────
cleanup() {
    if [[ -n "${_CREATED_KEY_ID}" ]]; then
        curl -sf --max-time 15 -X DELETE "${BASE_URL}/api/ha-admin/api-keys/${_CREATED_KEY_ID}" \
            -H "${AUTH_HEADER}" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

# ── Helper: curl with auth ───────────────────────────────────────────────────
# ha_curl <method> <path> [extra curl args...]
ha_curl() {
    local method="$1"
    local path="$2"
    shift 2
    curl -sf --max-time 15 -X "${method}" "${BASE_URL}${path}" \
        -H "${AUTH_HEADER}" \
        -H "Content-Type: application/json" \
        "$@"
}

# ════════════════════════════════════════════════════════════════════════════
# Test 5.1 — POST /api/ha-admin/api-keys: create key, assert token format
# Validates: Requirement 5.2
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT5] Test 5.1: POST /api/ha-admin/api-keys — create key, assert token format (Req 5.2)"

create_response=$(ha_curl POST /api/ha-admin/api-keys \
    -d '{"name":"phase1-test-key","scopes":["read_alerts"]}') || {
    echo "[FAIL] POST /api/ha-admin/api-keys failed (HTTP error or unreachable)" >&2
    exit 1
}

# Extract token and id from the creation response
create_result=$(echo "${create_response}" | python3 -c "
import json, sys

try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

errors = []

token = data.get('token', '')
if not token:
    errors.append('Response does not contain a non-empty \"token\" field')

key_id = data.get('id', '')
if not key_id:
    errors.append('Response does not contain a non-empty \"id\" field')

if errors:
    for err in errors:
        print('[FAIL] ' + err, file=sys.stderr)
    sys.exit(1)

# Emit token and id separated by a newline so the shell can read them
print(token)
print(key_id)
") || {
    echo "[FAIL] Failed to extract token/id from POST /api/ha-admin/api-keys response" >&2
    exit 1
}

token=$(echo "${create_result}" | sed -n '1p')
key_id=$(echo "${create_result}" | sed -n '2p')

# Register id for cleanup trap now that we have it
_CREATED_KEY_ID="${key_id}"

# Assert token format: ha_ followed by exactly 40 URL-safe base64 chars (Req 5.2)
python3 -c "
import re, sys
token = sys.argv[1]
if not re.fullmatch(r'ha_[A-Za-z0-9_\-]{40}', token):
    print('[FAIL] Token does not match ha_[A-Za-z0-9_-]{40}: ' + repr(token), file=sys.stderr)
    sys.exit(1)
print('OK: token=' + token[:10] + '...')
" "${token}" || {
    echo "[FAIL] Token format assertion failed (Req 5.2)" >&2
    exit 1
}

echo "[PASS] Test 5.1: Token created and matches ha_[A-Za-z0-9_-]{40} (Req 5.2)"

# ════════════════════════════════════════════════════════════════════════════
# Test 5.2 — GET /api/ha-admin/api-keys: array, no token/keyHash fields
# Validates: Requirements 5.5, 5.6
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT5] Test 5.2: GET /api/ha-admin/api-keys — array without token or keyHash (Req 5.5, 5.6)"

list_response=$(ha_curl GET /api/ha-admin/api-keys) || {
    echo "[FAIL] GET /api/ha-admin/api-keys failed (HTTP error or unreachable)" >&2
    exit 1
}

list_check=$(echo "${list_response}" | python3 -c "
import json, sys

try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

# Response must be a JSON array (Req 5.5)
if not isinstance(data, list):
    print('[FAIL] GET /api/ha-admin/api-keys did not return a JSON array (got: ' + type(data).__name__ + ')', file=sys.stderr)
    sys.exit(1)

errors = []
for i, record in enumerate(data):
    if not isinstance(record, dict):
        errors.append('Element [' + str(i) + '] is not a JSON object')
        continue
    # Req 5.5 — token must not appear
    if 'token' in record:
        errors.append('Element [' + str(i) + '] contains forbidden field \"token\"')
    # Req 5.6 — keyHash must not appear
    if 'keyHash' in record:
        errors.append('Element [' + str(i) + '] contains forbidden field \"keyHash\"')
    if 'key_hash' in record:
        errors.append('Element [' + str(i) + '] contains forbidden field \"key_hash\"')

if errors:
    for err in errors:
        print('[FAIL] ' + err, file=sys.stderr)
    sys.exit(1)

print('OK: ' + str(len(data)) + ' record(s), no token/keyHash fields')
") || {
    echo "[FAIL] List assertion failed on GET /api/ha-admin/api-keys (Req 5.5, 5.6)" >&2
    exit 1
}

echo "[PASS] Test 5.2: ${list_check} (Req 5.5, 5.6)"

# ════════════════════════════════════════════════════════════════════════════
# Test 5.3 — DELETE /api/ha-admin/api-keys/{id}: assert HTTP 204
# Validates: Requirement 6.4
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT5] Test 5.3: DELETE /api/ha-admin/api-keys/${key_id} — assert HTTP 204 (Req 6.4)"

# Use -w to capture HTTP status; -o /dev/null to suppress body output
delete_status=$(curl -s --max-time 15 -X DELETE "${BASE_URL}/api/ha-admin/api-keys/${key_id}" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -o /dev/null \
    -w "%{http_code}") || {
    echo "[FAIL] curl request to DELETE /api/ha-admin/api-keys/${key_id} failed" >&2
    exit 1
}

if [[ "${delete_status}" != "204" ]]; then
    echo "[FAIL] DELETE /api/ha-admin/api-keys/${key_id} returned HTTP ${delete_status}; expected 204 (Req 6.4)" >&2
    exit 1
fi

echo "[PASS] Test 5.3: DELETE returned HTTP 204 (Req 6.4)"

# ════════════════════════════════════════════════════════════════════════════
# Test 5.4 — GET /api/ha-admin/api-keys/{id}: assert status=revoked
# Validates: Requirements 6.3, 6.4
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT5] Test 5.4: GET /api/ha-admin/api-keys/${key_id} — assert status=revoked (Req 6.3, 6.4)"

get_by_id_response=$(ha_curl GET "/api/ha-admin/api-keys/${key_id}") || {
    echo "[FAIL] GET /api/ha-admin/api-keys/${key_id} failed (HTTP error or unreachable)" >&2
    exit 1
}

get_by_id_check=$(echo "${get_by_id_response}" | python3 -c "
import json, sys

try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

errors = []

# Req 6.3 — status must be 'revoked' after DELETE
status = data.get('status', '')
if status != 'revoked':
    errors.append('Expected status=\"revoked\" but got: ' + repr(status))

# Req 5.6 — GET by id must also never expose token or keyHash
if 'token' in data:
    errors.append('Response contains forbidden field \"token\"')
if 'keyHash' in data:
    errors.append('Response contains forbidden field \"keyHash\"')
if 'key_hash' in data:
    errors.append('Response contains forbidden field \"key_hash\"')

if errors:
    for err in errors:
        print('[FAIL] ' + err, file=sys.stderr)
    sys.exit(1)

print('OK: status=' + status)
") || {
    echo "[FAIL] Status assertion failed on GET /api/ha-admin/api-keys/${key_id} (Req 6.3, 6.4)" >&2
    exit 1
}

echo "[PASS] Test 5.4: ${get_by_id_check} (Req 6.3, 6.4)"

# Cleanup trap will fire on EXIT; key is already revoked so DELETE is idempotent or a no-op
echo ""
echo "[PASS] Category 5 (api-key-crud): all assertions passed"
exit 0
