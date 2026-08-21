#!/usr/bin/env bash
set -euo pipefail

# Live PILOT-03 broker-outage + agent SQLite spool against local-dev.
# Does not use /v1/inject. Secrets stay in 0600 temp files and are never printed.
# This is a lab rehearsal on the local-dev stack, not a Wave 2 staging VM install.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="${BACKEND_URL:-http://localhost:8088}"
CA_FILE="${HA_GRPC_CA_FILE:-$ROOT/local-dev/certs/ca.crt}"
OS_URL="${OPENSEARCH_URL:-https://localhost:9200}"
OS_USER="${OPENSEARCH_USER:-admin}"
REDPANDA_NAME="${REDPANDA_CONTAINER:-hivearmor-redpanda}"

if [ -f "$ROOT/local-dev/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/local-dev/.env"
  set +a
fi
OS_PASS="${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

wait_redpanda() {
  local i st
  for i in $(seq 1 40); do
    st=$(docker inspect -f '{{.State.Health.Status}}' "$REDPANDA_NAME" 2>/dev/null || echo starting)
    [ "$st" = healthy ] && return 0
    sleep 2
  done
  return 1
}

WORKDIR="$(mktemp -d /tmp/hivearmor-pilot-broker.XXXXXX)"
TOKEN_FILE="$WORKDIR/enrollment.token"
KEY_FILE="$WORKDIR/internal.key"
EVENT_FILE="$WORKDIR/event.id"
AGENT_ID_FILE="$WORKDIR/agent.id"
DEVICE_KEY_FILE="$WORKDIR/device.key"
SPOOL_DB="$WORKDIR/logs.db"
REDPANDA_STOPPED=0
cleanup() {
  if [ "$REDPANDA_STOPPED" = 1 ]; then
    docker start "$REDPANDA_NAME" >/dev/null 2>&1 || true
    wait_redpanda || true
  fi
  rm -f "$TOKEN_FILE" "$KEY_FILE" "$EVENT_FILE" "$AGENT_ID_FILE" "$DEVICE_KEY_FILE" "$SPOOL_DB"
  rmdir "$WORKDIR" 2>/dev/null || true
}
trap cleanup EXIT

os_has_event() {
  local id="$1"
  curl -sk -u "$OS_USER:$OS_PASS" \
    "$OS_URL/v3-hive-log-*/_search?q=_id:${id}&size=1" \
    | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
total = d.get("hits", {}).get("total", 0)
n = total.get("value", 0) if isinstance(total, dict) else total
hits = d.get("hits", {}).get("hits") or []
raise SystemExit(0 if n or hits else 1)
'
}

echo "=== HiveArmor PILOT-03 live broker-outage spool ==="

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
  -d "{\"policyId\":\"pilot-broker-outage\",\"platform\":\"linux\",\"expiresAt\":\"$EXPIRY\",\"maxUses\":1}")" \
  || fail "create enrollment token"
python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' <<<"$CREATE_JSON" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
[ -s "$TOKEN_FILE" ] || fail "enrollment token missing"
TOKEN_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["enrollment"]["id"])' <<<"$CREATE_JSON")"
echo "  token id $TOKEN_ID (secret not printed)"

: > "$EVENT_FILE"
: > "$AGENT_ID_FILE"
: > "$DEVICE_KEY_FILE"
chmod 600 "$EVENT_FILE" "$AGENT_ID_FILE" "$DEVICE_KEY_FILE"

export HA_RUN_BROKER_OUTAGE=1
export HA_ENROLLMENT_TOKEN_FILE="$TOKEN_FILE"
export HA_INTERNAL_KEY_FILE="$KEY_FILE"
export HA_GRPC_CA_FILE="$CA_FILE"
export HA_GRPC_SERVER_NAME=localhost
export HA_GRPC_ADDRESS=127.0.0.1:9000
export HA_INPUTS_ADDRESS=127.0.0.1:50051
export HA_LIVE_EVENT_ID_FILE="$EVENT_FILE"
export HA_AGENT_ID_FILE="$AGENT_ID_FILE"
export HA_DEVICE_KEY_FILE="$DEVICE_KEY_FILE"
export HA_SPOOL_DB_PATH="$SPOOL_DB"
export GOCACHE=/tmp/hivearmor-pilot-broker-go-cache

echo "[1] Stop Redpanda (broker outage)..."
docker stop "$REDPANDA_NAME" >/dev/null || fail "stop $REDPANDA_NAME"
REDPANDA_STOPPED=1
pass "Redpanda stopped"

echo "[2] Enroll + spool + ProcessLog while broker is down..."
(
  cd "$ROOT/agent"
  HA_BROKER_OUTAGE_PHASE=down go test -mod=mod -count=1 -timeout 150s -run TestLiveBrokerOutageSpool ./agent
) || fail "down-phase spool/send"
EVENT_ID="$(tr -d '\n' < "$EVENT_FILE" 2>/dev/null || true)"
[ -n "$EVENT_ID" ] || fail "event id missing after down phase"
echo "  unacked event id $EVENT_ID"

if os_has_event "$EVENT_ID"; then
  fail "event appeared in OpenSearch before broker restore"
fi
pass "no OpenSearch document while unacked"

echo "[3] Restore Redpanda..."
docker start "$REDPANDA_NAME" >/dev/null || fail "start $REDPANDA_NAME"
wait_redpanda || fail "Redpanda did not return healthy"
REDPANDA_STOPPED=0
pass "Redpanda healthy"

echo "[4] Resend unprocessed spool row after restore..."
(
  cd "$ROOT/agent"
  HA_BROKER_OUTAGE_PHASE=up go test -mod=mod -count=1 -timeout 150s -run TestLiveBrokerOutageSpool ./agent
) || fail "up-phase spool retry"

echo "[5] OpenSearch received the previously unacked event..."
curl -sk -u "$OS_USER:$OS_PASS" -X POST "$OS_URL/v3-hive-log-*/_refresh" >/dev/null || true
FOUND=0
for i in $(seq 1 30); do
  if os_has_event "$EVENT_ID"; then
    FOUND=1
    break
  fi
  sleep 2
done
[ "$FOUND" = 1 ] || fail "event $EVENT_ID not found in OpenSearch after restore"
pass "event delivered after broker restore"

curl -sf -X POST "$BACKEND/api/ha-agent-enrollments/${TOKEN_ID}/revoke" \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 1' \
  -d '{"reason":"live broker-outage leftover token cleanup"}' >/dev/null || true

echo "=== live broker-outage spool checks passed ==="
