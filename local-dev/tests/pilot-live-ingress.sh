#!/usr/bin/env bash
set -euo pipefail

# Live PILOT-02/03 acceptance against rebuilt local-dev services.
# Secrets are written only to 0600 temp files and never printed.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="${BACKEND_URL:-http://localhost:8088}"
CA_FILE="${HA_GRPC_CA_FILE:-$ROOT/local-dev/certs/ca.crt}"
WORKDIR="$(mktemp -d /tmp/hivearmor-pilot-live.XXXXXX)"
TOKEN_FILE="$WORKDIR/enrollment.token"
KEY_FILE="$WORKDIR/internal.key"
EVENT_FILE="$WORKDIR/event.id"
trap 'rm -f "$TOKEN_FILE" "$KEY_FILE" "$EVENT_FILE"; rmdir "$WORKDIR" 2>/dev/null || true' EXIT

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

echo "=== HiveArmor PILOT-02/03 live ingress ==="

umask 077
printf '%s' 'local-dev-internal-key-do-not-use-in-prod-12345678' > "$KEY_FILE"
chmod 600 "$KEY_FILE"

AUTH_JSON="$(curl -sf -X POST "$BACKEND/api/authenticate" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}')" \
  || fail "backend authenticate"
JWT="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or d.get("id_token") or "")' <<<"$AUTH_JSON")"
[ -n "$JWT" ] || fail "JWT missing from authenticate"

EXPIRY="$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
CREATE_JSON="$(curl -sf -X POST "$BACKEND/api/ha-agent-enrollments" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 1' \
  -d "{\"policyId\":\"pilot-live-ingress\",\"platform\":\"linux\",\"expiresAt\":\"$EXPIRY\",\"maxUses\":1}")" \
  || fail "create enrollment token"
python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' <<<"$CREATE_JSON" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
[ -s "$TOKEN_FILE" ] || fail "enrollment token missing"
TOKEN_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["enrollment"]["id"])' <<<"$CREATE_JSON")"
echo "  token id $TOKEN_ID (secret not printed)"

export HA_RUN_INGRESS_LIVE=1
export HA_ENROLLMENT_TOKEN_FILE="$TOKEN_FILE"
export HA_INTERNAL_KEY_FILE="$KEY_FILE"
export HA_GRPC_CA_FILE="$CA_FILE"
export HA_GRPC_SERVER_NAME=localhost
export HA_GRPC_ADDRESS=127.0.0.1:9000
export HA_INPUTS_ADDRESS=127.0.0.1:50051
export HA_LIVE_EVENT_ID_FILE="$EVENT_FILE"
export GOCACHE=/tmp/hivearmor-pilot-live-go-cache

echo "[1] Identity ingest, forged tenant, oversize, rate-limit, revoke..."
(
  cd "$ROOT/agent-manager"
  go test -mod=mod -count=1 -timeout 120s -run TestLiveIdentityIngress ./agent
) || fail "live identity ingest"

EVENT_ID="$(tr -d '\n' < "$EVENT_FILE" 2>/dev/null || true)"
[ -n "$EVENT_ID" ] && echo "  accepted event id $EVENT_ID"

echo "[2] Secret-free worker logs..."
python3 - "$TOKEN_FILE" <<'PY' || fail "enrollment token appeared in worker logs"
import pathlib, subprocess, sys
token = pathlib.Path(sys.argv[1]).read_text().strip()
logs = subprocess.check_output(["docker", "logs", "local-dev-eventprocessor-worker-1", "--since", "5m"], stderr=subprocess.STDOUT)
if token.encode() in logs:
    raise SystemExit(1)
print("  PASS  enrollment token absent from worker logs")
PY

consume_topic() {
  local topic="$1"
  python3 - "$topic" <<'PY'
import subprocess, sys
topic = sys.argv[1]
cmd = [
    "docker", "exec", "hivearmor-redpanda", "rpk", "topic", "consume", topic,
    "-n", "50", "--offset", "start", "--format", "%v\n",
]
try:
    out = subprocess.check_output(cmd, timeout=12, stderr=subprocess.STDOUT)
except subprocess.TimeoutExpired as exc:
    out = exc.output or b""
except subprocess.CalledProcessError as exc:
    out = exc.output or b""
sys.stdout.buffer.write(out)
PY
}

