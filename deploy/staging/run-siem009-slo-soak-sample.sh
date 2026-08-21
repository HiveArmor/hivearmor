#!/usr/bin/env bash
set -euo pipefail
# SIEM-009: one soak sample into /var/backups/hivearmor-slo-soak and refresh latest.json.
# Does not invent thresholds. Safe to run from systemd timer.

STAGING="$(cd "$(dirname "$0")" && pwd)"
SOAK_DIR="${SOAK_DIR:-/home/ubuntu/hivearmor-slo-soak}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SOAK_DIR"
chmod 700 "$SOAK_DIR"

REPORT_FILE="$SOAK_DIR/sample-${STAMP}.json" \
  bash "$STAGING/run-siem009-slo-lag.sh"

cp -f "$SOAK_DIR/sample-${STAMP}.json" "$SOAK_DIR/latest.json"
chmod 600 "$SOAK_DIR/sample-${STAMP}.json" "$SOAK_DIR/latest.json"
echo "SOAK_SAMPLE=$SOAK_DIR/sample-${STAMP}.json"
echo "SOAK_LATEST=$SOAK_DIR/latest.json"
