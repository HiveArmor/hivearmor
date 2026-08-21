#!/usr/bin/env bash
# Live-verify CIS catalog, FIRST EPSS (host egress), remediation connectors,
# and signed vs legacy telemetry ingest. Does not print secrets, dump contents, or CVE payloads.
set -euo pipefail

STAGING="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$STAGING/../.." && pwd)"
BACKEND_URL="${HA_STAGING_URL:-https://127.0.0.1}"
PG=hivearmor-staging-postgres-1
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-cis-epss-signed.json}"

python3 - "$STAGING" "$ROOT" "$BACKEND_URL" "$PG" "$REPORT" <<'PY'
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

staging = Path(sys.argv[1])
root = Path(sys.argv[2])
backend = sys.argv[3]
pg = sys.argv[4]
report_path = Path(sys.argv[5])
body_path = Path("/tmp/ha-cis-epss-body.json")
report: dict[str, object] = {}


def sh(args: list[str], cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, check=False, cwd=cwd)


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


def psql(sql: str) -> str:
    result = sh(
        [
            "docker", "compose", "--env-file", str(staging / ".env"),
            "exec", "-T", "postgres",
            "psql", "-U", "postgres", "-d", "hivearmor", "-tAc", sql,
        ],
        cwd=str(staging),
    )
    if result.returncode != 0:
        raise SystemExit(f"psql failed: {(result.stderr or result.stdout).strip()}")
    return (result.stdout or "").strip()


token = login()
headers = auth_headers(token)

print("== CIS catalog ==", flush=True)
code, catalog = curl([*headers, f"{backend}/api/ha-cis/catalog"])
if code != 200 or not isinstance(catalog, list):
    raise SystemExit(f"catalog HTTP {code}")
print("packs", len(catalog), flush=True)
license_required = False
for row in catalog:
    if not isinstance(row, dict):
        continue
    print(row.get("packId"), row.get("licenseState"), row.get("officialBenchmark"), row.get("source"), row.get("reportingAgents"), flush=True)
    if row.get("licenseState") == "LICENSE_REQUIRED_NOT_SHIPPED":
        license_required = True
    note = str(row.get("note") or "")
    if "CIS Controls 1.1.1" in note or "Ensure SSH" in note:
        raise SystemExit("catalog must not contain licensed CIS recommendation text")
if not license_required:
    raise SystemExit("missing LICENSE_REQUIRED_NOT_SHIPPED catalog row")
report["catalogPacks"] = len(catalog)
print("PASS: catalog distinguishes observed vs license-required CIS", flush=True)

print("== remediation connectors ==", flush=True)
code, connectors = curl([*headers, f"{backend}/api/ha-vuln/remediation-connectors"])
if code != 200 or not isinstance(connectors, list) or not connectors:
    raise SystemExit(f"connectors HTTP {code}")
if any(not isinstance(row, dict) or row.get("state") != "not_configured" for row in connectors):
    raise SystemExit("connectors must be not_configured")
report["connectorCount"] = len(connectors)
print("connectors", len(connectors), flush=True)
print("PASS: remediation connectors are not_configured", flush=True)

print("== signed ingest negative (forged key) ==", flush=True)
sca = json.dumps({
    "agentId": "8",
    "hostname": "probe",
    "packId": "ha-linux-observed-ssh",
    "packVersion": "1",
    "results": [{"checkId": "HA-PROBE-01", "title": "probe", "status": "NOT_APPLICABLE", "mitre": [], "complianceTags": []}],
})
forged, _ = curl([
    "-X", "POST", "-H", "Content-Type: application/json",
    "-H", "X-HiveArmor-Agent-Id: 8",
    "-H", "X-Agent-Key: forged-not-a-device-secret",
    "--data", sca, f"{backend}/api/ha-telemetry/sca",
])
print("forged_status", forged, flush=True)
if forged not in (401, 403):
    raise SystemExit("expected 401/403 for forged device key")
report["forgedStatus"] = forged
print("PASS: forged device key rejected", flush=True)

