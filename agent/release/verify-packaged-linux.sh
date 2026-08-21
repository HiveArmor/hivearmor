#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./verify-packaged-linux.sh \
    --package-dir /path/to/unpacked/package \
    --server siem.example \
    --backend-url https://siem.example \
    --grpc-server-name siem.example \
    --tenant-id 1 \
    --admin-user admin \
    --admin-pass 'secret' \
    [--soc-user soc.manager --soc-pass 'secret'] \
    [--analyst-user analyst.chen --analyst-pass 'secret'] \
    [--unauthorized-tenant-id 2] \
    [--insecure]
    [--skip-cert-validation yes|no]
    [--admin-pass-file /path]
    [--report-file /tmp/hivearmor-pilot01-linux-report.json]

This script drives the remaining packaged-host acceptance gate for PILOT-01.
It creates a one-time enrollment token through the authenticated REST API,
installs the packaged agent, exercises systemd start/stop/restart and
credential rotation, then records safe evidence to a JSON report.
Use --admin-pass-file so the password is not placed on the process command line.
--insecure is for lab/self-signed TLS only.
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 2
  }
}

json_get() {
  local file="$1"
  local expr="$2"
  python3 - "$file" "$expr" <<'PY'
import json
import sys

path = sys.argv[2].split(".")
value = json.load(open(sys.argv[1], "r", encoding="utf-8"))
for part in path:
    if part == "":
        continue
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    sys.exit(1)
if isinstance(value, (dict, list)):
    print(json.dumps(value))
else:
    print(value)
PY
}

assert_status() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" != "$expected" ]]; then
  echo "FAIL: $label returned HTTP $actual, expected $expected" >&2
  exit 1
fi
echo "PASS: $label returned HTTP $actual" >&2
}

assert_denied() {
  local label="$1"
  local actual="$2"
  if [[ "$actual" == 2* ]]; then
  echo "FAIL: $label unexpectedly returned HTTP $actual" >&2
  exit 1
fi
echo "PASS: $label denied with HTTP $actual" >&2
}

rest_call() {
  local method="$1"
  local token="$2"
  local tenant="$3"
  local path="$4"
  local body="${5:-}"
  local response_file
  response_file="$(mktemp)"
  local http_code
  if [[ -n "$body" ]]; then
    http_code="$(curl -sS ${CURL_INSECURE_ARGS[@]+"${CURL_INSECURE_ARGS[@]}"} -o "$response_file" -w "%{http_code}" \
      -X "$method" \
      -H "Authorization: Bearer ${token}" \
      -H "X-Tenant-ID: ${tenant}" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "${BACKEND_URL}${path}")"
  else
    http_code="$(curl -sS ${CURL_INSECURE_ARGS[@]+"${CURL_INSECURE_ARGS[@]}"} -o "$response_file" -w "%{http_code}" \
      -X "$method" \
      -H "Authorization: Bearer ${token}" \
      -H "X-Tenant-ID: ${tenant}" \
      "${BACKEND_URL}${path}")"
  fi
  echo "${http_code}|${response_file}"
}

login() {
  local username="$1"
  local password="$2"
  local response_file
  response_file="$(mktemp)"
  local http_code
  local login_body
  login_body="$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2],"rememberMe":False}))' "$username" "$password")"
  http_code="$(curl -sS ${CURL_INSECURE_ARGS[@]+"${CURL_INSECURE_ARGS[@]}"} -o "$response_file" -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data "$login_body" \
    "${BACKEND_URL}/api/authenticate")"
  assert_status "login for ${username}" "$http_code" "200"
  python3 - "$response_file" <<'PY'
import json
import sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
token = data.get("id_token") or data.get("token")
if not token:
    raise SystemExit(1)
print(token)
PY
  rm -f "$response_file"
}

parse_agent_id() {
  python3 - "$1" <<'PY'
import sys
for line in open(sys.argv[1], "r", encoding="utf-8"):
    if line.startswith("agent-id:"):
        print(line.split(":", 1)[1].strip())
        raise SystemExit(0)
raise SystemExit(1)
PY
}

