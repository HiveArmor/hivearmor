#!/usr/bin/env bash
set -euo pipefail
# SIEM-009 / ACC-12 subset. Does not print dump contents, JWTs, _source, or .env.
# Proves: Postgres dumps, throwaway restore, OpenSearch snapshot + renamed restore,
# copy of dumps+snapshot tarball off the OpenSearch data volume, Redpanda named volume,
# and a staging ISM hot-retention policy. Not a new-VM rebuild. Not off-box WORM.

MODE="drill"
if [[ "${1:-}" == "--mode" ]]; then
  MODE="${2:-drill}"
elif [[ -n "${1:-}" ]]; then
  MODE="$1"
fi
case "$MODE" in
  drill|backup|capacity) ;;
  *) echo "usage: $0 [--mode drill|backup|capacity]" >&2; exit 2 ;;
esac

STAGING="$(cd "$(dirname "$0")" && pwd)"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-siem009-backup-restore.json}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hivearmor}"
# Off the OpenSearch docker volume (still same VM root filesystem — not a second host).
OFFHOST_DIR="${OFFHOST_DIR:-/var/backups/hivearmor-offhost}"
PG="${PG_CONTAINER:-hivearmor-staging-postgres-1}"
OS="${OS_CONTAINER:-hivearmor-staging-opensearch-1}"
BACKEND="${BACKEND_CONTAINER:-hivearmor-staging-backend-1}"
RP="${RP_CONTAINER:-hivearmor-staging-redpanda-1}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAP="siem009-${STAMP}"

mkdir -p "$BACKUP_DIR" "$OFFHOST_DIR"
chmod 700 "$BACKUP_DIR" "$OFFHOST_DIR"

if [[ "$MODE" != "capacity" ]]; then
  for db in hivearmor agentmanager; do
    dest="$BACKUP_DIR/${db}-${STAMP}.dump"
    docker exec "$PG" pg_dump -U postgres -Fc -d "$db" > "$dest"
    chmod 600 "$dest"
    echo "PASS: pg_dump $db bytes=$(wc -c < "$dest" | tr -d ' ')"
  done
fi

export HA_SIEM009_MODE="$MODE"
export HA_SIEM009_REPORT="$REPORT"
export HA_SIEM009_BACKUP_DIR="$BACKUP_DIR"
export HA_SIEM009_OFFHOST_DIR="$OFFHOST_DIR"
export HA_SIEM009_STAMP="$STAMP"
export HA_SIEM009_SNAP="$SNAP"
export HA_SIEM009_PG="$PG"
export HA_SIEM009_OS="$OS"
export HA_SIEM009_BACKEND="$BACKEND"
export HA_SIEM009_RP="$RP"

python3 <<'PY'
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

mode = os.environ["HA_SIEM009_MODE"]
report_path = Path(os.environ["HA_SIEM009_REPORT"])
backup_dir = Path(os.environ["HA_SIEM009_BACKUP_DIR"])
offhost_dir = Path(os.environ["HA_SIEM009_OFFHOST_DIR"])
stamp = os.environ["HA_SIEM009_STAMP"]
snap_name = os.environ["HA_SIEM009_SNAP"].lower()
pg = os.environ["HA_SIEM009_PG"]
os_ctr = os.environ["HA_SIEM009_OS"]
backend = os.environ["HA_SIEM009_BACKEND"]
rp = os.environ["HA_SIEM009_RP"]

report: dict[str, object] = {
    "mode": mode,
    "stamp": stamp,
    "limitations": [
        "Off-host copy is off the OpenSearch data volume onto the same VM root disk — not a second host or WORM",
        "Live hivearmor/agentmanager databases were not replaced",
        "Redpanda topic restore from volume was not exercised (named volume persistence only)",
        "No invented SLO targets / lag dashboard",
        "New-VM restore remains open",
    ],
}


def sh_text(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, text=True, capture_output=True, check=False)


def expect(label: str, ok: bool, detail: str = "") -> None:
    if not ok:
        raise SystemExit(f"FAIL: {label} {detail}".strip())
    print(f"PASS: {label}", flush=True)


def pg_sql(database: str, sql: str) -> str:
    result = sh_text(["docker", "exec", pg, "psql", "-U", "postgres", "-d", database, "-At", "-c", sql])
    if result.returncode != 0:
        raise SystemExit(f"FAIL: psql {database}: {(result.stderr or '')[:300]}")
    return (result.stdout or "").strip()


