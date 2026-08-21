#!/usr/bin/env bash
set -euo pipefail
# Live HNT-007 gate checks: permissionVersion, approvalRequired, APPROVAL_REQUIRED without
# approvalId, and eventOutcomes on create_evidence. Does not print JWTs or event payloads.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-hnt007-gates.json}"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"

python3 - "$STAGING" "$BACKEND_URL" "$REPORT" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

staging = Path(sys.argv[1])
backend = sys.argv[2]
report_path = Path(sys.argv[3])
body_path = Path("/tmp/ha-hnt007-gates-body.json")


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


def login() -> str:
    payload = json.dumps({"username": "admin", "password": admin_password(), "rememberMe": False})
    code, data = curl(
        ["-X", "POST", "-H", "Content-Type: application/json", "--data", payload, f"{backend}/api/authenticate"]
    )
    if code != 200 or not isinstance(data, dict):
        raise SystemExit(f"login returned HTTP {code}")
    token = data.get("id_token") or data.get("token")
    if not token:
        raise SystemExit("login returned no token")
    print("PASS: admin login HTTP 200", flush=True)
    return str(token)


def auth_headers(token: str) -> list[str]:
    return ["-H", f"Authorization: Bearer {token}", "-H", "X-Tenant-ID: 1", "-H", "Content-Type: application/json"]


def expect(label: str, actual: int, allowed: set[int]) -> None:
    if actual not in allowed:
        raise SystemExit(f"FAIL: {label} returned HTTP {actual}, expected {sorted(allowed)}")
    print(f"PASS: {label} returned HTTP {actual}", flush=True)


token = login()
headers = auth_headers(token)

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
search_code, search_body = curl(["-X", "POST", *headers, "--data", search_payload, f"{backend}/api/ha-hunts/search"])
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

# --- create_evidence preview: approvalRequired=false, permissionVersion present ---
prev_code, prev_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({"action": "create_evidence", "searchId": search_id, "eventIds": [event_id]}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview create_evidence", prev_code, {200})
if not isinstance(prev_body, dict):
    raise SystemExit("preview body not JSON")
perm = prev_body.get("permissionVersion")
approval_evidence = prev_body.get("approvalRequired")
preview_token = prev_body.get("previewToken")
print(f"create_evidence_permissionVersion_present={bool(perm)}", flush=True)
print(f"create_evidence_approvalRequired={approval_evidence}", flush=True)
if not perm or not isinstance(perm, str):
    raise SystemExit("FAIL: permissionVersion missing on create_evidence preview")
if approval_evidence is not False:
    raise SystemExit(f"FAIL: create_evidence (1 event) expected approvalRequired=false, got {approval_evidence}")
if not preview_token:
    raise SystemExit("FAIL: previewToken missing")
print("PASS: create_evidence preview gates", flush=True)

# --- escalate_incident preview: approvalRequired=true ---
esc_prev_code, esc_prev_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({"action": "escalate_incident", "searchId": search_id, "eventIds": [event_id]}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview escalate_incident", esc_prev_code, {200})
if not isinstance(esc_prev_body, dict):
    raise SystemExit("escalate preview body not JSON")
esc_approval = esc_prev_body.get("approvalRequired")
esc_token = esc_prev_body.get("previewToken")
print(f"escalate_approvalRequired={esc_approval}", flush=True)
if esc_approval is not True:
    raise SystemExit(f"FAIL: escalate preview expected approvalRequired=true, got {esc_approval}")
if not esc_token:
    raise SystemExit("FAIL: escalate previewToken missing")
print("PASS: escalate preview requires approval", flush=True)

# --- escalate execute without approvalId → 400 APPROVAL_REQUIRED ---
deny_code, deny_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({
        "action": "escalate_incident",
        "searchId": search_id,
        "eventIds": [event_id],
        "previewToken": esc_token,
        "title": "STAGING-HNT007-GATED",
        "description": "Must fail without approvalId",
        "parameters": {},
    }),
    f"{backend}/api/ha-hunts/actions",
])
expect("execute escalate without approvalId", deny_code, {400})
deny_msg = ""
deny_err = ""
if isinstance(deny_body, dict):
    deny_err = str(deny_body.get("error") or "")
    deny_msg = str(deny_body.get("message") or "")
print(f"escalate_deny_error={deny_err}", flush=True)
if "APPROVAL_REQUIRED" not in deny_msg and "APPROVAL_REQUIRED" not in deny_err:
    raise SystemExit(f"FAIL: expected APPROVAL_REQUIRED in error/message, got error={deny_err!r}")
print("PASS: escalate without approvalId rejected", flush=True)

# --- create_investigation preview also gated ---
inv_code, inv_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({"action": "create_investigation", "searchId": search_id, "eventIds": [event_id]}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview create_investigation", inv_code, {200})
inv_approval = inv_body.get("approvalRequired") if isinstance(inv_body, dict) else None
print(f"investigation_approvalRequired={inv_approval}", flush=True)
if inv_approval is not True:
    raise SystemExit(f"FAIL: create_investigation expected approvalRequired=true, got {inv_approval}")
print("PASS: investigation preview requires approval", flush=True)

# --- create_evidence execute → eventOutcomes present ---
incident_code, incident_body = curl(["-X", "GET", *headers, f"{backend}/api/ha-incidents?page=0&size=10&sort=id,desc"])
expect("list incidents", incident_code, {200})
incident_id = None
rows = incident_body
if isinstance(incident_body, dict):
    rows = incident_body.get("content") or incident_body.get("items") or []
if isinstance(rows, list):
    for row in rows:
        if isinstance(row, dict) and row.get("id"):
            incident_id = int(row["id"])
            break
if incident_id is None:
    raise SystemExit("FAIL: no incident available for evidence attach")
print(f"incident_id={incident_id}", flush=True)

exec_code, exec_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({
        "action": "create_evidence",
        "searchId": search_id,
        "eventIds": [event_id],
        "previewToken": preview_token,
        "title": "STAGING-HNT007-GATES",
        "description": "Live HNT-007 gate verify eventOutcomes",
        "parameters": {"incidentId": str(incident_id)},
    }),
    f"{backend}/api/ha-hunts/actions",
])
expect("execute create_evidence", exec_code, {200})
if not isinstance(exec_body, dict):
    raise SystemExit("execute body not JSON")
outcomes = exec_body.get("eventOutcomes")
print(f"evidence_status={exec_body.get('status')}", flush=True)
print(f"eventOutcomes_type={type(outcomes).__name__}", flush=True)
print(f"eventOutcomes_count={len(outcomes) if isinstance(outcomes, list) else None}", flush=True)
if not isinstance(outcomes, list) or len(outcomes) < 1:
    raise SystemExit("FAIL: eventOutcomes missing or empty on create_evidence execute")
print("PASS: create_evidence returned eventOutcomes", flush=True)

report = {
    "workId": "HNT-007",
    "gate": "hnt007-preview-approval-eventOutcomes",
    "backendUrl": backend,
    "searchStatus": search_code,
    "itemCount": len(items),
    "createEvidenceApprovalRequired": approval_evidence,
    "permissionVersionPresent": bool(perm),
    "escalateApprovalRequired": esc_approval,
    "escalateWithoutApprovalStatus": deny_code,
    "investigationApprovalRequired": inv_approval,
    "incidentId": incident_id,
    "evidenceStatus": exec_body.get("status"),
    "eventOutcomesCount": len(outcomes),
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "LIVE_VERIFIED",
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("HNT007_GATES_REPORT=" + str(report_path), flush=True)
print(f"status={report['status']}", flush=True)
PY
