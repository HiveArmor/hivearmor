#!/usr/bin/env bash
set -euo pipefail
# Live SIEM-009 enrollment-audit retention/export on this staging host.
# Does not print JWTs, passwords, or audit reason/event payloads.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-enrollment-audit-export.json}"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
PG="${PG_CONTAINER:-hivearmor-staging-postgres-1}"
DUMP="${DUMP_FILE:-/var/tmp/hivearmor-enrollment-audit.dump.sql}"
EXPORT_BODY="${EXPORT_BODY:-/tmp/ha-enrollment-audit-export.ndjson}"
HDR="${HDR_FILE:-/tmp/ha-enrollment-audit-export.hdr}"
ANALYST_PASS_FILE="${ANALYST_PASS_FILE:-/home/ubuntu/ha-agent-test/role-matrix-secrets/analyst.chen}"

python3 - "$STAGING" "$BACKEND_URL" "$PG" "$REPORT" "$DUMP" "$EXPORT_BODY" "$HDR" "$ANALYST_PASS_FILE" <<'PY'
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

staging = Path(sys.argv[1])
backend = sys.argv[2]
pg = sys.argv[3]
report_path = Path(sys.argv[4])
dump_path = Path(sys.argv[5])
export_body = Path(sys.argv[6])
hdr_path = Path(sys.argv[7])
analyst_pass_file = Path(sys.argv[8])
json_body = Path("/tmp/ha-enrollment-audit-json.json")

report: dict[str, object] = {}


def sh(args: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=False)


def curl(args: list[str], out: Path = json_body) -> tuple[int, object, str]:
    hdr = Path("/tmp/ha-enroll-curl.hdr")
    result = sh(["curl", "-sk", "-D", str(hdr), "-o", str(out), "-w", "%{http_code}", *args])
    code = int((result.stdout or "0").strip() or "0")
    raw = out.read_text(encoding="utf-8") if out.exists() else ""
    headers = hdr.read_text(encoding="utf-8") if hdr.exists() else ""
    hdr.unlink(missing_ok=True)
    try:
        parsed: object = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {"_non_json": True, "length": len(raw)}
    return code, parsed, headers


def admin_password() -> str:
    for line in (staging / "ADMIN_BOOTSTRAP.txt").read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("password="):
            return stripped.split("=", 1)[1].strip().strip("'\"")
        return stripped
    raise SystemExit("admin password missing")


def login(user: str, password: str) -> str:
    payload = json.dumps({"username": user, "password": password, "rememberMe": False})
    code, data, _ = curl(
        ["-X", "POST", "-H", "Content-Type: application/json", "--data", payload, f"{backend}/api/authenticate"]
    )
    if code != 200 or not isinstance(data, dict):
        raise SystemExit(f"{user} login returned HTTP {code}")
    token = data.get("id_token") or data.get("token")
    if not token:
        raise SystemExit(f"{user} login returned no token")
    print(f"PASS: {user} login HTTP 200", flush=True)
    return str(token)


def auth_headers(token: str) -> list[str]:
    return ["-H", f"Authorization: Bearer {token}", "-H", "X-Tenant-ID: 1"]


def header_value(headers: str, name: str) -> str | None:
    needle = name.lower() + ":"
    for line in headers.splitlines():
        if line.lower().startswith(needle):
            return line.split(":", 1)[1].strip()
    return None


def expect(label: str, actual: int, allowed: set[int]) -> None:
    if actual not in allowed:
        raise SystemExit(f"FAIL: {label} returned HTTP {actual}, expected {sorted(allowed)}")
    print(f"PASS: {label} returned HTTP {actual}", flush=True)


admin = login("admin", admin_password())

code, listed, headers = curl([*auth_headers(admin), f"{backend}/api/ha-agent-enrollments/audit?page=0&size=100"])
expect("GET /api/ha-agent-enrollments/audit", code, {200})
list_total = header_value(headers, "X-Total-Count")
report["audit_list_status"] = code
report["audit_list_total"] = int(list_total) if list_total and list_total.isdigit() else None

code, _, headers = curl(
    [*auth_headers(admin), f"{backend}/api/ha-agent-enrollments/audit/export"],
    out=export_body,
)
expect("GET /api/ha-agent-enrollments/audit/export", code, {200})
export_total = header_value(headers, "X-Total-Count")
export_rows = header_value(headers, "X-Export-Row-Count")
truncated = header_value(headers, "X-Export-Truncated")
policy = header_value(headers, "X-Audit-Source-Policy")
ctype = header_value(headers, "Content-Type")
report["export_status"] = code
report["export_total"] = export_total
report["export_row_count"] = export_rows
report["export_truncated"] = truncated
report["export_source_policy"] = policy
report["export_content_type"] = ctype
print(f"export_row_count={export_rows}", flush=True)
print(f"export_truncated={truncated}", flush=True)
print(f"export_source_policy={policy}", flush=True)

