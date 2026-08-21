#!/usr/bin/env bash
# Revoke enrolled staging agent ids so Windows re-install can register again.
# Does not print JWTs or credentials.
set -euo pipefail
STAGING="$(cd "$(dirname "$0")" && pwd)"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
IDS="${1:-15}"

python3 - "$STAGING" "$BACKEND_URL" "$IDS" <<'PY'
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path

staging = Path(sys.argv[1])
backend = sys.argv[2]
ids = [x.strip() for x in sys.argv[3].split(",") if x.strip()]
body = Path("/tmp/ha-revoke-body.json")


def curl(args):
    r = subprocess.run(["curl", "-sk", "-o", str(body), "-w", "%{http_code}", *args], text=True, capture_output=True)
    code = int((r.stdout or "0").strip() or "0")
    raw = body.read_text(encoding="utf-8") if body.exists() else ""
    body.unlink(missing_ok=True)
    try:
        parsed = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {}
    return code, parsed


def admin_password():
    for line in (staging / "ADMIN_BOOTSTRAP.txt").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.lower().startswith("password="):
            return s.split("=", 1)[1].strip().strip("'\"")
        return s
    raise SystemExit("admin password missing")


code, data = curl([
    "-X", "POST", "-H", "Content-Type: application/json",
    "--data", json.dumps({"username": "admin", "password": admin_password(), "rememberMe": False}),
    f"{backend}/api/authenticate",
])
if code != 200:
    raise SystemExit(f"login {code}")
token = data.get("id_token") or data.get("token")
headers = ["-H", f"Authorization: Bearer {token}", "-H", "X-Tenant-ID: 1", "-H", "Content-Type: application/json"]

for agent_id in ids:
    c, _ = curl([
        "-X", "POST", *headers,
        "--data", json.dumps({"reason": "windows-1056-reinstall cleanup"}),
        f"{backend}/api/ha-agent-enrollments/agents/{agent_id}/credential/revoke",
    ])
    print(f"revoke_agent_{agent_id}_status={c}", flush=True)
print("REVOKE_DONE", flush=True)
PY
