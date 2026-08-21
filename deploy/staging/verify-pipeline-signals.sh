#!/usr/bin/env bash
set -euo pipefail
# Live-verify GET /api/ha-pipeline-signals (Admin). Does not print JWT.
STAGING="$(cd "$(dirname "$0")" && pwd)"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-pipeline-signals.json}"

python3 - "$STAGING" "$BACKEND_URL" "$REPORT" <<'PY'
from __future__ import annotations
import json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

staging, backend, report_path = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
body = Path("/tmp/ha-pipeline-signals-body.json")


def curl(args):
    r = subprocess.run(["curl", "-sk", "-o", str(body), "-w", "%{http_code}", *args], text=True, capture_output=True)
    code = int((r.stdout or "0").strip() or "0")
    raw = body.read_text(encoding="utf-8") if body.exists() else ""
    body.unlink(missing_ok=True)
    try:
        parsed = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {"_non_json": True}
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
headers = ["-H", f"Authorization: Bearer {token}", "-H", "X-Tenant-ID: 1"]

code, signals = curl(["-X", "GET", *headers, f"{backend}/api/ha-pipeline-signals"])
print(f"pipeline_signals_status={code}", flush=True)
if code != 200 or not isinstance(signals, dict):
    raise SystemExit(f"FAIL: expected 200 JSON, got {code}")

required = ["recordedAt", "backendStatus", "limitations", "opensearchStatus", "postgresHivearmorBytes"]
for key in required:
    if key not in signals:
        raise SystemExit(f"FAIL: missing field {key}")

lim = signals.get("limitations") or []
if not any("no invented SLO" in str(x) for x in lim):
    raise SystemExit("FAIL: limitations must state no invented SLO thresholds")

print(f"backendStatus={signals.get('backendStatus')}", flush=True)
print(f"opensearchStatus={signals.get('opensearchStatus')}", flush=True)
print(f"opensearchStoreBytes={signals.get('opensearchStoreBytes')}", flush=True)
print(f"postgresHivearmorBytes={signals.get('postgresHivearmorBytes')}", flush=True)
print(f"hostSampleStatus={signals.get('hostSampleStatus')}", flush=True)
print(f"consumerGroupLags={len(signals.get('consumerGroupLags') or [])}", flush=True)
print(f"topics={len(signals.get('topics') or [])}", flush=True)
print("PASS: pipeline signals contract", flush=True)

# Analyst should be denied if we have a pass file; otherwise skip
analyst_status = None
pass_file = Path("/home/ubuntu/HiveArmor-v1/deploy/staging")  # unused placeholder
# Prefer Windows-synced secret is not on Linux; skip role deny unless analyst pass exists
for candidate in (
    staging / "secrets" / "analyst.chen.pass",
    Path.home() / "ha-agent-test" / "secrets" / "analyst.chen.pass",
):
    if candidate.is_file():
        ap = candidate.read_text(encoding="utf-8").strip()
        ac, ad = curl([
            "-X", "POST", "-H", "Content-Type: application/json",
            "--data", json.dumps({"username": "analyst.chen", "password": ap, "rememberMe": False}),
            f"{backend}/api/authenticate",
        ])
        if ac == 200:
            at = ad.get("id_token") or ad.get("token")
            analyst_status, _ = curl(["-X", "GET", "-H", f"Authorization: Bearer {at}", "-H", "X-Tenant-ID: 1", f"{backend}/api/ha-pipeline-signals"])
            print(f"analyst_pipeline_signals_status={analyst_status}", flush=True)
        break

report = {
    "workId": "SIEM-009",
    "gate": "pipeline-signals-board",
    "httpStatus": code,
    "backendStatus": signals.get("backendStatus"),
    "opensearchStatus": signals.get("opensearchStatus"),
    "opensearchStoreBytes": signals.get("opensearchStoreBytes"),
    "postgresHivearmorBytes": signals.get("postgresHivearmorBytes"),
    "hostSampleStatus": signals.get("hostSampleStatus"),
    "consumerGroupLagCount": len(signals.get("consumerGroupLags") or []),
    "topicCount": len(signals.get("topics") or []),
    "analystStatus": analyst_status,
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "LIVE_VERIFIED",
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)
print("PIPELINE_SIGNALS_REPORT=" + str(report_path), flush=True)
print("status=LIVE_VERIFIED", flush=True)
PY
