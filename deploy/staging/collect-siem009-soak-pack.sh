#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: package soak samples into an evidence pack.
# Measured signals only — no invented SLO thresholds.
# COMPLETE requires wall-clock span >= 24h among sample-*.json files.

STAGING="$(cd "$(dirname "$0")" && pwd)"
SOAK_DIR="${SOAK_DIR:-/home/ubuntu/hivearmor-slo-soak}"
OUT_DIR="${OUT_DIR:-/var/tmp}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="${REPORT_FILE:-$OUT_DIR/hivearmor-siem009-soak-pack.json}"
TAR="${TAR_FILE:-$OUT_DIR/hivearmor-siem009-soak-pack-${STAMP}.tar.gz}"
MIN_HOURS="${MIN_HOURS:-24}"

export HA_SOAK_DIR="$SOAK_DIR"
export HA_SOAK_REPORT="$REPORT"
export HA_SOAK_TAR="$TAR"
export HA_SOAK_STAMP="$STAMP"
export HA_SOAK_MIN_HOURS="$MIN_HOURS"

python3 <<'PY'
from __future__ import annotations

import json
import os
import tarfile
from datetime import datetime, timezone
from pathlib import Path

soak_dir = Path(os.environ["HA_SOAK_DIR"])
report_path = Path(os.environ["HA_SOAK_REPORT"])
tar_path = Path(os.environ["HA_SOAK_TAR"])
stamp = os.environ["HA_SOAK_STAMP"]
min_hours = float(os.environ["HA_SOAK_MIN_HOURS"])

if not soak_dir.is_dir():
    raise SystemExit(f"FAIL: soak dir missing: {soak_dir}")

samples = sorted(soak_dir.glob("sample-*.json"))
if not samples:
    raise SystemExit("FAIL: no sample-*.json files in soak dir")


def parse_sample(path: Path) -> dict[str, object]:
    data = json.loads(path.read_text(encoding="utf-8"))
    lag = None
    groups = data.get("consumer_group_lags")
    if isinstance(groups, list) and groups:
        first = groups[0]
        if isinstance(first, dict):
            lag = first.get("totalLag")
    recorded = data.get("recordedAt")
    if not isinstance(recorded, str) or not recorded:
        # fallback: stamp in filename sample-YYYYMMDDTHHMMSSZ.json
        name = path.name
        if name.startswith("sample-") and name.endswith(".json"):
            recorded = name[len("sample-") : -len(".json")]
            # normalize to ISO-ish
            if len(recorded) == 16 and recorded.endswith("Z"):
                recorded = (
                    f"{recorded[0:4]}-{recorded[4:6]}-{recorded[6:8]}T"
                    f"{recorded[9:11]}:{recorded[11:13]}:{recorded[13:15]}+00:00"
                )
    return {
        "file": path.name,
        "recordedAt": recorded,
        "backend_health": data.get("backend_health"),
        "redpanda_health": data.get("redpanda_health"),
        "opensearch_status": data.get("opensearch_status"),
        "opensearch_store_bytes": data.get("opensearch_store_bytes"),
        "opensearch_unassigned_shards": data.get("opensearch_unassigned_shards"),
        "eventprocessor_worker_status": data.get("eventprocessor_worker_status"),
        "consumer_lag_event_processor": lag,
        "postgres_database_bytes": data.get("postgres_database_bytes"),
    }


rows = [parse_sample(p) for p in samples]


def to_dt(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


times = [t for t in (to_dt(r["recordedAt"]) for r in rows) if t is not None]
if not times:
    # fall back to file mtimes
    times = [datetime.fromtimestamp(p.stat().st_mtime, timezone.utc) for p in samples]

first = min(times)
last = max(times)
span_hours = (last - first).total_seconds() / 3600.0
complete = span_hours >= min_hours and len(samples) >= max(2, int(min_hours * 0.75))

lags = [r["consumer_lag_event_processor"] for r in rows if isinstance(r["consumer_lag_event_processor"], int)]
os_statuses = [r["opensearch_status"] for r in rows if r["opensearch_status"]]
backend_ok = all(r.get("backend_health") == "healthy" for r in rows)
redpanda_ok = all(r.get("redpanda_health") == "healthy" for r in rows)

status = "LIVE_VERIFIED_24H_SOAK" if complete else "PARTIAL_SOAK"

report: dict[str, object] = {
    "workId": "SIEM-009",
    "gate": "siem009-24h-soak-pack",
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "soakDir": str(soak_dir),
    "sampleCount": len(samples),
    "firstSampleAt": first.isoformat(),
    "lastSampleAt": last.isoformat(),
    "spanHours": round(span_hours, 3),
    "minHoursRequired": min_hours,
    "complete": complete,
    "status": status,
    "seriesSummary": {
        "backendAlwaysHealthy": backend_ok,
        "redpandaAlwaysHealthy": redpanda_ok,
        "opensearchStatusesSeen": sorted({str(s) for s in os_statuses}),
        "consumerLagMin": min(lags) if lags else None,
        "consumerLagMax": max(lags) if lags else None,
        "consumerLagLast": lags[-1] if lags else None,
        "opensearchStoreBytesFirst": rows[0].get("opensearch_store_bytes"),
        "opensearchStoreBytesLast": rows[-1].get("opensearch_store_bytes"),
    },
    "samples": rows,
    "packTar": str(tar_path),
    "limitations": [
        "Measured signals only — no invented SLO pass/fail thresholds",
        "PARTIAL_SOAK until wall-clock spanHours >= minHoursRequired",
        "Not a Grafana board",
        "Not PRODUCTION READY",
        "Not a brand-new Linux VM restore",
    ],
}

report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)

with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(report_path, arcname=f"hivearmor-siem009-soak-pack-{stamp}/summary.json")
    for sample in samples:
        tar.add(sample, arcname=f"hivearmor-siem009-soak-pack-{stamp}/samples/{sample.name}")
    latest = soak_dir / "latest.json"
    if latest.exists():
        tar.add(latest, arcname=f"hivearmor-siem009-soak-pack-{stamp}/samples/latest.json")
tar_path.chmod(0o600)

print(f"sample_count={len(samples)}", flush=True)
print(f"span_hours={span_hours:.3f}", flush=True)
print(f"complete={complete}", flush=True)
print(f"status={status}", flush=True)
print(f"SIEM009_SOAK_PACK_REPORT={report_path}", flush=True)
print(f"SIEM009_SOAK_PACK_TAR={tar_path}", flush=True)
if not complete:
    from datetime import timedelta

    remaining = max(0.0, min_hours - span_hours)
    eta = last + timedelta(hours=remaining)
    print(f"hours_remaining_estimate={remaining:.2f}", flush=True)
    print(f"eta_complete_utc={eta.isoformat()}", flush=True)
PY