contains_secret() {
  local target="$1"
  local secret="$2"
  if [[ -z "$secret" ]]; then
    return 1
  fi
  python3 - "$target" "$secret" <<'PY'
import pathlib
import sys
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
sys.exit(0 if sys.argv[2] in text else 1)
PY
}

PACKAGE_DIR=""
SERVER=""
BACKEND_URL=""
GRPC_SERVER_NAME=""
TENANT_ID=""
ADMIN_USER=""
ADMIN_PASS=""
SOC_USER=""
SOC_PASS=""
ANALYST_USER=""
ANALYST_PASS=""
UNAUTHORIZED_TENANT_ID=""
REPORT_FILE=""
SKIP_CERT="no"
ADMIN_PASS_FILE=""
CURL_INSECURE_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-dir) PACKAGE_DIR="$2"; shift 2 ;;
    --server) SERVER="$2"; shift 2 ;;
    --backend-url) BACKEND_URL="$2"; shift 2 ;;
    --grpc-server-name) GRPC_SERVER_NAME="$2"; shift 2 ;;
    --tenant-id) TENANT_ID="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
    --admin-pass-file) ADMIN_PASS_FILE="$2"; shift 2 ;;
    --soc-user) SOC_USER="$2"; shift 2 ;;
    --soc-pass) SOC_PASS="$2"; shift 2 ;;
    --analyst-user) ANALYST_USER="$2"; shift 2 ;;
    --analyst-pass) ANALYST_PASS="$2"; shift 2 ;;
    --unauthorized-tenant-id) UNAUTHORIZED_TENANT_ID="$2"; shift 2 ;;
    --report-file) REPORT_FILE="$2"; shift 2 ;;
    --skip-cert-validation) SKIP_CERT="$2"; shift 2 ;;
    --insecure) CURL_INSECURE_ARGS=(-k); shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -n "$ADMIN_PASS_FILE" ]]; then
  ADMIN_PASS="$(python3 - "$ADMIN_PASS_FILE" <<'PY'
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text(encoding="utf-8")
for line in text.splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue
    if stripped.lower().startswith("password="):
        print(stripped.split("=", 1)[1].strip().strip("'\""))
        raise SystemExit(0)
    print(stripped)
    raise SystemExit(0)
raise SystemExit("admin password file is empty")
PY
)"
fi

[[ -n "$PACKAGE_DIR" && -n "$SERVER" && -n "$BACKEND_URL" && -n "$GRPC_SERVER_NAME" && -n "$TENANT_ID" && -n "$ADMIN_USER" && -n "$ADMIN_PASS" ]] || {
  usage
  exit 2
}
if [[ "$SKIP_CERT" != "yes" && "$SKIP_CERT" != "no" ]]; then
  echo "skip-cert-validation must be yes or no" >&2
  exit 2
fi

[[ -d "$PACKAGE_DIR" && -x "$PACKAGE_DIR/hivearmor_agent_service" && -f "$PACKAGE_DIR/SHA256SUMS" ]] || {
  echo "package directory must contain hivearmor_agent_service and SHA256SUMS" >&2
  exit 2
}

require_cmd curl
require_cmd python3
require_cmd sha256sum
require_cmd systemctl
require_cmd ps
require_cmd journalctl
require_cmd install

if [[ $EUID -ne 0 ]]; then
  echo "run as root so service-manager checks match packaged-host acceptance" >&2
  exit 2
fi

REPORT_FILE="${REPORT_FILE:-${PACKAGE_DIR}/pilot01-linux-report.json}"
WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

TOKEN_FILE="${WORK_DIR}/enrollment.token"
CREDENTIAL_FILE="${WORK_DIR}/device.credential"
INSTALL_LOG="${WORK_DIR}/install.log"
ROTATE_LOG="${WORK_DIR}/rotate.log"

ADMIN_TOKEN="$(login "$ADMIN_USER" "$ADMIN_PASS")"
SOC_TOKEN=""
ANALYST_TOKEN=""
if [[ -n "$SOC_USER" && -n "$SOC_PASS" ]]; then
  SOC_TOKEN="$(login "$SOC_USER" "$SOC_PASS")"