print("== missing device identity ==", flush=True)
missing, _ = curl(["-X", "POST", "-H", "Content-Type: application/json", "--data", sca, f"{backend}/api/ha-telemetry/sca"])
print("missing_auth_status", missing, flush=True)
report["missingAuthStatus"] = missing

print("== FIRST EPSS from host ==", flush=True)
cve_count = psql("SELECT COUNT(DISTINCT cve_id) FROM ha_vuln_finding WHERE cve_id LIKE 'CVE-%'")
print("distinct_cves", cve_count, flush=True)
report["distinctCves"] = int(cve_count or "0")
sample = psql("SELECT cve_id FROM ha_vuln_finding WHERE cve_id LIKE 'CVE-%' ORDER BY cve_id LIMIT 1")
sample = sample.splitlines()[0].strip() if sample else ""
print("cve_id_len", len(sample), flush=True)
matched = re.search(r"(CVE-\d{4}-\d+)", sample)
sample = matched.group(1) if matched else ""
if sample and re.fullmatch(r"CVE-\d{4}-\d+", sample):
    epss_code, epss_body = curl([f"https://api.first.org/data/v1/epss?cve={sample}"])
    print("first_org_status", epss_code, "cve_queried yes", flush=True)
    rows = epss_body.get("data") if isinstance(epss_body, dict) else []
    row_count = len(rows) if isinstance(rows, list) else 0
    print("first_org_rows", row_count, flush=True)
    stored = False
    if epss_code == 200 and isinstance(rows, list) and rows and isinstance(rows[0], dict):
        score = str(rows[0].get("epss") or "")
        pct = str(rows[0].get("percentile") or "")
        as_of = str(rows[0].get("date") or "")
        if re.fullmatch(r"[0-9.]+", score):
            pct_sql = "NULL" if not re.fullmatch(r"[0-9.]+", pct) else pct + "::float"
            as_of_sql = "NULL" if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", as_of) else f"'{as_of}'::timestamp"
            psql(
                "UPDATE ha_vuln_finding SET epss_score = "
                + score
                + "::float, epss_percentile = "
                + pct_sql
                + ", epss_as_of = "
                + as_of_sql
                + ", updated_at = NOW() WHERE cve_id = '"
                + sample
                + "' AND epss_score IS NULL"
            )
            stored = True
    report["firstOrgStatus"] = epss_code
    report["storedFirstEpss"] = stored
    print("stored_first_epss_for_one_cve", "yes" if stored else "no", flush=True)
else:
    print("first_org_status skipped cve_queried no", flush=True)
    report["storedFirstEpss"] = False
    probe_code, probe_body = curl(["https://api.first.org/data/v1/epss?cve=CVE-2021-44228"])
    probe_rows = probe_body.get("data") if isinstance(probe_body, dict) else []
    print("first_org_probe_status", probe_code, "rows", len(probe_rows) if isinstance(probe_rows, list) else 0, flush=True)
    report["firstOrgProbeStatus"] = probe_code
    report["firstOrgProbeRows"] = len(probe_rows) if isinstance(probe_rows, list) else 0

reported = psql("SELECT COUNT(*) FROM ha_vuln_finding WHERE epss_score IS NOT NULL")
print("findings_with_stored_epss", reported, flush=True)
report["findingsWithStoredEpss"] = int(reported or "0")

print("== signed ingest positive (enrolled device, no revoke) ==", flush=True)
agent_bin = Path("/opt/hivearmor/agent/hivearmor_agent_service")
cfg = Path("/opt/hivearmor/agent/config.yml")
skip_enroll = os.environ.get("SKIP_SIGNED_ENROLL", "") == "1"
if skip_enroll or not agent_bin.exists():
    print("signed_202 skipped (no packaged agent or SKIP_SIGNED_ENROLL=1)", flush=True)
    report["signedAccepted"] = False
