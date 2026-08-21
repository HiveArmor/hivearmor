#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: collect measured capacity/lag signals. No invented SLO targets.
# Writes JSON report only. Not a Grafana board. Not a 24h soak.

REPORT="${REPORT_FILE:-/var/tmp/hivearmor-siem009-slo-lag.json}"
STAGING="$(cd "$(dirname "$0")" && pwd)"
PG="${PG_CONTAINER:-hivearmor-staging-postgres-1}"
OS="${OS_CONTAINER:-hivearmor-staging-opensearch-1}"
RP="${RP_CONTAINER:-hivearmor-staging-redpanda-1}"
EP="${EP_CONTAINER:-hivearmor-staging-eventprocessor-worker-1}"
BACKEND="${BACKEND_CONTAINER:-hivearmor-staging-backend-1}"

export HA_SLO_REPORT="$REPORT"
export HA_SLO_PG="$PG"
export HA_SLO_OS="$OS"
export HA_SLO_RP="$RP"
export HA_SLO_EP="$EP"
export HA_SLO_BACKEND="$BACKEND"
export HA_SLO_STAGING="$STAGING"

python3 <<'PY'
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

report_path = Path(os.environ["HA_SLO_REPORT"])
pg = os.environ["HA_SLO_PG"]
os_ctr = os.environ["HA_SLO_OS"]
rp = os.environ["HA_SLO_RP"]
ep = os.environ["HA_SLO_EP"]
backend = os.environ["HA_SLO_BACKEND"]

report: dict[str, object] = {
    "gate": "siem009-slo-lag-signals",
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "limitations": [
        "Measured signals only — no invented SLO pass/fail thresholds",
        "Not a 24-hour soak",
        "Not a UI dashboard board",
        "Not PRODUCTION READY",
    ],
}


def sh(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, check=False)


def expect(label: str, ok: bool, detail: str = "") -> None:
    if not ok:
        raise SystemExit(f"FAIL: {label} {detail}".strip())
    print(f"PASS: {label}", flush=True)


bh = sh(["docker", "inspect", "-f", "{{.State.Health.Status}}", backend])
report["backend_health"] = (bh.stdout or "").strip()
expect("backend healthy", report["backend_health"] == "healthy")

rh = sh(["docker", "inspect", "-f", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", rp])
report["redpanda_health"] = (rh.stdout or "").strip()
expect("redpanda healthy", report["redpanda_health"] == "healthy")

# Consumer groups / lag if any
groups = sh(["docker", "exec", rp, "rpk", "group", "list"])
report["consumer_groups_raw"] = (groups.stdout or "")[:1000]
lag_rows = []
if groups.returncode == 0:
    for line in (groups.stdout or "").splitlines()[1:]:
        parts = line.split()
        if not parts:
            continue
        # rpk group list columns: BROKER GROUP  (group name is last token)
        g = parts[-1]
        if g.upper() in ("GROUP", "BROKER"):
            continue
        desc = sh(["docker", "exec", rp, "rpk", "group", "describe", g])
        # Parse TOTAL-LAG if present
        total_lag = None
        for gl in (desc.stdout or "").splitlines():
            if "TOTAL-LAG" in gl.upper() or "total-lag" in gl.lower():
                pass
            if gl.strip().upper().startswith("TOTAL-LAG") or "Total lag" in gl:
                bits = gl.replace(":", " ").split()
                for i, b in enumerate(bits):
                    if b.lower().replace("-", "") in ("totallag", "lag") and i + 1 < len(bits):
                        try:
                            total_lag = int(bits[i + 1])
                        except ValueError:
                            pass
        # rpk group describe table often has SUM
        for gl in (desc.stdout or "").splitlines():
            if "SUM" in gl and any(ch.isdigit() for ch in gl):
                nums = [int(x) for x in gl.replace(",", " ").split() if x.isdigit()]
                if nums:
                    total_lag = nums[-1]
        lag_rows.append({"group": g, "totalLag": total_lag, "describeBytes": len(desc.stdout or "")})
report["consumer_group_lags"] = lag_rows
print(f"consumer_groups={len(lag_rows)}", flush=True)

# Topic high-level
topics = sh(["docker", "exec", rp, "rpk", "topic", "list"])
report["topics"] = [
    line.split()[0] for line in (topics.stdout or "").splitlines()[1:] if line.strip()
]

# OpenSearch store + health
os_script = (
    "curl -sk -u \"admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" "
    "https://localhost:9200/_cluster/health"
)
os_h = sh(["docker", "exec", os_ctr, "bash", "-lc", os_script + " -w '\\n%{http_code}'"])
lines = (os_h.stdout or "").strip().splitlines()
code = lines[-1] if lines else "0"
body = "\n".join(lines[:-1])
try:
    health = json.loads(body) if body else {}
except json.JSONDecodeError:
    health = {}
report["opensearch_http"] = int(code) if str(code).isdigit() else 0
report["opensearch_status"] = health.get("status") if isinstance(health, dict) else None
report["opensearch_unassigned_shards"] = health.get("unassigned_shards") if isinstance(health, dict) else None

os_stats = sh(["docker", "exec", os_ctr, "bash", "-lc",
    "curl -sk -u \"admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" https://localhost:9200/_cluster/stats"])
try:
    stats = json.loads(os_stats.stdout or "{}")
    store = (((stats.get("indices") or {}).get("store") or {}).get("size_in_bytes"))
    report["opensearch_store_bytes"] = store
except json.JSONDecodeError:
    report["opensearch_store_bytes"] = None

# Postgres sizes
sizes = {}
for db in ("hivearmor", "agentmanager"):
    r = sh(["docker", "exec", pg, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c",
            f"SELECT pg_database_size('{db}');"])
    sizes[db] = int((r.stdout or "0").strip() or "0")
report["postgres_database_bytes"] = sizes

# Disk on host for backups
df = sh(["df", "-B1", "--output=size,used,avail,pcent,target", "/var/backups"])
report["host_var_backups_df"] = (df.stdout or "").strip()

# Eventprocessor container state (lag proxy: up/healthy)
ep_st = sh(["docker", "inspect", "-f", "{{.State.Status}}", ep])
report["eventprocessor_worker_status"] = (ep_st.stdout or "").strip()

report["status"] = "script-complete"
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)
print(f"SIEM009_SLO_REPORT={report_path}", flush=True)
print("status=script-complete", flush=True)
print(f"opensearch_status={report.get('opensearch_status')}", flush=True)
print(f"opensearch_store_bytes={report.get('opensearch_store_bytes')}", flush=True)
print(f"consumer_groups={len(lag_rows)}", flush=True)
PY