fi
if [[ -n "$ANALYST_USER" && -n "$ANALYST_PASS" ]]; then
  ANALYST_TOKEN="$(login "$ANALYST_USER" "$ANALYST_PASS")"
fi

expires_at="$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
PY
)"
create_payload="$(python3 - "$expires_at" <<'PY'
import json
import sys
print(json.dumps({
    "policyId": "pilot-linux-packaged-host",
    "platform": "linux",
    "expiresAt": sys.argv[1],
    "maxUses": 1
}))
PY
)"

create_result="$(rest_call POST "$ADMIN_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments" "$create_payload")"
create_status="${create_result%%|*}"
create_body="${create_result#*|}"
assert_status "create enrollment token" "$create_status" "201"
enrollment_token="$(json_get "$create_body" "token")"
token_id="$(json_get "$create_body" "enrollment.id")"
install -m 600 /dev/null "$TOKEN_FILE"
printf '%s\n' "$enrollment_token" >"$TOKEN_FILE"

(
  cd "$PACKAGE_DIR"
  sha256sum -c SHA256SUMS
) >/dev/null

(
  cd "$PACKAGE_DIR"
  ./hivearmor_agent_service install "$SERVER" "$SKIP_CERT" --enrollment-token-file "$TOKEN_FILE" --mode edr
) | tee "$INSTALL_LOG"
rm -f "$TOKEN_FILE"

systemctl is-active HiveArmorAgent >/dev/null
systemctl restart HiveArmorAgent
systemctl stop HiveArmorAgent
systemctl start HiveArmorAgent
systemctl is-active HiveArmorAgent >/dev/null

CONFIG_FILE="${PACKAGE_DIR}/config.yml"
[[ -f "$CONFIG_FILE" ]] || {
  echo "missing config.yml beside packaged binary after install" >&2
  exit 1
}
agent_id="$(parse_agent_id "$CONFIG_FILE")"

audit_result="$(rest_call GET "$ADMIN_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments/audit?page=0&size=100&tokenId=${token_id}")"
audit_status="${audit_result%%|*}"
audit_body="${audit_result#*|}"
assert_status "list enrollment audit after install" "$audit_status" "200"
python3 - "$audit_body" <<'PY'
import json
import sys
rows = json.load(open(sys.argv[1], "r", encoding="utf-8"))
events = {row.get("eventType") for row in rows}
required = {"enrollment.token.created", "enrollment.token.consumed"}
missing = sorted(required - events)
if missing:
    raise SystemExit("missing audit events after install: " + ", ".join(missing))
PY

rotate_payload='{"reason":"packaged host credential rotation acceptance"}'
rotate_result="$(rest_call POST "$ADMIN_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments/agents/${agent_id}/credential/rotate" "$rotate_payload")"
rotate_status="${rotate_result%%|*}"
rotate_body="${rotate_result#*|}"
assert_status "rotate credential" "$rotate_status" "201"
rotated_credential="$(json_get "$rotate_body" "key")"
install -m 600 /dev/null "$CREDENTIAL_FILE"
printf '%s\n' "$rotated_credential" >"$CREDENTIAL_FILE"

(
  cd "$PACKAGE_DIR"
  ./hivearmor_agent_service rotate-credential --credential-file "$CREDENTIAL_FILE"
) | tee "$ROTATE_LOG"
rm -f "$CREDENTIAL_FILE"
systemctl is-active HiveArmorAgent >/dev/null

revoke_payload='{"reason":"packaged host revoke after rotation acceptance"}'
revoke_result="$(rest_call POST "$ADMIN_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments/agents/${agent_id}/credential/revoke" "$revoke_payload")"
revoke_status="${revoke_result%%|*}"
revoke_body="${revoke_result#*|}"
assert_status "revoke credential" "$revoke_status" "200"

