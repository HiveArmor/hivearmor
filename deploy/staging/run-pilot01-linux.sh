#!/bin/bash
set -euo pipefail
# PILOT-01 Linux packaged HiveArmorAgent on this staging VM.
# Secrets stay in 0600 files. Do not print INTERNAL_KEY, wrap key, tokens, or passwords.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
VERIFY="$ROOT/agent/release/verify-packaged-linux.sh"
PKG_DIR=/opt/hivearmor/agent
WRAP=/root/hivearmor-agent-wrap.key
REPORT=/var/tmp/hivearmor-pilot01-linux-report.json

if [[ $EUID -ne 0 ]]; then
  echo "run as root" >&2
  exit 2
fi
command -v docker >/dev/null
command -v python3 >/dev/null
[[ -x "$VERIFY" ]]
[[ -f "$STAGING/ADMIN_BOOTSTRAP.txt" ]]
[[ -d "$ROOT/agent" && -d "$ROOT/shared" ]]

cd "$STAGING"
if ! nc -z 127.0.0.1 9001 2>/dev/null; then
  docker compose --env-file .env up -d --no-deps --force-recreate agentmanager
  for _ in $(seq 1 30); do
    st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' hivearmor-staging-agentmanager-1)
    if [[ "$st" == "healthy" ]]; then
      break
    fi
    sleep 3
  done
fi

docker exec hivearmor-staging-agentmanager-1 mkdir -p /dependencies/agent
docker exec hivearmor-staging-agentmanager-1 sh -c 'printf "%s\n" "{\"version\":\"11.0.0-staging\",\"updater_version\":\"11.0.0-staging\"}" > /dependencies/agent/version.json'

python3 - <<'PY'
import secrets
from pathlib import Path
p = Path("/root/hivearmor-agent-wrap.key")
if not p.exists() or p.stat().st_size < 16:
    p.write_text(secrets.token_hex(32), encoding="utf-8")
    p.chmod(0o600)
PY

if [[ "${SKIP_AGENT_BUILD:-}" == "1" && -x "$ROOT/agent/hivearmor_agent_service" ]]; then
  echo using_existing_agent_binary
else
  if [[ -n "$(docker images -q golang:1.25.5 2>/dev/null)" ]]; then
    GOIMG=golang:1.25.5
  else
    GOIMG=golang:1.25
  fi
  docker run --rm \
    -v "$ROOT:/src" \
    -v "$WRAP:/wrap:ro" \
    -w /src/agent \
    -e CGO_ENABLED=0 \
    -e GOOS=linux \
    -e GOARCH=amd64 \
    "$GOIMG" \
    sh -c 'go build -ldflags "-X github.com/hivearmor/agent/config.REPLACE_KEY=$(cat /wrap)" -o /src/agent/hivearmor_agent_service .'
fi

install -d -m 0750 "$PKG_DIR"
install -m 0755 "$ROOT/agent/hivearmor_agent_service" "$PKG_DIR/hivearmor_agent_service"
install -m 0644 "$ROOT/agent/release/INSTALL.md" "$PKG_DIR/INSTALL.md"
(
  cd "$PKG_DIR"
  sha256sum hivearmor_agent_service INSTALL.md > SHA256SUMS
)

if systemctl list-unit-files HiveArmorAgent.service 2>/dev/null | grep -q HiveArmorAgent; then
  systemctl stop HiveArmorAgent || true
  rm -f /etc/systemd/system/HiveArmorAgent.service
  rm -rf /etc/systemd/system/HiveArmorAgent.service.d
  systemctl daemon-reload
fi

# Enrolled agent must use config.yml agent-id, not the telemetry-loop override.
if [[ -f /etc/hivearmor/agent.env ]]; then
  python3 - <<'PY'
from pathlib import Path
p = Path("/etc/hivearmor/agent.env")
lines = []
for line in p.read_text(encoding="utf-8").splitlines(True):
    if line.startswith("HA_AGENT_ID="):
        continue
    lines.append(line)
p.write_text("".join(lines), encoding="utf-8")
p.chmod(0o600)
PY
fi

bash "$VERIFY" \
  --package-dir "$PKG_DIR" \
  --server 127.0.0.1 \
  --backend-url https://127.0.0.1 \
  --grpc-server-name localhost \
  --tenant-id 1 \
  --admin-user admin \
  --admin-pass-file "$STAGING/ADMIN_BOOTSTRAP.txt" \
  --skip-cert-validation yes \
  --insecure \
  --report-file "$REPORT"

systemctl is-active HiveArmorAgent
echo PILOT01_LINUX_REPORT="$REPORT"
python3 - "$REPORT" <<'PY'
import json,sys
r=json.load(open(sys.argv[1],encoding="utf-8"))
for k in ("workId","platform","tenantId","tokenId","agentId","status","skipCertValidation"):
    print(f"{k}={r.get(k)}")
PY
