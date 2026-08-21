#!/usr/bin/env bash
set -euo pipefail
bash /home/ubuntu/HiveArmor-v1/deploy/staging/run-siem009-slo-soak-sample.sh
python3 <<'PY'
import json
import subprocess
from pathlib import Path

staging = Path("/home/ubuntu/HiveArmor-v1/deploy/staging")
body = Path("/tmp/ha-ps.json")


def curl(args: list[str]) -> tuple[int, object]:
    result = subprocess.run(
        ["curl", "-sk", "-o", str(body), "-w", "%{http_code}", *args],
        text=True,
        capture_output=True,
        check=False,
    )
    code = int((result.stdout or "0").strip() or "0")
    raw = body.read_text(encoding="utf-8") if body.exists() else ""
    body.unlink(missing_ok=True)
    try:
        return code, json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return code, {}


def admin_password() -> str:
    for line in (staging / "ADMIN_BOOTSTRAP.txt").read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("password="):
            return stripped.split("=", 1)[1].strip().strip("'\"")
        return stripped
    raise SystemExit("admin password missing")


login_code, login_body = curl(
    [
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "--data",
        json.dumps({"username": "admin", "password": admin_password(), "rememberMe": False}),
        "https://127.0.0.1/api/authenticate",
    ]
)
if login_code != 200 or not isinstance(login_body, dict):
    raise SystemExit(f"login {login_code}")
token = login_body.get("id_token") or login_body.get("token")
code, signals = curl(
    [
        "-H",
        f"Authorization: Bearer {token}",
        "-H",
        "X-Tenant-ID: 1",
        "https://127.0.0.1/api/ha-pipeline-signals",
    ]
)
print(f"status={code}")
if isinstance(signals, dict):
    print(f"lags={signals.get('consumerGroupLags')}")
    print(f"topics={signals.get('topics')}")
sample = json.loads(Path("/home/ubuntu/hivearmor-slo-soak/latest.json").read_text(encoding="utf-8"))
print(f"sample_lags={sample.get('consumer_group_lags')}")
PY
