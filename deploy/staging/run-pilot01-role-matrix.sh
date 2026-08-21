#!/usr/bin/env bash
set -euo pipefail
# PILOT-01 packaged-host HTTP role matrix on this Linux host.
# Creates 0600 password files if missing, binds SOC/Analyst to tenant 1 only,
# then checks Admin allow, SOC Manager allow, Analyst deny, and SOC Manager
# cross-tenant deny. Does not print passwords, JWTs, or hashes.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$ROOT/deploy/staging"
SECRET_DIR=/home/ubuntu/ha-agent-test/role-matrix-secrets
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-pilot01-role-matrix.json}"
BACKEND_URL="${BACKEND_URL:-https://127.0.0.1}"
PG=hivearmor-staging-postgres-1
UNAUTHORIZED_TENANT_ID="${UNAUTHORIZED_TENANT_ID:-3812}"

mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

python3 - "$SECRET_DIR" "$STAGING" "$BACKEND_URL" "$PG" "$UNAUTHORIZED_TENANT_ID" "$REPORT" <<'PY'
from __future__ import annotations

import json
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

secret_dir = Path(sys.argv[1])
staging = Path(sys.argv[2])
backend = sys.argv[3]
pg = sys.argv[4]
unauthorized_tenant = int(sys.argv[5])
report_path = Path(sys.argv[6])


def sh(args: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=False)


def curl(args: list[str]) -> tuple[int, str]:
    body = Path("/tmp/ha-role-matrix-body.json")
    result = sh(["curl", "-sk", "-o", str(body), "-w", "%{http_code}", *args])
    code = int((result.stdout or "0").strip() or "0")
    text = body.read_text(encoding="utf-8") if body.exists() else ""
    body.unlink(missing_ok=True)
    return code, text


def password_file(login: str) -> Path:
    return secret_dir / f"{login}.pass"


def ensure_password(login: str) -> str:
    path = password_file(login)
    if not path.exists() or path.stat().st_size < 8:
        path.write_text(secrets.token_urlsafe(18) + "\n", encoding="utf-8")
        path.chmod(0o600)
    return path.read_text(encoding="utf-8").strip()


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql(statement: str) -> str:
    result = sh(
        ["docker", "exec", "-i", pg, "psql", "-U", "postgres", "-d", "hivearmor", "-v", "ON_ERROR_STOP=1", "-At"],
        statement,
    )
    if result.returncode != 0:
        raise SystemExit("psql failed: " + (result.stderr or result.stdout)[-400:])
    return result.stdout.strip()


admin_pass = None
for line in (staging / "ADMIN_BOOTSTRAP.txt").read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue
    if stripped.lower().startswith("password="):
        admin_pass = stripped.split("=", 1)[1].strip().strip("'\"")
        break
    admin_pass = stripped
    break
if not admin_pass:
    raise SystemExit("admin password missing")

soc_pass = ensure_password("soc.manager")
analyst_pass = ensure_password("analyst.chen")
sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
sql(
    "UPDATE jhi_user SET password_hash = crypt("
    + sql_literal(soc_pass)
    + ", gen_salt('bf', 10)), activated = true WHERE login = 'soc.manager';"
)
sql(
    "UPDATE jhi_user SET password_hash = crypt("
    + sql_literal(analyst_pass)
    + ", gen_salt('bf', 10)), activated = true WHERE login = 'analyst.chen';"
)
sql(
    """
INSERT INTO ha_tenant_user (client_id, jhi_user_id, tenant_role)
SELECT 1, u.id, 'SOC_MANAGER'
FROM jhi_user u
WHERE u.login = 'soc.manager'
  AND NOT EXISTS (
    SELECT 1 FROM ha_tenant_user t WHERE t.client_id = 1 AND t.jhi_user_id = u.id
  );
"""
)
sql(
    """
INSERT INTO ha_tenant_user (client_id, jhi_user_id, tenant_role)
SELECT 1, u.id, 'ANALYST'
FROM jhi_user u
WHERE u.login = 'analyst.chen'
  AND NOT EXISTS (
    SELECT 1 FROM ha_tenant_user t WHERE t.client_id = 1 AND t.jhi_user_id = u.id
  );
"""
)
exists = sql(f"SELECT COUNT(*) FROM ha_client WHERE id = {unauthorized_tenant};")
if exists != "1":
    raise SystemExit(f"unauthorized tenant {unauthorized_tenant} is not an existing tenant")


def login(username: str, password: str) -> str:
    payload = json.dumps({"username": username, "password": password, "rememberMe": False})
    code, text = curl(
        ["-X", "POST", "-H", "Content-Type: application/json", "--data", payload, f"{backend}/api/authenticate"]
    )
    if code != 200:
        raise SystemExit(f"login for {username} returned HTTP {code}")
    data = json.loads(text)
    token = data.get("id_token") or data.get("token")
    if not token:
        raise SystemExit(f"login for {username} returned no token")
    print(f"PASS: login for {username} returned HTTP 200", flush=True)
    return token


def list_enrollments(token: str, tenant: int) -> int:
    code, _ = curl(
        [
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            f"X-Tenant-ID: {tenant}",
            f"{backend}/api/ha-agent-enrollments?page=0&size=25",
        ]
    )
    return code


admin_token = login("admin", admin_pass)
soc_token = login("soc.manager", soc_pass)
analyst_token = login("analyst.chen", analyst_pass)

admin_status = list_enrollments(admin_token, 1)
soc_status = list_enrollments(soc_token, 1)
analyst_status = list_enrollments(analyst_token, 1)
unauthorized_status = list_enrollments(soc_token, unauthorized_tenant)

def expect(label: str, actual: int, allowed: set[int]) -> None:
    if actual not in allowed:
        raise SystemExit(f"FAIL: {label} returned HTTP {actual}, expected {sorted(allowed)}")
    print(f"PASS: {label} returned HTTP {actual}", flush=True)

expect("Admin list enrollment tokens", admin_status, {200})
expect("SOC Manager list enrollment tokens", soc_status, {200})
expect("Analyst list enrollment tokens", analyst_status, {401, 403})
expect("SOC Manager unauthorized tenant selection", unauthorized_status, {401, 403})

report = {
    "workId": "PILOT-01",
    "gate": "packaged-host-role-matrix",
    "platform": "linux",
    "backendUrl": backend,
    "tenantId": 1,
    "unauthorizedTenantId": unauthorized_tenant,
    "adminStatus": admin_status,
    "socManagerStatus": soc_status,
    "analystStatus": analyst_status,
    "unauthorizedTenantStatus": unauthorized_status,
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "script-complete",
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("ROLE_MATRIX_REPORT=" + str(report_path), flush=True)
for key in ("adminStatus", "socManagerStatus", "analystStatus", "unauthorizedTenantStatus", "unauthorizedTenantId"):
    print(f"{key}={report[key]}", flush=True)
PY
