#!/usr/bin/env bash
set -euo pipefail

# Staging ACC-04/05/06/10/11/14. Secrets stay in 0600 files and are never printed.
# Run on the staging VM from repo root or deploy/staging.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
BACKEND="${BACKEND_URL:-https://127.0.0.1}"
CA_FILE="${HA_GRPC_CA_FILE:-$ROOT/local-dev/certs/ca.crt}"
CURL_TLS=( )
if [[ "$BACKEND" == https://* ]]; then
  CURL_TLS=(-k)
fi

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

command -v go >/dev/null 2>&1 || fail "go is not installed"
command -v python3 >/dev/null 2>&1 || fail "python3 is not installed"
[[ -f "$STAGING/.env" ]] || fail "missing $STAGING/.env"
[[ -f "$STAGING/ADMIN_BOOTSTRAP.txt" ]] || fail "missing $STAGING/ADMIN_BOOTSTRAP.txt"
[[ -f "$CA_FILE" ]] || fail "missing CA $CA_FILE"

python3 "$STAGING/render-plugins-yaml.py" "$STAGING" || fail "generate hivearmor_plugins.yaml"

WORKDIR="$(mktemp -d /tmp/hivearmor-staging-acc.XXXXXX)"
TOKEN_FILE="$WORKDIR/enrollment.token"
KEY_FILE="$WORKDIR/internal.key"
POS_FILE="$WORKDIR/pos.event.id"
NEG_FILE="$WORKDIR/neg.event.id"
trap 'rm -f "$TOKEN_FILE" "$KEY_FILE" "$POS_FILE" "$NEG_FILE"; rmdir "$WORKDIR" 2>/dev/null || true' EXIT
umask 077

python3 - "$STAGING/.env" "$KEY_FILE" <<'PY' || fail "extract INTERNAL_KEY"
from pathlib import Path
import sys
env, out = Path(sys.argv[1]), Path(sys.argv[2])
for line in env.read_text().splitlines():
    if line.startswith("INTERNAL_KEY="):
        val = line.split("=", 1)[1].strip().strip("'\"")
        out.write_text(val)
        out.chmod(0o600)
        raise SystemExit(0)
raise SystemExit("INTERNAL_KEY missing")
PY

ADMIN_PASS="$(cat "$STAGING/ADMIN_BOOTSTRAP.txt")"
AUTH_JSON="$(curl -sf "${CURL_TLS[@]}" -X POST "$BACKEND/api/authenticate" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\",\"rememberMe\":false}")" \
  || fail "backend authenticate"
JWT="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or d.get("id_token") or "")' <<<"$AUTH_JSON")"
[ -n "$JWT" ] || fail "JWT missing"
unset ADMIN_PASS

EXPIRY="$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
CREATE_JSON="$(curl -sf "${CURL_TLS[@]}" -X POST "$BACKEND/api/ha-agent-enrollments" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 1' \
  -d "{\"policyId\":\"pilot-staging-mvp\",\"platform\":\"linux\",\"expiresAt\":\"$EXPIRY\",\"maxUses\":1}")" \
  || fail "create enrollment token"
python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' <<<"$CREATE_JSON" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
[ -s "$TOKEN_FILE" ] || fail "enrollment token missing"
TOKEN_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["enrollment"]["id"])' <<<"$CREATE_JSON")"
echo "  enrollment token id $TOKEN_ID (secret not printed)"

: > "$POS_FILE"
: > "$NEG_FILE"
chmod 600 "$POS_FILE" "$NEG_FILE"

export HA_RUN_STAGING_MVP=1
export HA_ENROLLMENT_TOKEN_FILE="$TOKEN_FILE"
export HA_INTERNAL_KEY_FILE="$KEY_FILE"
export HA_GRPC_CA_FILE="$CA_FILE"
export HA_GRPC_SERVER_NAME="${HA_GRPC_SERVER_NAME:-localhost}"
export HA_GRPC_ADDRESS="${HA_GRPC_ADDRESS:-127.0.0.1:9000}"
export HA_INPUTS_ADDRESS="${HA_INPUTS_ADDRESS:-127.0.0.1:50051}"
export HA_INPUTS_CA_FILE="${HA_INPUTS_CA_FILE:-$CA_FILE}"
export HA_INPUTS_SERVER_NAME="${HA_INPUTS_SERVER_NAME:-localhost}"
export HA_LIVE_EVENT_ID_FILE="$POS_FILE"
export HA_LIVE_NEG_EVENT_ID_FILE="$NEG_FILE"
export GOCACHE="${GOCACHE:-/tmp/hivearmor-staging-go-cache}"