audit_result="$(rest_call GET "$ADMIN_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments/audit?page=0&size=100")"
audit_status="${audit_result%%|*}"
audit_body="${audit_result#*|}"
assert_status "list enrollment audit after rotation and revoke" "$audit_status" "200"
python3 - "$audit_body" "$agent_id" <<'PY'
import json
import sys
rows = json.load(open(sys.argv[1], "r", encoding="utf-8"))
agent_id = int(sys.argv[2])
events = {row.get("eventType") for row in rows if row.get("agentId") == agent_id}
required = {"agent.credential.rotated", "agent.credential.revoked"}
missing = sorted(required - events)
if missing:
    raise SystemExit("missing credential audit events: " + ", ".join(missing))
PY

soc_status=""
analyst_status=""
unauthorized_status=""
if [[ -n "$SOC_TOKEN" ]]; then
  soc_result="$(rest_call GET "$SOC_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments?page=0&size=25")"
  soc_status="${soc_result%%|*}"
  assert_status "SOC Manager list enrollment tokens" "$soc_status" "200"
  rm -f "${soc_result#*|}"
fi
if [[ -n "$ANALYST_TOKEN" ]]; then
  analyst_result="$(rest_call GET "$ANALYST_TOKEN" "$TENANT_ID" "/api/ha-agent-enrollments?page=0&size=25")"
  analyst_status="${analyst_result%%|*}"
  assert_denied "Analyst list enrollment tokens" "$analyst_status"
  rm -f "${analyst_result#*|}"
fi
if [[ -n "$UNAUTHORIZED_TENANT_ID" ]]; then
  unauthorized_result="$(rest_call GET "$ADMIN_TOKEN" "$UNAUTHORIZED_TENANT_ID" "/api/ha-agent-enrollments?page=0&size=25")"
  unauthorized_status="${unauthorized_result%%|*}"
  assert_denied "Unauthorized tenant selection" "$unauthorized_status"
  rm -f "${unauthorized_result#*|}"
fi

if contains_secret "$INSTALL_LOG" "$enrollment_token"; then
  echo "FAIL: enrollment token leaked into install log" >&2
  exit 1
fi
if contains_secret "$ROTATE_LOG" "$rotated_credential"; then
  echo "FAIL: rotated credential leaked into rotate log" >&2
  exit 1
fi
if ps -ef | python3 - "$enrollment_token" "$rotated_credential" <<'PY'
import sys
data = sys.stdin.read()
sys.exit(0 if sys.argv[1] in data or sys.argv[2] in data else 1)
PY
then
  echo "FAIL: a secret appeared in process arguments" >&2
  exit 1
fi

log_file="${PACKAGE_DIR}/logs/hivearmor_agent.log"
if [[ -f "$log_file" ]]; then
  if contains_secret "$log_file" "$enrollment_token" || contains_secret "$log_file" "$rotated_credential"; then
    echo "FAIL: a secret appeared in hivearmor_agent.log" >&2
    exit 1
  fi
fi

python3 - "$REPORT_FILE" "$SERVER" "$BACKEND_URL" "$TENANT_ID" "$token_id" "$agent_id" "$soc_status" "$analyst_status" "$unauthorized_status" "$SKIP_CERT" <<'PY'
import json
import pathlib
import sys

report = {
    "workId": "PILOT-01",
    "platform": "linux",
    "server": sys.argv[2],
    "backendUrl": sys.argv[3],
    "tenantId": int(sys.argv[4]),
    "tokenId": sys.argv[5],
    "agentId": int(sys.argv[6]),
    "socManagerStatus": int(sys.argv[7]) if sys.argv[7] else None,
    "analystStatus": int(sys.argv[8]) if sys.argv[8] else None,
    "unauthorizedTenantStatus": int(sys.argv[9]) if sys.argv[9] else None,
    "skipCertValidation": sys.argv[10] if len(sys.argv) > 10 else "no",
    "status": "script-complete"
}
path = pathlib.Path(sys.argv[1])
path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
PY

rm -f "$create_body" "$rotate_body" "$revoke_body" "$audit_body"
echo "Linux packaged-host acceptance completed. Report written to ${REPORT_FILE}"
