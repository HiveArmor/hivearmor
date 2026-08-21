#!/usr/bin/env bash
set -euo pipefail
# Live HNT-007 hunt → incident evidence on this staging host.
# Does not print JWTs, event messages, or log payloads.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-hunt-evidence.json}"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
PG=hivearmor-staging-postgres-1

python3 - "$STAGING" "$BACKEND_URL" "$PG" "$REPORT" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

staging = Path(sys.argv[1])
backend = sys.argv[2]
pg = sys.argv[3]
report_path = Path(sys.argv[4])
body_path = Path("/tmp/ha-hunt-evidence-body.json")


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


def problem_code(data: object) -> str | None:
    if not isinstance(data, dict):
        return None
    for key in ("error", "code", "title"):
        value = data.get(key)
        if isinstance(value, str) and value:
            return value
    return None


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
print(f"hunt_searchId_present={bool(search_id)}", flush=True)
print(f"hunt_item_count={len(items) if isinstance(items, list) else 0}", flush=True)
print(f"hunt_total_approximate={search_body.get('totalApproximate')}", flush=True)

missing_code, missing_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({"action": "create_evidence", "eventIds": ["x"], "title": "x"}),
    f"{backend}/api/ha-hunts/actions/preview",
])
expect("preview without searchId", missing_code, {400})
print(f"preview_missing_searchId_error={problem_code(missing_body)}", flush=True)

bogus_code, bogus_body = curl([
    "-X", "POST", *headers, "--data",
    json.dumps({
        "action": "create_evidence",
        "searchId": "HUNT-NOTAREAL",
        "eventIds": ["00000000-0000-0000-0000-000000000000"],
    }),
    f"{backend}/api/ha-hunts/actions/preview",
])
print(f"preview_unknown_search_status={bogus_code}", flush=True)
print(f"preview_unknown_search_error={problem_code(bogus_body)}", flush=True)

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
print(f"incident_id={incident_id}", flush=True)

evidence_created = False
evidence_pg_count = None
result_id = None
event_id = None

if isinstance(items, list) and items and search_id and incident_id is not None:
    first = items[0]
    if not isinstance(first, dict) or not first.get("id"):
        raise SystemExit("hunt item missing id")
    event_id = str(first["id"])
    preview_code, preview_body = curl([
        "-X", "POST", *headers, "--data",
        json.dumps({"action": "create_evidence", "searchId": search_id, "eventIds": [event_id]}),
        f"{backend}/api/ha-hunts/actions/preview",
    ])
    expect("preview create_evidence", preview_code, {200})
    if not isinstance(preview_body, dict) or not preview_body.get("previewToken"):
        raise SystemExit("previewToken missing")
    print(f"preview_eventCount={preview_body.get('eventCount')}", flush=True)

    outsider_code, _ = curl([
        "-X", "POST", *headers, "--data",
        json.dumps({
            "action": "create_evidence",
            "searchId": search_id,
            "eventIds": ["00000000-0000-0000-0000-000000000000"],
        }),
        f"{backend}/api/ha-hunts/actions/preview",
    ])
    print(f"preview_event_outside_snapshot_status={outsider_code}", flush=True)

    execute_code, execute_body = curl([
        "-X", "POST", *headers, "--data",
        json.dumps({
            "action": "create_evidence",
            "searchId": search_id,
            "eventIds": [event_id],
            "previewToken": preview_body["previewToken"],
            "title": "STAGING-HUNT-EVIDENCE",
            "description": "Live HNT-007 attach from hunt snapshot",
            "parameters": {"incidentId": str(incident_id)},
        }),
        f"{backend}/api/ha-hunts/actions",
    ])
    expect("execute create_evidence", execute_code, {200})
    if isinstance(execute_body, dict):
        result_id = execute_body.get("resultId")
        print(f"evidence_resultType={execute_body.get('resultType')}", flush=True)
        print(f"evidence_status={execute_body.get('status')}", flush=True)
        evidence_created = execute_body.get("status") == "created"

    list_ev_code, list_ev_body = curl([
        "-X", "GET", *headers,
        f"{backend}/api/ha-incidents/{incident_id}/evidence-items",
    ])
    expect("GET incident evidence-items", list_ev_code, {200})
    api_count = len(list_ev_body) if isinstance(list_ev_body, list) else None
    print(f"evidence_api_count={api_count}", flush=True)

    safe_event = event_id.replace("'", "")
    pg = sh(
        ["docker", "exec", pg, "psql", "-U", "postgres", "-d", "hivearmor", "-At", "-c",
         "SELECT COUNT(*) FROM hive_evidence_item WHERE incident_id = %s AND source_ref = '%s';"
         % (incident_id, safe_event)]
    )
    evidence_pg_count = (pg.stdout or "").strip()
    print(f"evidence_pg_matching_source_ref={evidence_pg_count}", flush=True)
else:
    print("hunt_promotion_skipped=empty_search_or_no_incident", flush=True)

report = {
    "workId": "HNT-007",
    "gate": "hunt-evidence-live",
    "backendUrl": backend,
    "searchStatus": search_code,
    "searchIdPresent": bool(search_id),
    "itemCount": len(items) if isinstance(items, list) else 0,
    "missingSearchIdStatus": missing_code,
    "unknownSearchStatus": bogus_code,
    "incidentId": incident_id,
    "eventIdPresent": bool(event_id),
    "evidenceCreated": evidence_created,
    "evidenceResultIdPresent": bool(result_id),
    "postgresMatchingRows": evidence_pg_count,
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "script-complete" if evidence_created else "partial-empty-or-blocked",
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("HUNT_EVIDENCE_REPORT=" + str(report_path), flush=True)
print(f"status={report['status']}", flush=True)
PY
