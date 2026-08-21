#!/usr/bin/env bash
# Category 6: data-source-aggregation
# Requirements: 12.3, plus validates 8.6, 9.2, 9.4
#
# Calls GET /api/ha-inputs/sources and asserts:
#   1. Response is a JSON array (Req 9.2)
#   2. Every element carries the required fields:
#        id, name, type, grpcStatus, opensearchStatus, eps, epsHistory, enabled
#      (Req 8.6, 9.2)
#   3. Every element's `lastEventAt` is an ISO-8601 string or null (Req 8.6)
#   4. Elapsed wall-clock time is under 3000ms (Req 9.4)
#
# Exit codes:
#   0 — all assertions passed
#   1 — any assertion failed, schema violation, or request error
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8088}"
JWT="${JWT:-}"

# ── Obtain JWT if not already set ────────────────────────────────────────────
if [[ -z "$JWT" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # Source auth.sh which must export JWT into the environment.
    # shellcheck source=scripts/integration/cat/auth.sh
    source "${SCRIPT_DIR}/auth.sh"
fi

echo "[CAT6] GET ${BASE_URL}/api/ha-inputs/sources"

# ── Time the request ──────────────────────────────────────────────────────────
# python3 is guaranteed available (Req 12.2) and gives millisecond precision
# on all platforms without relying on GNU date extensions.
start_ms=$(python3 -c "import time; print(int(time.time() * 1000))")

# Capture response body; -sf makes curl exit non-zero on HTTP 4xx/5xx errors.
# --connect-timeout 10 avoids hanging if the backend is not running.
response=$(curl -sf \
    --connect-timeout 10 \
    -H "Authorization: Bearer ${JWT}" \
    -H "Accept: application/json" \
    "${BASE_URL}/api/ha-inputs/sources") || {
    echo "[FAIL] curl request to /api/ha-inputs/sources failed (HTTP error or connection refused)" >&2
    exit 1
}

end_ms=$(python3 -c "import time; print(int(time.time() * 1000))")
elapsed=$((end_ms - start_ms))

# ── Latency assertion (Req 9.4) ───────────────────────────────────────────────
if [[ $elapsed -ge 3000 ]]; then
    echo "[FAIL] Aggregation latency ${elapsed}ms exceeds the 3000ms limit (Req 9.4)" >&2
    exit 1
fi
echo "[INFO] Aggregation completed in ${elapsed}ms (< 3000ms)"

# ── Schema assertions via python3 (Req 8.6, 9.2) ─────────────────────────────
# Pass the response body via a temp file to avoid any shell variable
# interpolation issues inside a heredoc.
tmpfile=$(mktemp /tmp/ha_cat6_XXXXXX.json)
# Guarantee cleanup on any exit path.
trap 'rm -f "${tmpfile}"' EXIT

printf '%s' "${response}" > "${tmpfile}"

python3 - "${tmpfile}" <<'PYEOF'
import sys, json, re

response_file = sys.argv[1]
with open(response_file, "r") as fh:
    raw = fh.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f"[FAIL] Response is not valid JSON: {e}", file=sys.stderr)
    sys.exit(1)

# Assert response is a JSON array (Req 9.2)
if not isinstance(data, list):
    print(f"[FAIL] Response must be a JSON array, got: {type(data).__name__}", file=sys.stderr)
    sys.exit(1)

# Required top-level fields per Req 8.6 / 9.2
REQUIRED_FIELDS = {
    "id", "name", "type", "grpcStatus", "opensearchStatus",
    "eps", "epsHistory", "enabled",
}

# ISO-8601 pattern — covers date-only and datetime with optional timezone offset.
# Examples of valid values:
#   "2024-03-15T12:34:56Z"
#   "2024-03-15T12:34:56.789+05:30"
#   "2024-03-15"
ISO8601_RE = re.compile(
    r'^\d{4}-\d{2}-\d{2}'            # date part YYYY-MM-DD (required)
    r'(?:T\d{2}:\d{2}:\d{2}'         # optional time Thh:mm:ss
    r'(?:\.\d+)?'                     # optional fractional seconds
    r'(?:Z|[+-]\d{2}:?\d{2})?)?$'    # optional timezone
)

failures = []

for idx, item in enumerate(data):
    if not isinstance(item, dict):
        failures.append(f"  Element [{idx}] is not a JSON object: got {type(item).__name__}")
        continue

    # Validate required fields are present
    for field in REQUIRED_FIELDS:
        if field not in item:
            failures.append(f"  Element [{idx}] missing required field: '{field}'")

    # Validate lastEventAt: ISO-8601 string OR null/absent
    last_event_at = item.get("lastEventAt")
    if last_event_at is not None:
        if not isinstance(last_event_at, str):
            failures.append(
                f"  Element [{idx}].lastEventAt must be an ISO-8601 string or null; "
                f"got {type(last_event_at).__name__}: {last_event_at!r}"
            )
        elif not ISO8601_RE.match(last_event_at):
            failures.append(
                f"  Element [{idx}].lastEventAt '{last_event_at}' "
                f"is not a valid ISO-8601 datetime string"
            )

if failures:
    print("[FAIL] Data source schema validation errors:", file=sys.stderr)
    for msg in failures:
        print(msg, file=sys.stderr)
    sys.exit(1)

count = len(data)
print(f"[PASS] {count} data source(s) validated — all required fields present, lastEventAt values valid")
sys.exit(0)
PYEOF

py_exit=$?
if [[ $py_exit -ne 0 ]]; then
    exit 1
fi

echo "[PASS] Category 6 (data-source-aggregation): ${elapsed}ms elapsed, schema OK"
exit 0