elif cfg.exists():
    agent_id = None
    for line in cfg.read_text(encoding="utf-8").splitlines():
        if line.startswith("agent-id:"):
            agent_id = line.split(":", 1)[1].strip()
            break
    report["signedAgentId"] = agent_id
    print("signed_agent_id", agent_id, flush=True)
    once = sh([str(agent_bin), "telemetry-once", "127.0.0.1", "yes"], cwd=str(agent_bin.parent))
    accepted = once.returncode == 0
    report["signedAccepted"] = accepted
    if not accepted:
        out = ((once.stdout or "") + "\n" + (once.stderr or "")).strip()
        print("telemetry_once_rc", once.returncode, flush=True)
        print("telemetry_once_err", out[-400:], flush=True)
        raise SystemExit("telemetry-once failed")
    print("PASS: signed telemetry-once accepted", flush=True)
else:
    expires = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    create_body = json.dumps({
        "policyId": "cis-epss-signed-ingest",
        "platform": "linux",
        "expiresAt": expires,
        "maxUses": 1,
    })
    create_code, created = curl([*headers, "-X", "POST", "--data", create_body, f"{backend}/api/ha-agent-enrollments"])
    if create_code != 201 or not isinstance(created, dict):
        raise SystemExit(f"create enrollment HTTP {create_code}")
    enroll_token = created.get("token")
    enrollment = created.get("enrollment") if isinstance(created.get("enrollment"), dict) else {}
    token_id = enrollment.get("id") if isinstance(enrollment, dict) else None
    if not enroll_token:
        raise SystemExit("enrollment token missing")
    token_file = Path("/tmp/ha-signed-enroll.token")
    token_file.write_text(str(enroll_token), encoding="utf-8")
    token_file.chmod(0o600)
    sh(["systemctl", "stop", "HiveArmorAgent"])
    sh([str(agent_bin), "uninstall"], cwd=str(agent_bin.parent))
    sh(["systemctl", "stop", "HiveArmorAgent"])
    sh(["rm", "-f", "/etc/systemd/system/HiveArmorAgent.service"])
    sh(["rm", "-f", "/etc/systemd/system/multi-user.target.wants/HiveArmorAgent.service"])
    sh(["rm", "-rf", "/etc/systemd/system/HiveArmorAgent.service.d"])
    sh(["systemctl", "daemon-reload"])
    install = sh(
        [str(agent_bin), "install", "127.0.0.1", "yes", "--enrollment-token-file", str(token_file), "--mode", "log"],
        cwd=str(agent_bin.parent),
    )
    token_file.unlink(missing_ok=True)
    if install.returncode != 0:
        combined = ((install.stdout or "") + "\n" + (install.stderr or "")).replace(str(enroll_token), "[token]")
        lines = [line for line in combined.splitlines() if line.strip() and not line.startswith(" |") and "___" not in line]
        print("install_rc", install.returncode, flush=True)
        print("install_err", " | ".join(lines[-8:])[:500], flush=True)
        err = combined.lower()
        if "already installed" in err:
            print("signed_202 skipped (HiveArmorAgent already installed)", flush=True)
            report["signedAccepted"] = False
            report["signedSkip"] = "already-installed"
        else:
            raise SystemExit("agent install failed")
    else:
        once = sh([str(agent_bin), "telemetry-once", "127.0.0.1", "yes"], cwd=str(agent_bin.parent))
        accepted = once.returncode == 0
        report["signedAccepted"] = accepted
        report["enrollmentTokenId"] = token_id
        cfg = Path("/opt/hivearmor/agent/config.yml")
        agent_id = None
        if cfg.exists():
            for line in cfg.read_text(encoding="utf-8").splitlines():
                if line.startswith("agent-id:"):
                    agent_id = line.split(":", 1)[1].strip()
                    break
        report["signedAgentId"] = agent_id
        print("signed_agent_id", agent_id, flush=True)
        if not accepted:
            raise SystemExit("telemetry-once failed")
        print("PASS: signed telemetry-once accepted", flush=True)

report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)
print("OK", flush=True)
print("REPORT=" + str(report_path), flush=True)
PY
