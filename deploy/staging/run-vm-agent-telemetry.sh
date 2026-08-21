#!/bin/bash
set -euo pipefail
# Staging VM: post one observed SCA + SBOM as this host. Does not print secrets.

BACKEND_NAME=hivearmor-staging-backend-1
STAGING_DIR=/home/ubuntu/HiveArmor-v1/deploy/staging
AGENT_DIR=/home/ubuntu/ha-agent-test

echo "waiting_health"
h=""
for _ in $(seq 1 40); do
  h=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$BACKEND_NAME")
  echo "backend_health=$h"
  if [ "$h" = "healthy" ]; then
    break
  fi
  sleep 5
done

if [ "$h" != "healthy" ]; then
  echo "backend_not_healthy"
  exit 1
fi

HA_INTERNAL_KEY="$(awk -F= '/^INTERNAL_KEY=/{print substr($0, index($0,$2)); exit}' "$STAGING_DIR/.env")"
HA_INTERNAL_KEY="${HA_INTERNAL_KEY%\"}"
HA_INTERNAL_KEY="${HA_INTERNAL_KEY#\"}"
if [ -z "$HA_INTERNAL_KEY" ]; then
  echo "INTERNAL_KEY missing"
  exit 1
fi
export HA_INTERNAL_KEY
export HA_TENANT_ID=1
export HA_AGENT_ID=staging-vm

cd "$AGENT_DIR"
./hivearmor_agent telemetry-once 127.0.0.1 yes
echo TELEMETRY_ONCE_OK
sleep 8
