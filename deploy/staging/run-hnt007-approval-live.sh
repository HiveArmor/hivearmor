#!/usr/bin/env bash
set -euo pipefail
# Live HNT-007 SOC Manager approval path: request → SoD reject → manager approve → execute → consume.
# Uses existing staging users admin + soc.manager (password files under /var/tmp/ha-pilot-secrets).
# Does not print JWTs, passwords, or raw event payloads.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-hnt007-approval.json}"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
SECRET_DIR="${SECRET_DIR:-/home/ubuntu/ha-agent-test/role-matrix-secrets}"
PG_CONTAINER="${PG_CONTAINER:-hivearmor-staging-postgres-1}"

python3 - "$STAGING" "$BACKEND_URL" "$REPORT" "$SECRET_DIR" "$PG_CONTAINER" <<'PY'
from __future__ import annotations

import json
import secrets
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

staging = Path(sys.argv[1])
backend = sys.argv[2]
report_path = Path(sys.argv[3])
secret_dir = Path(sys.argv[4])
pg = sys.argv[5]
body_path = Path("/tmp/ha-hnt007-approval-body.json")


def sh(args: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=False)


def curl(args: list[str]) -> tuple[int, object]:
    result = sh(["curl", "-sk", "-o", str(body_path), "-w", "%{http_code}", *args])
    code = int((result.stdout or "0").strip() or "0")
    raw = body_path.read_text(encoding="utf-8") if body_path.exists() else ""
    body_path.unlink(missing_ok=True)
    try:
        parsed: object = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {"_non_json": True, "length": len(raw)}
    return code, parsed


def admin_password() -> str:
    for line in (staging / "ADMIN_BOOTSTRAP.txt").read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("password="):
            return stripped.split("=", 1)[1].strip().strip("'\"")
        return stripped
    raise SystemExit("admin password missing")


def ensure_password(login: str) -> str:
    secret_dir.mkdir(parents=True, exist_ok=True)
    path = secret_dir / f"{login}.pass"
    if path.exists():
        text = path.read_text(encoding="utf-8").strip()
        if text:
            return text
    pw = secrets.token_urlsafe(18)
    path.write_text(pw + "\n", encoding="utf-8")
    path.chmod(0o600)
    return pw


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql(statement: str) -> str:
    result = sh(
        ["docker", "exec", "-i", pg, "psql", "-U", "postgres", "-d", "hivearmor", "-v", "ON_ERROR_STOP=1", "-At"],
        statement,
    )
    if result.returncode != 0:
        raise SystemExit("psql failed: " + (result.stderr or result.stdout)[-400:])
    return (result.stdout or "").strip()


def login(username: str, password: str) -> str:
    payload = json.dumps({"username": username, "password": password, "rememberMe": False})
    code, data = curl(
        ["-X", "POST", "-H", "Content-Type: application/json", "--data", payload, f"{backend}/api/authenticate"]
    )
    if code != 200 or not isinstance(data, dict):
        raise SystemExit(f"login {username} returned HTTP {code}")
    token = data.get("id_token") or data.get("token")
    if not token:
        raise SystemExit(f"login {username} returned no token")
    print(f"PASS: login {username} HTTP 200", flush=True)
    return str(token)


def auth_headers(token: str) -> list[str]:
    return ["-H", f"Authorization: Bearer {token}", "-H", "X-Tenant-ID: 1", "-H", "Content-Type: application/json"]


def expect(label: str, actual: int, allowed: set[int]) -> None:
    if actual not in allowed:
        raise SystemExit(f"FAIL: {label} returned HTTP {actual}, expected {sorted(allowed)}")
    print(f"PASS: {label} returned HTTP {actual}", flush=True)


# Ensure soc.manager password hash matches secret file (same pattern as role-matrix)
soc_pass = ensure_password("soc.manager")
sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
sql(
    "UPDATE jhi_user SET password_hash = crypt("
    + sql_literal(soc_pass)
    + ", gen_salt('bf', 10)), activated = true WHERE login = 'soc.manager';"
)
# Ensure ROLE_SOC_MANAGER authority binding
sql(
    """
INSERT INTO jhi_user_authority (user_id, authority_name)
SELECT u.id, 'ROLE_SOC_MANAGER'
FROM jhi_user u
WHERE u.login = 'soc.manager'
  AND NOT EXISTS (
    SELECT 1 FROM jhi_user_authority a
    WHERE a.user_id = u.id AND a.authority_name = 'ROLE_SOC_MANAGER'
  );
"""
)

admin_token = login("admin", admin_password())
manager_token = login("soc.manager", soc_pass)
admin_headers = auth_headers(admin_token)
manager_headers = auth_headers(manager_token)