def os_curl(path: str, method: str = "GET", body: dict | None = None) -> tuple[int, object]:
    if body is None:
        script = (
            "curl -sk -o /tmp/ha-os-body.json -w '%{http_code}' "
            "-u \"admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" "
            f"-X {method} https://localhost:9200{path}"
        )
    else:
        payload = json.dumps(body)
        script = (
            "cat > /tmp/ha-os-req.json <<'EOF'\n"
            f"{payload}\n"
            "EOF\n"
            "curl -sk -o /tmp/ha-os-body.json -w '%{http_code}' "
            "-u \"admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}\" "
            f"-X {method} -H 'Content-Type: application/json' "
            f"--data-binary @/tmp/ha-os-req.json https://localhost:9200{path}"
        )
    result = sh_text(["docker", "exec", os_ctr, "bash", "-lc", script])
    code = int((result.stdout or "0").strip().splitlines()[-1] if (result.stdout or "").strip() else "0")
    pulled = sh_text(["docker", "exec", os_ctr, "cat", "/tmp/ha-os-body.json"])
    raw = pulled.stdout or ""
    try:
        parsed: object = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = {"_non_json": True, "length": len(raw)}
    return code, parsed


print(f"mode={mode}", flush=True)
health = sh_text(["docker", "inspect", "-f", "{{.State.Health.Status}}", backend])
report["backend_health"] = (health.stdout or "").strip()
print(f"backend_health={report['backend_health']}", flush=True)
expect("backend healthy", report["backend_health"] == "healthy")

code, cluster = os_curl("/_cluster/health")
expect("OpenSearch health HTTP 200", code == 200)
status = cluster.get("status") if isinstance(cluster, dict) else None
report["opensearch_status"] = status
print(f"opensearch_status={status}", flush=True)
expect("OpenSearch green or yellow", status in ("green", "yellow"))

code, stats = os_curl("/_cluster/stats")
if code == 200 and isinstance(stats, dict):
    indices = stats.get("indices") if isinstance(stats.get("indices"), dict) else {}
    store = indices.get("store") if isinstance(indices.get("store"), dict) else {}
    report["opensearch_store_bytes"] = store.get("size_in_bytes")
    print(f"opensearch_store_bytes={report['opensearch_store_bytes']}", flush=True)

sizes = {
    db: int(pg_sql("postgres", f"SELECT pg_database_size('{db}');") or "0")
    for db in ("hivearmor", "agentmanager")
}
report["postgres_database_bytes"] = sizes
print(f"postgres_hivearmor_bytes={sizes['hivearmor']}", flush=True)
print(f"postgres_agentmanager_bytes={sizes['agentmanager']}", flush=True)

mounts = sh_text([
    "docker", "inspect", "-f",
    "{{range .Mounts}}{{.Name}}={{.Destination}};{{end}}",
    rp,
])
mount_text = (mounts.stdout or "").strip()
report["redpanda_mounts"] = mount_text
named = "redpanda_data" in mount_text and "/var/lib/redpanda/data" in mount_text
report["redpanda_named_volume"] = named
print(f"redpanda_named_volume={named}", flush=True)
if named:
    print("PASS: redpanda uses named durable volume", flush=True)
else:
    print("WARN: redpanda named volume missing", flush=True)
    report["limitations"].append("Redpanda named volume not attached")

if mode == "capacity":
    report["status"] = "script-complete"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"SIEM009_REPORT={report_path}", flush=True)
    print("status=script-complete", flush=True)
    raise SystemExit(0)

dumps = {}
for db in ("hivearmor", "agentmanager"):
    dest = backup_dir / f"{db}-{stamp}.dump"
    dumps[db] = dest.stat().st_size
    expect(f"{db} dump present", dest.is_file() and dumps[db] > 32)
report["dump_bytes"] = dumps

mkdir = sh_text(["docker", "exec", os_ctr, "bash", "-lc",
                 "mkdir -p /usr/share/opensearch/data/ha-snapshots"])
expect("snapshot directory", mkdir.returncode == 0)

code, _repo = os_curl("/_snapshot/ha_fs")
if code != 200:
    code, created = os_curl(
        "/_snapshot/ha_fs",
        "PUT",
        {"type": "fs", "settings": {"location": "/usr/share/opensearch/data/ha-snapshots", "compress": True}},
    )
report["snapshot_repo_http"] = code
print(f"snapshot_repo_http={code}", flush=True)

code, cat = os_curl("/_cat/indices/v3-hive-*?format=json&h=index,docs.count")
data_indices = [
    row for row in (cat if isinstance(cat, list) else [])
    if isinstance(row, dict)
    and str(row.get("index", "")).startswith("v3-hive-")
    and not str(row.get("index", "")).startswith("restore-drill-")
]
report["v3_hive_index_count"] = len(data_indices)
print(f"v3_hive_index_count={len(data_indices)}", flush=True)