topic_end_offset() {
  python3 - "$1" <<'PY'
import subprocess, sys
topic = sys.argv[1]
cmd = [
    "docker", "exec", "hivearmor-redpanda", "rpk", "topic", "consume", topic,
    "--offset", "-1", "-n", "1", "--format", "%o\n",
]
try:
    out = subprocess.check_output(cmd, timeout=8, stderr=subprocess.STDOUT)
except subprocess.TimeoutExpired as exc:
    out = exc.output or b""
except subprocess.CalledProcessError as exc:
    out = exc.output or b""
sys.stdout.buffer.write(out)
PY
}

echo "[3] Malformed record quarantine..."
MARKER="pilot-quarantine-$(date +%s)"
printf '{"schemaVersion":"nope","marker":"%s"}\n' "$MARKER" | docker exec -i hivearmor-redpanda rpk topic produce hivearmor.raw.events --key "1:pilot-quarantine" >/dev/null
for i in $(seq 1 15); do
  QOUT="$(consume_topic hivearmor.raw.events.quarantine || true)"
  if echo "$QOUT" | grep -q "$MARKER"; then
    pass "malformed record appeared on hivearmor.raw.events.quarantine"
    break
  fi
  sleep 2
  if [ "$i" = 15 ]; then
    docker logs local-dev-eventprocessor-worker-1 --since 2m 2>&1 | grep -i 'kafka:' | tail -n 5 || true
    fail "malformed record not found on quarantine topic"
  fi
done

echo "[4] Worker restart after acknowledged send..."
BEFORE="$(topic_end_offset hivearmor.raw.events)"
[ -n "$BEFORE" ] || fail "could not read hivearmor.raw.events end offset"
docker compose -f "$ROOT/local-dev/docker-compose.yml" restart eventprocessor-worker >/dev/null
for i in $(seq 1 30); do
  st=$(docker inspect -f '{{.State.Health.Status}}' local-dev-eventprocessor-worker-1 2>/dev/null || echo starting)
  [ "$st" = healthy ] && break
  sleep 2
done
st=$(docker inspect -f '{{.State.Health.Status}}' local-dev-eventprocessor-worker-1)
[ "$st" = healthy ] || fail "worker did not return healthy after restart"
AFTER="$(topic_end_offset hivearmor.raw.events)"
if [ -n "$AFTER" ] && [ "$AFTER" -ge "$BEFORE" ]; then
  pass "raw.events retained end offset $AFTER after worker restart (before=$BEFORE)"
else
  fail "raw.events shrank after worker restart before=$BEFORE after=$AFTER"
fi

echo "[5] Consumer restart retains quarantine..."
docker compose -f "$ROOT/local-dev/docker-compose.yml" restart eventprocessor >/dev/null
for i in $(seq 1 40); do
  st=$(docker inspect -f '{{.State.Health.Status}}' local-dev-eventprocessor-1 2>/dev/null || echo starting)
  [ "$st" = healthy ] && break
  sleep 2
done
st=$(docker inspect -f '{{.State.Health.Status}}' local-dev-eventprocessor-1)
[ "$st" = healthy ] || fail "eventprocessor did not return healthy after restart"
QOUT2="$(consume_topic hivearmor.raw.events.quarantine || true)"
if echo "$QOUT2" | grep -q "$MARKER"; then
  pass "quarantine record survived eventprocessor restart"
else
  fail "quarantine record missing after eventprocessor restart"
fi

curl -sf -X POST "$BACKEND/api/ha-agent-enrollments/${TOKEN_ID}/revoke" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 1' \
  -d '{"reason":"live ingress leftover token cleanup"}' >/dev/null || true

echo "=== live ingress checks passed ==="