now = datetime.now(timezone.utc)
time_from = (now - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
time_to = now.strftime("%Y-%m-%dT%H:%M:%SZ")
search_payload = json.dumps({
    "query": "*:*",
    "language": "kql",
    "timeRange": {"from": time_from, "to": time_to},
    "tenantScope": "authorized",
    "limit": 25,
    "includeHistogram": False,
    "sort": [{"field": "@timestamp", "direction": "desc"}],
})
search_code, search_body = curl(["-X", "POST", *admin_headers, "--data", search_payload, f"{backend}/api/ha-hunts/search"])
expect("POST /api/ha-hunts/search", search_code, {200})
if not isinstance(search_body, dict):
    raise SystemExit("hunt search body was not JSON")
search_id = search_body.get("searchId")
items = search_body.get("items") or []
if not search_id or not isinstance(items, list) or not items:
    raise SystemExit("FAIL: hunt search returned no searchId/items")
first = items[0]
if not isinstance(first, dict) or not first.get("id"):
    raise SystemExit("FAIL: hunt item missing id")
event_id = str(first["id"])
print(f"hunt_item_count={len(items)}", flush=True)

esc_prev_code, esc_prev_body = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({"action": "escalate_incident", "searchId": search_id, "eventIds": [event_id]}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview escalate_incident", esc_prev_code, {200})
if not isinstance(esc_prev_body, dict):
    raise SystemExit("escalate preview body not JSON")
if esc_prev_body.get("approvalRequired") is not True:
    raise SystemExit("FAIL: expected approvalRequired=true")
esc_token = esc_prev_body.get("previewToken")
if not esc_token:
    raise SystemExit("FAIL: missing previewToken")
print("PASS: escalate preview gated", flush=True)

req_code, req_body = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({
        "action": "escalate_incident",
        "searchId": search_id,
        "eventIds": [event_id],
        "previewToken": esc_token,
        "rationale": "STAGING HNT-007 approval path live verify",
    }),
    f"{backend}/api/ha-hunts/approvals",
])
expect("POST /api/ha-hunts/approvals", req_code, {200})
if not isinstance(req_body, dict) or not req_body.get("approvalId"):
    raise SystemExit("FAIL: approval request missing approvalId")
approval_id = str(req_body["approvalId"])
print(f"approval_status={req_body.get('status')}", flush=True)
if req_body.get("status") != "PENDING":
    raise SystemExit(f"FAIL: expected PENDING, got {req_body.get('status')}")

sod_code, sod_body = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({"decision": "APPROVE", "rationale": "self approve must fail"}),
    f"{backend}/api/ha-hunts/approvals/{approval_id}/decision",
])
expect("self-approve SoD reject", sod_code, {400})
sod_msg = ""
if isinstance(sod_body, dict):
    sod_msg = str(sod_body.get("message") or "")
if "SEPARATION_OF_DUTIES" not in sod_msg:
    raise SystemExit(f"FAIL: expected SEPARATION_OF_DUTIES, got {sod_msg!r}")
print("PASS: self-approve rejected", flush=True)

dec_code, dec_body = curl([
    "-X", "POST", *manager_headers, "--data",
    json.dumps({"decision": "APPROVE", "rationale": "STAGING HNT-007 manager approve"}),
    f"{backend}/api/ha-hunts/approvals/{approval_id}/decision",
])
expect("manager APPROVE", dec_code, {200})
if not isinstance(dec_body, dict) or dec_body.get("status") != "APPROVED":
    raise SystemExit(f"FAIL: expected APPROVED, got {dec_body!r}")
print("PASS: manager approved", flush=True)

esc_prev2_code, esc_prev2 = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({"action": "escalate_incident", "searchId": search_id, "eventIds": [event_id]}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview escalate before execute", esc_prev2_code, {200})
exec_token = esc_prev2.get("previewToken") if isinstance(esc_prev2, dict) else None
if not exec_token:
    raise SystemExit("FAIL: missing execute previewToken")

exec_code, exec_body = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({
        "action": "escalate_incident",
        "searchId": search_id,
        "eventIds": [event_id],
        "previewToken": exec_token,
        "title": "STAGING-HNT007-APPROVED",
        "description": "Live approve-path escalate",
        "parameters": {"approvalId": approval_id},
    }),
    f"{backend}/api/ha-hunts/actions",
])
expect("execute escalate with approvalId", exec_code, {200})
print(f"execute_status={exec_body.get('status') if isinstance(exec_body, dict) else None}", flush=True)

replay_code, replay_body = curl([
    "-X", "POST", *admin_headers, "--data",
    json.dumps({
        "action": "escalate_incident",
        "searchId": search_id,
        "eventIds": [event_id],
        "previewToken": exec_token,
        "title": "STAGING-HNT007-REPLAY",
        "description": "Must fail consumed approval",
        "parameters": {"approvalId": approval_id},
    }),
    f"{backend}/api/ha-hunts/actions",
])
expect("replay consumed approval", replay_code, {400})
replay_msg = str(replay_body.get("message") or "") if isinstance(replay_body, dict) else ""
if "APPROVAL_ALREADY_CONSUMED" not in replay_msg and "APPROVAL" not in replay_msg:
    raise SystemExit(f"FAIL: expected consumed rejection, got {replay_msg!r}")
print("PASS: consumed approval rejected on replay", flush=True)

report = {
    "workId": "HNT-007",
    "gate": "hnt007-soc-manager-approval-path",
    "backendUrl": backend,
    "searchStatus": search_code,
    "itemCount": len(items),
    "approvalIdPresent": bool(approval_id),
    "selfApproveStatus": sod_code,
    "managerApproveStatus": dec_code,
    "executeStatus": exec_code,
    "replayStatus": replay_code,
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "LIVE_VERIFIED",
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("HNT007_APPROVAL_REPORT=" + str(report_path), flush=True)
print(f"status={report['status']}", flush=True)
PY