ndjson = export_body.read_text(encoding="utf-8") if export_body.exists() else ""
lines = [line for line in ndjson.splitlines() if line.strip()]
report["export_ndjson_lines"] = len(lines)
forbidden = ("tokenHash", "credentialHash", "ipAddress", "hostname", "macAddress", "password", "agentKey")
hits = [word for word in forbidden if word.lower() in ndjson.lower()]
report["forbidden_field_hits"] = hits
if hits:
    raise SystemExit(f"FAIL: export contained forbidden field names {hits}")
print("PASS: export NDJSON has no forbidden secret field names", flush=True)
if export_rows and int(export_rows) != len(lines):
    raise SystemExit(f"FAIL: X-Export-Row-Count {export_rows} != ndjson lines {len(lines)}")
if export_total and list_total and export_total != list_total:
    raise SystemExit(f"FAIL: export total {export_total} != list total {list_total}")
print("PASS: export counts match list X-Total-Count", flush=True)

code, policy_body, _ = curl([*auth_headers(admin), f"{backend}/api/ha-retention-policies/ENROLLMENT_AUDIT"])
expect("GET /api/ha-retention-policies/ENROLLMENT_AUDIT", code, {200})
report["retention_status"] = code
if isinstance(policy_body, dict):
    report["retention_days"] = policy_body.get("retentionDays")
    report["retention_archive_target"] = policy_body.get("archiveTarget")
    report["retention_source_immutable"] = policy_body.get("sourceImmutable")
    print(f"retention_source_immutable={policy_body.get('sourceImmutable')}", flush=True)
    if policy_body.get("archiveTarget") not in (None, "NONE"):
        raise SystemExit("FAIL: ENROLLMENT_AUDIT archiveTarget must be NONE")
    if policy_body.get("sourceImmutable") is not True:
        raise SystemExit("FAIL: ENROLLMENT_AUDIT sourceImmutable must be true")

put_payload = json.dumps({"name": "Enrollment audit", "dataType": "ENROLLMENT_AUDIT", "retentionDays": 2555, "archiveTarget": "S3"})
code, put_body, _ = curl(
    [*auth_headers(admin), "-X", "PUT", "-H", "Content-Type: application/json", "--data", put_payload,
     f"{backend}/api/ha-retention-policies/ENROLLMENT_AUDIT"]
)
expect("PUT ENROLLMENT_AUDIT archiveTarget=S3", code, {400})
report["retention_s3_rejected"] = code

if analyst_pass_file.is_file():
    analyst = login("analyst.chen", analyst_pass_file.read_text(encoding="utf-8").strip())
    code, _, _ = curl([*auth_headers(analyst), f"{backend}/api/ha-agent-enrollments/audit/export"], out=Path("/tmp/ha-analyst-export.bin"))
    expect("Analyst GET /audit/export", code, {403})
    report["analyst_export_status"] = code
else:
    report["analyst_export_status"] = "skipped-no-pass-file"
    print("WARN: analyst pass file missing; Analyst 403 not executed", flush=True)

pg_count = sh(
    ["docker", "exec", pg, "psql", "-U", "postgres", "-d", "agentmanager", "-At", "-c",
     "SELECT COUNT(*) FROM enrollment_audit_events WHERE tenant_id = 1;"]
)
count_text = (pg_count.stdout or "").strip()
report["pg_tenant1_count"] = count_text
if pg_count.returncode != 0:
    raise SystemExit(f"FAIL: postgres count failed: {(pg_count.stderr or '')[:200]}")
print(f"pg_tenant1_count={count_text}", flush=True)
if export_total and count_text and export_total != count_text:
    raise SystemExit(f"FAIL: export total {export_total} != postgres count {count_text}")
print("PASS: postgres tenant 1 count matches export total", flush=True)

delete = sh(
    ["docker", "exec", pg, "psql", "-U", "postgres", "-d", "agentmanager", "-v", "ON_ERROR_STOP=1", "-c",
     "DELETE FROM enrollment_audit_events WHERE ctid IN (SELECT ctid FROM enrollment_audit_events LIMIT 1);"]
)
report["delete_rejected"] = delete.returncode != 0
if delete.returncode == 0:
    raise SystemExit("FAIL: DELETE on enrollment_audit_events succeeded")
print("PASS: postgres DELETE on enrollment_audit_events was rejected", flush=True)

dumped = sh(
    ["docker", "exec", pg, "pg_dump", "-U", "postgres", "-d", "agentmanager", "--data-only",
     "--table=enrollment_audit_events"]
)
if dumped.returncode != 0:
    raise SystemExit("FAIL: pg_dump enrollment_audit_events failed")
dump_path.write_text(dumped.stdout, encoding="utf-8")
dump_path.chmod(0o600)
report["dump_bytes"] = dump_path.stat().st_size
report["dump_path"] = str(dump_path)
print(f"dump_bytes={report['dump_bytes']}", flush=True)
print("PASS: pg_dump of enrollment_audit_events written with mode 0600", flush=True)

report["status"] = "script-complete"
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"ENROLLMENT_AUDIT_REPORT={report_path}", flush=True)
print("status=script-complete", flush=True)
export_body.unlink(missing_ok=True)
json_body.unlink(missing_ok=True)
PY