if data_indices:
    index_csv = ",".join(str(row["index"]) for row in data_indices[:20])
    code, snap = os_curl(
        f"/_snapshot/ha_fs/{snap_name}?wait_for_completion=true",
        "PUT",
        {"indices": index_csv, "ignore_unavailable": True, "include_global_state": False},
    )
    state = None
    if isinstance(snap, dict):
        inner = snap.get("snapshot") if isinstance(snap.get("snapshot"), dict) else snap
        state = inner.get("state") if isinstance(inner, dict) else None
    report["snapshot_put_http"] = code
    report["snapshot_state"] = state
    print(f"snapshot_state={state}", flush=True)
    if state not in ("SUCCESS", "PARTIAL"):
        report["limitations"].append(f"OpenSearch snapshot state={state} HTTP {code}")
    else:
        print("PASS: OpenSearch snapshot completed", flush=True)
else:
    report["limitations"].append("no v3-hive-* indices to snapshot")
    print("WARN: no v3-hive-* indices", flush=True)

# Staging ISM: hot retention delete after 14 days for v3-hive-* (idempotent upsert).
ism_policy = {
    "policy": {
        "description": "HiveArmor staging hot retention for v3-hive-* indices",
        "default_state": "hot",
        "states": [
            {
                "name": "hot",
                "actions": [],
                "transitions": [
                    {
                        "state_name": "delete",
                        "conditions": {"min_index_age": "14d"},
                    }
                ],
            },
            {
                "name": "delete",
                "actions": [{"delete": {}}],
                "transitions": [],
            },
        ],
        "ism_template": [
            {
                "index_patterns": ["v3-hive-*"],
                "priority": 100,
            }
        ],
    }
}
code, existing = os_curl("/_plugins/_ism/policies/ha-hot-retention")
ism_http = code
if code == 200 and isinstance(existing, dict) and "_seq_no" in existing:
    seq = existing.get("_seq_no")
    pri = existing.get("_primary_term")
    ism_http, _upd = os_curl(
        f"/_plugins/_ism/policies/ha-hot-retention?if_seq_no={seq}&if_primary_term={pri}",
        "PUT",
        ism_policy,
    )
else:
    ism_http, _upd = os_curl("/_plugins/_ism/policies/ha-hot-retention", "PUT", ism_policy)
    if ism_http == 409:
        code2, existing2 = os_curl("/_plugins/_ism/policies/ha-hot-retention")
        if code2 == 200 and isinstance(existing2, dict) and "_seq_no" in existing2:
            seq = existing2.get("_seq_no")
            pri = existing2.get("_primary_term")
            ism_http, _upd = os_curl(
                f"/_plugins/_ism/policies/ha-hot-retention?if_seq_no={seq}&if_primary_term={pri}",
                "PUT",
                ism_policy,
            )
report["ism_policy_http"] = ism_http
print(f"ism_policy_http={ism_http}", flush=True)
# 200/201 = written; also accept GET-proof that policy exists after race.
if ism_http not in (200, 201):
    verify_code, verify_body = os_curl("/_plugins/_ism/policies/ha-hot-retention")
    report["ism_policy_get_http"] = verify_code
    expect("ISM ha-hot-retention present", verify_code == 200 and isinstance(verify_body, dict))
else:
    expect("ISM ha-hot-retention upserted", True)
print("PASS: ISM ha-hot-retention policy present", flush=True)

# Off-volume copy: dumps + OpenSearch snapshot tarball onto OFFHOST_DIR.
offhost_stamp = offhost_dir / stamp
offhost_stamp.mkdir(parents=True, exist_ok=True)
offhost_stamp.chmod(0o700)
copied_dumps = {}
for db in ("hivearmor", "agentmanager"):
    src = backup_dir / f"{db}-{stamp}.dump"
    dst = offhost_stamp / f"{db}.dump"
    shutil.copy2(src, dst)
    dst.chmod(0o600)
    copied_dumps[db] = dst.stat().st_size
    expect(f"offhost {db} dump", copied_dumps[db] == dumps[db] and copied_dumps[db] > 32)

snap_tar = offhost_stamp / "opensearch-ha-snapshots.tar.gz"
# Stream tar from inside the OpenSearch container (data volume) to offhost path.
bin_proc = subprocess.run(
    ["docker", "exec", os_ctr, "bash", "-lc", "tar -C /usr/share/opensearch/data -czf - ha-snapshots"],
    capture_output=True,
    check=False,
)
expect("snapshot tar from OpenSearch volume", bin_proc.returncode == 0 and len(bin_proc.stdout) > 32)
snap_tar.write_bytes(bin_proc.stdout)
snap_tar.chmod(0o600)
report["offhost_dir"] = str(offhost_stamp)
report["offhost_dump_bytes"] = copied_dumps
report["offhost_snapshot_tar_bytes"] = snap_tar.stat().st_size
print(f"offhost_snapshot_tar_bytes={report['offhost_snapshot_tar_bytes']}", flush=True)
print("PASS: off-volume backup copy written", flush=True)

