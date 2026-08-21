#!/usr/bin/env bash
set -euo pipefail
# Verify signed telemetry-once and that INTERNAL_KEY alone is rejected.
# Never prints INTERNAL_KEY or agent keys.

sudo /opt/hivearmor/agent/hivearmor_agent_service telemetry-once 127.0.0.1 yes
echo "telemetry_once_rc=$?"

python3 <<'PY'
import json
import ssl
import urllib.error
import urllib.request
from pathlib import Path

env = Path("/home/ubuntu/HiveArmor-v1/deploy/staging/.env").read_text(encoding="utf-8")
ikey = None
for line in env.splitlines():
    if line.startswith("INTERNAL_KEY="):
        ikey = line.split("=", 1)[1].strip().strip("\"'")
        break
if not ikey:
    raise SystemExit("INTERNAL_KEY missing from .env")

ctx = ssl._create_unverified_context()
body = json.dumps(
    {
        "agentId": "legacy-probe",
        "packId": "ha-linux-observed-ssh",
        "packVersion": "1",
        "checks": [],
    }
).encode()
req = urllib.request.Request(
    "https://127.0.0.1/api/ha-telemetry/sca",
    data=body,
    headers={"Content-Type": "application/json", "X-Internal-Key": ikey},
    method="POST",
)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
        print("legacy_internal_key_status", resp.status)
except urllib.error.HTTPError as e:
    print("legacy_internal_key_status", e.code)

import subprocess
out = subprocess.check_output(
    ["docker", "exec", "hivearmor-staging-backend-1", "printenv", "ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY"],
    text=True,
).strip()
print("ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY", out)
PY
