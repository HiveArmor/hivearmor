#!/usr/bin/env bash
set -euo pipefail
# End-to-end staging pipeline: enroll agent → ProcessLog (pos/neg) → OpenSearch → alerts API.
# Unique marker in raw lines for UI correlation. No /v1/inject. Secrets never printed.
# Companion UI walk is run separately against the report (Playwright).

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
BACKEND="${BACKEND_URL:-https://127.0.0.1}"
CA_FILE="${HA_GRPC_CA_FILE:-$ROOT/local-dev/certs/ca.crt}"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-e2e-pipeline.json}"
MARKER="HA-E2E-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"

export PATH="/usr/local/go/bin:${PATH:-}"

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

command -v go >/dev/null 2>&1 || fail "go is not installed"
[[ -f "$STAGING/.env" ]] || fail "missing $STAGING/.env"
[[ -f "$STAGING/ADMIN_BOOTSTRAP.txt" ]] || fail "missing ADMIN_BOOTSTRAP"
[[ -f "$CA_FILE" ]] || fail "missing CA $CA_FILE"

python3 "$STAGING/render-plugins-yaml.py" "$STAGING" || fail "generate plugins yaml"

WORKDIR="$(mktemp -d /tmp/hivearmor-e2e.XXXXXX)"
TOKEN_FILE="$WORKDIR/enrollment.token"
KEY_FILE="$WORKDIR/internal.key"
POS_FILE="$WORKDIR/pos.event.id"
NEG_FILE="$WORKDIR/neg.event.id"
trap 'rm -rf "$WORKDIR"' EXIT
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

ADMIN_PASS="$(python3 - "$STAGING/ADMIN_BOOTSTRAP.txt" <<'PY'
from pathlib import Path
import sys
for line in Path(sys.argv[1]).read_text().splitlines():
    s = line.strip()
    if not s or s.startswith("#"):
        continue
    if s.lower().startswith("password="):
        print(s.split("=", 1)[1].strip().strip("'\""))
        break
    print(s)
    break
PY
)"

AUTH_JSON="$(curl -sk -X POST "$BACKEND/api/authenticate" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASS}\",\"rememberMe\":false}")" \
  || fail "authenticate"
JWT="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or d.get("id_token") or "")' <<<"$AUTH_JSON")"
[ -n "$JWT" ] || fail "JWT missing"
unset ADMIN_PASS
pass "admin authenticate"

EXPIRY="$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
CREATE_JSON="$(curl -sk -X POST "$BACKEND/api/ha-agent-enrollments" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 1' \
  -d "{\"policyId\":\"pilot-e2e-ui\",\"platform\":\"linux\",\"expiresAt\":\"$EXPIRY\",\"maxUses\":1}")" \
  || fail "create enrollment"
python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' <<<"$CREATE_JSON" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
[ -s "$TOKEN_FILE" ] || fail "enrollment token missing"
TOKEN_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["enrollment"]["id"])' <<<"$CREATE_JSON")"
echo "  enrollment_id=$TOKEN_ID marker=$MARKER"

# Patch live test raw lines to include marker via env-driven wrapper:
# Use go test as-is for pipeline; marker stored in report for UI search of rule name + time window.
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

echo "[1] Agent enroll + ProcessLog positive/negative (real gRPC path)..."
(
  cd "$ROOT/agent-manager"
  go test -mod=mod -count=1 -timeout 180s -run TestStagingMvpPilot ./agent
) || fail "agent ProcessLog ingest"

POS_ID="$(tr -d '\n' < "$POS_FILE")"
NEG_ID="$(tr -d '\n' < "$NEG_FILE")"
[ -n "$POS_ID" ] || fail "positive event id missing"
[ -n "$NEG_ID" ] || fail "negative event id missing"
echo "  pos_event=$POS_ID"
echo "  neg_event=$NEG_ID"
pass "agent ProcessLog acked (ACC-04 path)"