# Confirm offhost path is not inside the OpenSearch container mount source.
os_mount = sh_text([
    "docker", "inspect", "-f",
    "{{range .Mounts}}{{if eq .Destination \"/usr/share/opensearch/data\"}}{{.Source}}{{end}}{{end}}",
    os_ctr,
])
os_source = (os_mount.stdout or "").strip()
report["opensearch_data_volume_source"] = os_source
offhost_resolved = str(offhost_stamp.resolve())
same_volume = bool(os_source) and offhost_resolved.startswith(os_source.rstrip("/") + "/")
report["offhost_on_opensearch_data_volume"] = same_volume
expect("offhost path outside OpenSearch data volume", not same_volume)

if mode == "backup":
    report["status"] = "script-complete"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report_path.chmod(0o600)
    print(f"SIEM009_REPORT={report_path}", flush=True)
    print("status=script-complete", flush=True)
    raise SystemExit(0)

pg_sql("postgres", "DROP DATABASE IF EXISTS hivearmor_restore_drill WITH (FORCE);")
pg_sql("postgres", "CREATE DATABASE hivearmor_restore_drill;")
dump_path = backup_dir / f"hivearmor-{stamp}.dump"
copied = sh_text(["docker", "cp", str(dump_path), f"{pg}:/tmp/hivearmor-restore.dump"])
expect("copy dump into postgres", copied.returncode == 0)
restored = sh_text([
    "docker", "exec", pg, "pg_restore", "-U", "postgres", "-d", "hivearmor_restore_drill",
    "--no-owner", "--no-privileges", "/tmp/hivearmor-restore.dump",
])
report["pg_restore_exit"] = restored.returncode

counts = {}
for table in ("hive_incident", "hive_evidence_item", "hive_retention_policy", "jhi_user"):
    live = pg_sql("hivearmor", f"SELECT COUNT(*) FROM {table};")
    drill = pg_sql("hivearmor_restore_drill", f"SELECT COUNT(*) FROM {table};")
    counts[table] = {"live": int(live), "restored": int(drill)}
    print(f"restore_count_{table}_live={live}_restored={drill}", flush=True)
    if live != drill:
        raise SystemExit(f"FAIL: {table} count mismatch live={live} restored={drill}")
report["postgres_restore_counts"] = counts
print("PASS: throwaway hivearmor restore counts match live", flush=True)
pg_sql("postgres", "DROP DATABASE IF EXISTS hivearmor_restore_drill WITH (FORCE);")
sh_text(["docker", "exec", pg, "rm", "-f", "/tmp/hivearmor-restore.dump"])
print("PASS: dropped hivearmor_restore_drill", flush=True)

if data_indices and report.get("snapshot_state") in ("SUCCESS", "PARTIAL"):
    source = sorted(data_indices, key=lambda row: int(str(row.get("docs.count") or "0")))[0]
    source_index = str(source["index"])
    live_docs = int(str(source.get("docs.count") or "0"))
    report["restore_source_docs"] = live_docs
    dest = "restore-drill-" + source_index
    code, _restore = os_curl(
        f"/_snapshot/ha_fs/{snap_name}/_restore?wait_for_completion=true",
        "POST",
        {
            "indices": source_index,
            "ignore_unavailable": True,
            "include_global_state": False,
            "rename_pattern": "(.+)",
            "rename_replacement": "restore-drill-$1",
        },
    )
    report["opensearch_restore_http"] = code
    counted = None
    for _ in range(15):
        c2, body = os_curl(f"/{dest}/_count")
        if c2 == 200 and isinstance(body, dict) and "count" in body:
            counted = int(body["count"])
            break
        time.sleep(2)
    report["opensearch_restore_docs"] = counted
    print(f"opensearch_restore_docs={counted}", flush=True)
    if counted != live_docs:
        raise SystemExit(f"FAIL: restore docs {counted} != live {live_docs}")
    print("PASS: renamed OpenSearch restore doc count matches", flush=True)
    os_curl(f"/{dest}", "DELETE")
    print("PASS: deleted restore-drill index", flush=True)
else:
    report["limitations"].append("OpenSearch renamed restore skipped")

report["status"] = "script-complete"
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
report_path.chmod(0o600)
print(f"SIEM009_REPORT={report_path}", flush=True)
print("status=script-complete", flush=True)
PY
