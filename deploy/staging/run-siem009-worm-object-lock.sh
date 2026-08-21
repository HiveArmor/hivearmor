#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: object-store Object Lock drill for an offhost backup stamp.
#
# Default: MinIO on the staging VM with bucket Object Lock (COMPLIANCE).
# Optional external S3-compatible: HA_WORM_MODE=s3 plus
#   HA_WORM_ENDPOINT HA_WORM_BUCKET HA_WORM_ACCESS_KEY HA_WORM_SECRET_KEY
#
# Object Lock protects object *versions* (a second PUT creates a new version).
# This drill verifies: upload with COMPLIANCE retention, second PUT creates a new
# version, deleting a locked version is denied, content of locked version remains.
#
# Not an AWS commercial Glacier WORM claim. Does not print secrets or dump contents.

OFFHOST_ROOT="${OFFHOST_ROOT:-/var/backups/hivearmor-offhost}"
REPORT="${REPORT_FILE:-/var/tmp/hivearmor-siem009-worm-object-lock.json}"
STAMP_OVERRIDE="${HA_WORM_STAMP:-}"
RETENTION="${HA_WORM_RETENTION:-1d}"
RETENTION_MODE="${HA_WORM_RETENTION_MODE:-COMPLIANCE}"
MODE="${HA_WORM_MODE:-minio}"
MINIO_NAME="${HA_WORM_MINIO_NAME:-hivearmor-staging-minio-worm}"
MINIO_PORT="${HA_WORM_MINIO_PORT:-19000}"
MINIO_CONSOLE_PORT="${HA_WORM_MINIO_CONSOLE_PORT:-19001}"
SECRET_DIR="${HA_WORM_SECRET_DIR:-/var/tmp/ha-worm-secrets}"
MC_IMAGE="${HA_WORM_MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}"
MINIO_IMAGE="${HA_WORM_MINIO_IMAGE:-minio/minio:RELEASE.2025-04-22T22-12-26Z}"
BUCKET="${HA_WORM_BUCKET:-hivearmor-staging-worm-compliance}"

mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

if [[ -n "$STAMP_OVERRIDE" ]]; then
  STAMP_DIR="$OFFHOST_ROOT/$STAMP_OVERRIDE"