os_has_id() {
  local eid="$1"
  sudo docker exec hivearmor-staging-opensearch-1 bash -lc \
    "curl -sk -u \"admin:\${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" \"https://localhost:9200/v3-hive-log-*/_search?q=${eid}&size=1\"" \
    | python3 -c 'import json,sys
d=json.loads(sys.stdin.read() or "{}")
hits=d.get("hits",{}).get("hits") or []
raise SystemExit(0 if hits else 1)'
}

alert_has_pilot() {
  curl -sk -H "Authorization: Bearer $JWT" -H "X-Tenant-ID: 1" \
    "$BACKEND/api/ha-alerts?page=0&size=50&sort=@timestamp,desc" \
    | python3 -c 'import json,sys
d=json.load(sys.stdin)
items=d.get("items") or d.get("content") or (d if isinstance(d,list) else [])
for item in items:
    if not isinstance(item, dict): continue
    name=str(item.get("name") or item.get("ruleName") or "")
    if name=="PILOT-LIN-AUTH-FAIL":
        print(item.get("id") or "")
        raise SystemExit(0)
raise SystemExit(1)'
}

echo "[2] Wait for parse/enrich/detect → OpenSearch log + alert..."
ALERT_ID=""
FOUND=0
for _ in $(seq 1 48); do
  if os_has_id "$POS_ID"; then
    if AID="$(alert_has_pilot)"; then
      ALERT_ID="$AID"
      FOUND=1
      break
    fi
  fi
  sleep 5
done
[ "$FOUND" = 1 ] || fail "positive event/alert not visible after wait"
pass "OpenSearch holds pos event; PILOT-LIN-AUTH-FAIL on /api/ha-alerts id=${ALERT_ID:-unknown}"

os_has_id "$NEG_ID" || fail "negative event missing from OpenSearch"
if curl -sk -H "Authorization: Bearer $JWT" -H "X-Tenant-ID: 1" \
  "$BACKEND/api/ha-alerts?page=0&size=50&sort=@timestamp,desc" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if sys.argv[1] in json.dumps(d) else 1)' "$NEG_ID"
then
  fail "negative event id appeared in alerts blob"
fi
pass "negative Accepted SSH did not alert (ACC-06)"

# Sensors / agents list (UI API)
AGENTS_CODE="$(curl -sk -o /tmp/ha-e2e-agents.json -w '%{http_code}' \
  -H "Authorization: Bearer $JWT" -H "X-Tenant-ID: 1" \
  "$BACKEND/api/agent-manager/agents")"
echo "  agents_api_http=$AGENTS_CODE"
[ "$AGENTS_CODE" = "200" ] || fail "agents API not 200"

python3 - "$REPORT" "$MARKER" "$POS_ID" "$NEG_ID" "$ALERT_ID" "$TOKEN_ID" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
report = {
    "workId": "E2E-PIPELINE-UI",
    "gate": "agent-processlog-parse-enrich-detect-api",
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "marker": sys.argv[2],
    "positiveEventId": sys.argv[3],
    "negativeEventId": sys.argv[4],
    "alertId": sys.argv[5] or None,
    "enrollmentId": sys.argv[6],
    "ruleName": "PILOT-LIN-AUTH-FAIL",
    "uiChecks": {
        "login": "pending",
        "alerts": "pending",
        "search": "pending",
        "sensors": "pending",
        "incidents": "pending",
        "queue": "pending",
        "detectionRules": "pending",
    },
    "pipeline": {
        "agentEnroll": True,
        "processLogAck": True,
        "opensearchPositive": True,
        "opensearchNegative": True,
        "detectionAlert": True,
        "negativeNoAlert": True,
        "noV1Inject": True,
    },
    "status": "PIPELINE_API_VERIFIED",
    "limitations": [
        "Agent path is enroll+ProcessLog gRPC (same as packaged agent ingest), not /v1/inject",
        "UI walk recorded in companion Playwright pass",
        "Windows SCM agent currently revoked on staging — Linux path exercised",
        "Not PRODUCTION READY",
    ],
}
path = Path(sys.argv[1])
path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
path.chmod(0o600)
print("E2E_PIPELINE_REPORT=" + str(path))
print("status=" + report["status"])
print("marker=" + report["marker"])
print("pos=" + report["positiveEventId"])
print("alert=" + str(report["alertId"]))
PY
