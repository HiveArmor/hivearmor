#!/bin/bash
set -euo pipefail
# Install observed SCA/SBOM as a systemd service on the staging VM.
# Does not print INTERNAL_KEY. Not a full enrollment/PILOT-01 gate.

STAGING_DIR=/home/ubuntu/HiveArmor-v1/deploy/staging
AGENT_SRC=${AGENT_SRC:-/home/ubuntu/ha-agent-test/hivearmor_agent}
INSTALL_DIR=/opt/hivearmor/agent
ENV_FILE=/etc/hivearmor/agent.env
UNIT=/etc/systemd/system/hivearmor-telemetry.service
DROP_IN_DIR=/etc/systemd/system/HiveArmorAgent.service.d

if [[ $EUID -ne 0 ]]; then
  echo "run as root" >&2
  exit 2
fi

if [[ ! -x "$AGENT_SRC" ]]; then
  echo "missing agent binary: $AGENT_SRC" >&2
  exit 2
fi

install -d -m 0750 "$INSTALL_DIR"
install -m 0755 "$AGENT_SRC" "$INSTALL_DIR/hivearmor_agent_service"
install -d -m 0750 /etc/hivearmor
install -d -m 0755 "$DROP_IN_DIR"

printf '%s\n' '[Service]' 'EnvironmentFile=-/etc/hivearmor/agent.env' >"$DROP_IN_DIR/10-telemetry.conf"
chmod 0644 "$DROP_IN_DIR/10-telemetry.conf"

HA_INTERNAL_KEY="$(awk -F= '/^INTERNAL_KEY=/{print substr($0, index($0,$2)); exit}' "$STAGING_DIR/.env")"
HA_INTERNAL_KEY="${HA_INTERNAL_KEY%\"}"
HA_INTERNAL_KEY="${HA_INTERNAL_KEY#\"}"
if [[ -z "$HA_INTERNAL_KEY" ]]; then
  echo "INTERNAL_KEY missing" >&2
  exit 1
fi

umask 077
cat >"$ENV_FILE" <<EOF
HA_INTERNAL_KEY=${HA_INTERNAL_KEY}
HA_TENANT_ID=1
HA_AGENT_ID=staging-vm
EOF
chmod 0600 "$ENV_FILE"

cat >"$UNIT" <<'EOF'
[Unit]
Description=HiveArmor observed host telemetry (SCA/SBOM)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/hivearmor/agent/hivearmor_agent_service telemetry-loop 127.0.0.1 yes
WorkingDirectory=/opt/hivearmor/agent
EnvironmentFile=-/etc/hivearmor/agent.env
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$UNIT"

systemctl daemon-reload
systemctl enable --now hivearmor-telemetry.service
systemctl is-active hivearmor-telemetry.service

echo TELEMETRY_UNIT_ACTIVE
# Confirm the unit file does not embed the key string.
if grep -q 'HA_INTERNAL_KEY=' "$UNIT"; then
  echo "FAIL: unit contains HA_INTERNAL_KEY" >&2
  exit 1
fi
echo UNIT_HAS_NO_KEY
