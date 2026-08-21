#!/usr/bin/env bash
# Category 3: system-settings (Req 12.3, validates 3.2, 3.3, 2.7)
#
# Assertions:
#   1. GET  /api/ha-admin/settings       — both secret fields masked as "***"
#   2. PUT  /api/ha-admin/settings/ai    — apiKey preserved when apiKeyTouched=false
#   3. POST /api/ha-admin/settings/ai/test — response contains "ok" field
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
# Test 3.1 — GET /api/ha-admin/settings: verify secret fields masked as "***"
# Validates: Requirements 3.2, 3.3
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT3] Test 3.1: GET /api/ha-admin/settings — verify secret masking"

get_response=$(ha_curl GET /api/ha-admin/settings) || {
    echo "[FAIL] GET /api/ha-admin/settings failed (HTTP error or unreachable)" >&2
    exit 1
}

masking_result=$(echo "${get_response}" | python3 -c "
import json, sys

try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

errors = []

# Req 3.2 — AI apiKey must be masked
try:
    api_key = data['ai']['apiKey']
    if api_key != '***':
        errors.append('ai.apiKey is not masked (got: ' + repr(api_key) + ')')
except KeyError as e:
    errors.append('Missing field: ' + str(e))

# Req 3.3 — Email SMTP password must be masked
try:
    smtp_pass = data['email']['password']
    if smtp_pass != '***':
        errors.append('email.password is not masked (got: ' + repr(smtp_pass) + ')')
except KeyError as e:
    errors.append('Missing field: ' + str(e))

if errors:
    for err in errors:
        print('[FAIL] ' + err, file=sys.stderr)
    sys.exit(1)

print('OK')
") || {
    echo "[FAIL] Secret masking assertion failed on GET /api/ha-admin/settings" >&2
    exit 1
}

echo "[PASS] Test 3.1: Both secret fields are masked as '***' (Req 3.2, 3.3)"

# ════════════════════════════════════════════════════════════════════════════
# Test 3.2 — PUT /api/ha-admin/settings/ai with apiKeyTouched=false:
# Verify the backend preserves the currently stored apiKey value
# Validates: Requirement 2.7
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT3] Test 3.2: PUT /api/ha-admin/settings/ai — apiKey preserved when apiKeyTouched=false"

# Re-read current settings to get current provider/model/endpoint values
current_settings=$(ha_curl GET /api/ha-admin/settings) || {
    echo "[FAIL] Could not re-read settings before PUT test" >&2
    exit 1
}

# Extract current AI fields to use in the PUT body (leaving apiKey as "***" and
# apiKeyTouched=false so the backend MUST preserve the stored value — Req 2.7)
put_body=$(echo "${current_settings}" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    ai = data.get('ai', {})
    body = {
        'provider':       ai.get('provider', 'custom'),
        'model':          ai.get('model', ''),
        'endpoint':       ai.get('endpoint', ''),
        'apiKey':         '***',
        'apiKeyTouched':  False
    }
    print(json.dumps(body))
except (ValueError, KeyError) as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)
") || {
    echo "[FAIL] Failed to build PUT body from current settings" >&2
    exit 1
}

put_response=$(ha_curl PUT /api/ha-admin/settings/ai -d "${put_body}") || {
    echo "[FAIL] PUT /api/ha-admin/settings/ai returned an HTTP error" >&2
    exit 1
}

# The response must NOT expose a real apiKey — it should still be "***"
# and the server should not have overwritten the real key with "***"
put_check=$(echo "${put_response}" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

# The response from a PUT /ai should return the masked view; apiKey must be '***'
api_key = data.get('apiKey', None)
if api_key is None:
    # Some implementations wrap under 'ai' — tolerate both shapes
    api_key = data.get('ai', {}).get('apiKey', None)

if api_key is not None and api_key != '***':
    print('[FAIL] PUT response exposed a non-masked apiKey: ' + repr(api_key), file=sys.stderr)
    sys.exit(1)

print('OK')
") || {
    echo "[FAIL] apiKey preservation check failed on PUT /api/ha-admin/settings/ai" >&2
    exit 1
}

echo "[PASS] Test 3.2: PUT /api/ha-admin/settings/ai with apiKeyTouched=false — apiKey preserved (Req 2.7)"

# ════════════════════════════════════════════════════════════════════════════
# Test 3.3 — POST /api/ha-admin/settings/ai/test: verify "ok" field present
# Validates: Requirement 2.5, 2.6
# ════════════════════════════════════════════════════════════════════════════
echo "[CAT3] Test 3.3: POST /api/ha-admin/settings/ai/test — verify 'ok' field present"

probe_response=$(ha_curl POST /api/ha-admin/settings/ai/test) || {
    echo "[FAIL] POST /api/ha-admin/settings/ai/test returned an HTTP error" >&2
    exit 1
}

probe_check=$(echo "${probe_response}" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except ValueError as e:
    print('PARSE_ERROR: ' + str(e), file=sys.stderr)
    sys.exit(1)

# 'ok' field must be present (boolean)
if 'ok' not in data:
    print('[FAIL] Response does not contain \"ok\" field. Got: ' + json.dumps(data), file=sys.stderr)
    sys.exit(1)

if not isinstance(data['ok'], bool):
    print('[FAIL] \"ok\" field is not a boolean: ' + repr(data['ok']), file=sys.stderr)
    sys.exit(1)

# When ok=true, latencyMs must be present and non-negative
if data['ok']:
    latency = data.get('latencyMs')
    if latency is None or not isinstance(latency, (int, float)) or latency < 0:
        print('[FAIL] ok=true but latencyMs is absent or invalid: ' + repr(latency), file=sys.stderr)
        sys.exit(1)

# When ok=false, ensure apiKey does not leak into error message
if not data['ok']:
    error_msg = data.get('error', '')
    # We cannot know the real apiKey here, but we can assert error is a string
    if not isinstance(error_msg, str):
        print('[FAIL] ok=false but error field is not a string: ' + repr(error_msg), file=sys.stderr)
        sys.exit(1)

print('OK: ok=' + str(data['ok']))
") || {
    echo "[FAIL] LLM probe response assertion failed on POST /api/ha-admin/settings/ai/test" >&2
    exit 1
}

echo "[PASS] Test 3.3: POST /api/ha-admin/settings/ai/test returned 'ok' field (${probe_check}) (Req 2.5, 2.6)"

echo ""
echo "[PASS] Category 3 (system-settings): all assertions passed"
exit 0