echo "[1] Enroll + ProcessLog positive/negative + forged tenant + revoke..."
(
  cd "$ROOT/agent-manager"
  go test -mod=mod -count=1 -timeout 180s -run TestStagingMvpPilot ./agent
) || fail "staging MVP ingest test"

POS_ID="$(tr -d '\n' < "$POS_FILE")"
NEG_ID="$(tr -d '\n' < "$NEG_FILE")"
[ -n "$POS_ID" ] || fail "positive event id missing"
[ -n "$NEG_ID" ] || fail "negative event id missing"
echo "  positive event id $POS_ID"
echo "  negative event id $NEG_ID"
pass "ACC-04 ProcessLog accepted; ACC-10 forged tenant denied; ACC-11 revoke denied"

echo "[2] Enrollment token absent from worker logs..."
python3 - "$TOKEN_FILE" <<'PY' || fail "enrollment token appeared in worker logs"
import pathlib, subprocess, sys
token = pathlib.Path(sys.argv[1]).read_text().strip()
logs = subprocess.check_output(
    ["sudo", "docker", "logs", "hivearmor-staging-eventprocessor-worker-1", "--since", "10m"],
    stderr=subprocess.STDOUT,
)
if token.encode() in logs:
    raise SystemExit(1)
print("  PASS  enrollment token absent from worker logs")
PY

os_has_id() {
  local index_pat="$1"
  local eid="$2"
  sudo docker exec hivearmor-staging-opensearch-1 bash -lc \
    "curl -sk -u \"admin:\${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" \"https://localhost:9200/${index_pat}/_search?q=${eid}&size=1\"" \
    | python3 -c 'import json,sys
raw=sys.stdin.read().strip()
if not raw:
    raise SystemExit(1)
d=json.loads(raw)
total=d.get("hits",{}).get("total",0)
n=total.get("value",0) if isinstance(total,dict) else total
hits=d.get("hits",{}).get("hits") or []
raise SystemExit(0 if n or hits else 1)'
}

alert_named_pilot() {
  curl -sf "${CURL_TLS[@]}" -H "Authorization: Bearer $JWT" -H "X-Tenant-ID: 1" \
    "$BACKEND/api/ha-alerts?page=0&size=50&sort=@timestamp,desc" \
    | python3 -c 'import json,sys
d=json.load(sys.stdin)
for item in d.get("items") or []:
    if isinstance(item, dict) and str(item.get("name") or item.get("ruleName") or "") == "PILOT-LIN-AUTH-FAIL":
        raise SystemExit(0)
raise SystemExit(1)'
}

alert_blob_has() {
  local needle="$1"
  curl -sf "${CURL_TLS[@]}" -H "Authorization: Bearer $JWT" -H "X-Tenant-ID: 1" \
    "$BACKEND/api/ha-alerts?page=0&size=50&sort=@timestamp,desc" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if sys.argv[1] in json.dumps(d) else 1)' "$needle"
}

echo "[3] Wait for PILOT-LIN-AUTH-FAIL on /alerts (no /v1/inject)..."
FOUND=0
for i in $(seq 1 36); do
  if os_has_id "v3-hive-log-*" "$POS_ID" && alert_named_pilot; then
    FOUND=1
    break
  fi
  sleep 5
done
[ "$FOUND" = 1 ] || fail "positive PILOT-LIN-AUTH-FAIL not on /api/ha-alerts"
pass "ACC-05 positive PILOT-LIN-AUTH-FAIL on /alerts"

os_has_id "v3-hive-log-*" "$NEG_ID" || fail "negative SSH event missing from OpenSearch"
if alert_blob_has "$NEG_ID"; then
  fail "negative Accepted SSH created PILOT-LIN-AUTH-FAIL"
fi
pass "ACC-06 accepted SSH did not create that rule's alert"

INJECT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 http://127.0.0.1:8080/v1/inject || true)"
if [[ "$INJECT_CODE" == "000" || "$INJECT_CODE" == "" ]]; then
  pass "ACC-14 /v1/inject not published on host"
else
  fail "ACC-14 unexpected inject HTTP $INJECT_CODE"
fi

echo "=== staging ACC-04/05/06/10/11/14 passed ==="