else
  STAMP_DIR="$(sudo bash -c "ls -1dt '$OFFHOST_ROOT'/*/ 2>/dev/null | head -1" || true)"
fi
if [[ -z "${STAMP_DIR:-}" ]]; then
  echo "FAIL: no offhost stamp under $OFFHOST_ROOT — run run-siem009-backup-restore.sh first" >&2
  exit 2
fi
STAMP_DIR="${STAMP_DIR%/}"
if ! sudo test -d "$STAMP_DIR"; then
  echo "FAIL: stamp dir missing: $STAMP_DIR" >&2
  exit 2
fi
STAMP="$(basename "$STAMP_DIR")"
echo "offhost_stamp=$STAMP"

ensure_secret() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    openssl rand -base64 24 | tr -d '\n' >"$path"
    chmod 600 "$path"
  fi
}
ensure_secret "$SECRET_DIR/minio-root-user.txt"
ensure_secret "$SECRET_DIR/minio-root-password.txt"
ROOT_USER="$(cat "$SECRET_DIR/minio-root-user.txt")"
ROOT_PASS="$(cat "$SECRET_DIR/minio-root-password.txt")"

ENDPOINT="${HA_WORM_ENDPOINT:-}"
ACCESS_KEY="${HA_WORM_ACCESS_KEY:-}"
SECRET_KEY="${HA_WORM_SECRET_KEY:-}"

if [[ "$MODE" == "minio" ]]; then
  if ! docker inspect "$MINIO_NAME" >/dev/null 2>&1; then
    docker volume create hivearmor_staging_minio_worm_data >/dev/null
    docker run -d --name "$MINIO_NAME" --restart unless-stopped \
      -p "127.0.0.1:${MINIO_PORT}:9000" \
      -p "127.0.0.1:${MINIO_CONSOLE_PORT}:9001" \
      -e "MINIO_ROOT_USER=${ROOT_USER}" \
      -e "MINIO_ROOT_PASSWORD=${ROOT_PASS}" \
      -v hivearmor_staging_minio_worm_data:/data \
      "$MINIO_IMAGE" server /data --console-address ":9001" >/dev/null
  fi
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null && break
    sleep 1
  done
  if ! curl -sf "http://127.0.0.1:${MINIO_PORT}/minio/health/live" >/dev/null; then
    echo "FAIL: MinIO not healthy on 127.0.0.1:${MINIO_PORT}" >&2
    exit 1
  fi
  ENDPOINT="http://127.0.0.1:${MINIO_PORT}"
  ACCESS_KEY="$ROOT_USER"
  SECRET_KEY="$ROOT_PASS"
  echo "mode=minio endpoint=${ENDPOINT} bucket=${BUCKET}"
elif [[ "$MODE" == "s3" ]]; then
  if [[ -z "$ENDPOINT" || -z "$ACCESS_KEY" || -z "$SECRET_KEY" ]]; then
    echo "FAIL: HA_WORM_MODE=s3 requires HA_WORM_ENDPOINT, HA_WORM_ACCESS_KEY, HA_WORM_SECRET_KEY" >&2
    exit 2
  fi
  echo "mode=s3 endpoint=${ENDPOINT} bucket=${BUCKET}"
else
  echo "FAIL: HA_WORM_MODE must be minio or s3" >&2
  exit 2
fi

WORK="$(mktemp -d /tmp/ha-worm-stamp.XXXXXX)"
chmod 700 "$WORK"
sudo tar -C "$(dirname "$STAMP_DIR")" -cf - "$(basename "$STAMP_DIR")" | tar -C "$WORK" -xf -
SRC="$WORK/$STAMP"
trap 'rm -rf "$WORK"' EXIT

mc() {
  docker run --rm --network host --entrypoint /bin/sh \
    -v "$SRC:/stamp:ro" \
    "$MC_IMAGE" \
    -c "mc alias set worm '${ENDPOINT}' '${ACCESS_KEY}' '${SECRET_KEY}' >/dev/null && $*"
}

echo "=== prepare bucket with object-lock ==="
mc "mc mb --with-lock worm/${BUCKET} 2>/dev/null || true"
mc "mc retention set --default ${RETENTION_MODE} ${RETENTION} worm/${BUCKET} 2>/dev/null || true"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
PREFIX="${STAMP}/${RUN_ID}"
echo "object_prefix=$PREFIX"

UPLOAD_BYTES=0
OBJECT_COUNT=0
FIRST_NAME=""
for f in "$SRC"/*; do
  [[ -f "$f" ]] || continue
  name="$(basename "$f")"
  if [[ -z "$FIRST_NAME" ]]; then FIRST_NAME="$name"; fi
  bytes=$(wc -c <"$f" | tr -d ' ')
  UPLOAD_BYTES=$((UPLOAD_BYTES + bytes))
  OBJECT_COUNT=$((OBJECT_COUNT + 1))
  echo "upload $name ($bytes bytes)"
  mc "mc cp /stamp/${name} worm/${BUCKET}/${PREFIX}/${name}"
done

if [[ "$OBJECT_COUNT" -lt 1 || -z "$FIRST_NAME" ]]; then
  echo "FAIL: no files uploaded" >&2
  exit 1
fi

OBJ="worm/${BUCKET}/${PREFIX}/${FIRST_NAME}"

STAT1="$(mc "mc stat --json ${OBJ}")"
VERSION1="$(printf '%s' "$STAT1" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("versionID",""))')"
ETAG1="$(printf '%s' "$STAT1" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("etag",""))')"
MODE1="$(printf '%s' "$STAT1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("metadata") or {}).get("X-Amz-Object-Lock-Mode",""))')"
echo "v1_version=$VERSION1 lock_mode=$MODE1"

if [[ -z "$VERSION1" || "$MODE1" != "$RETENTION_MODE" ]]; then
  echo "FAIL: expected ${RETENTION_MODE} lock on uploaded object" >&2
  exit 1
fi
echo "PASS: object uploaded with ${RETENTION_MODE} retention"

echo "=== second PUT creates a new version (key overwrite is not WORM violation) ==="
mc "mc cp /stamp/${FIRST_NAME} ${OBJ}"
STAT2="$(mc "mc stat --json ${OBJ}")"
VERSION2="$(printf '%s' "$STAT2" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("versionID",""))')"
echo "v2_version=$VERSION2"
if [[ "$VERSION2" == "$VERSION1" || -z "$VERSION2" ]]; then
  echo "FAIL: expected a distinct new version after second PUT" >&2
  exit 1
fi
echo "PASS: second PUT created new version"

echo "=== delete locked version must fail ==="
set +e
mc "mc rm --vid ${VERSION1} --force ${OBJ}"
DEL_RC=$?
set -e
if [[ "$DEL_RC" -eq 0 ]]; then
  echo "FAIL: delete of locked version unexpectedly succeeded" >&2
  exit 1
fi
echo "PASS: delete locked version denied rc=$DEL_RC"

echo "=== locked version still readable ==="
STAT_V1="$(mc "mc stat --json --vid ${VERSION1} ${OBJ}")"
ETAG_V1="$(printf '%s' "$STAT_V1" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("etag",""))')"
if [[ "$ETAG_V1" != "$ETAG1" ]]; then
  echo "FAIL: locked version etag changed ($ETAG1 -> $ETAG_V1)" >&2
  exit 1
fi
echo "PASS: locked version etag unchanged"

LIST_OUT="$(mc "mc ls --versions ${OBJ}" || true)"
LIST_LINES="$(printf '%s\n' "$LIST_OUT" | grep -c . || true)"
echo "version_lines=$LIST_LINES"

python3 - "$REPORT" "$MODE" "$BUCKET" "$STAMP" "$OBJECT_COUNT" "$UPLOAD_BYTES" "$RETENTION" "$DEL_RC" "$LIST_LINES" "$PREFIX" "$RETENTION_MODE" "$VERSION1" "$VERSION2" "$ETAG1" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
report = {
    "workId": "SIEM-009",
    "gate": "siem009-worm-object-lock",
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "mode": sys.argv[2],
    "bucket": sys.argv[3],
    "stamp": sys.argv[4],
    "objectPrefix": sys.argv[10],
    "objectCount": int(sys.argv[5]),
    "uploadBytes": int(sys.argv[6]),
    "retention": sys.argv[7],
    "retentionMode": sys.argv[11],
    "version1": sys.argv[12],
    "version2": sys.argv[13],
    "lockedVersionEtag": sys.argv[14],
    "lockedVersionDeleteDenied": int(sys.argv[8]) != 0,
    "lockedVersionDeleteRc": int(sys.argv[8]),
    "versionListLines": int(sys.argv[9]),
    "status": "LIVE_VERIFIED",
    "limitations": [
        "Staging MinIO Object Lock drill unless HA_WORM_MODE=s3 with operator credentials",
        "S3 Object Lock protects versions; a second PUT creates a new version",
        "COMPLIANCE retention — not a commercial AWS Glacier WORM claim",
        "Not a brand-new Linux VM restore",
        "Not PRODUCTION READY",
    ],
}
path = Path(sys.argv[1])
path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
path.chmod(0o600)
print("SIEM009_WORM_REPORT=" + str(path))
print("status=" + report["status"])
PY
