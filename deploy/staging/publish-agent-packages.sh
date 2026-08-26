#!/usr/bin/env bash
# Publish allowlisted agent installer binaries for Sensors / Add Agent downloads.
#
# Copies from SOURCE_DIR into deploy/staging/agent-packages/ (host bind mount) and
# optionally into the live backend volume at /dependencies/agent.
#
# Usage:
#   SOURCE_DIR=/path/to/built/agents VERSION=11.0.0-staging \
#     bash deploy/staging/publish-agent-packages.sh
#
# Optional:
#   SYNC_DOCKER=1   also docker cp into hivearmor-staging-backend-1 (default: 1 when container up)
#   COMPOSE_DIR     default: this script's directory
#
# Status: STAGING CANDIDATE helper — does not claim PRODUCTION READY.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR}"
TARGET_DIR="${COMPOSE_DIR}/agent-packages"
SOURCE_DIR="${SOURCE_DIR:-}"
VERSION="${VERSION:-11.0.0-staging}"
UPDATER_VERSION="${UPDATER_VERSION:-$VERSION}"
SYNC_DOCKER="${SYNC_DOCKER:-auto}"
CONTAINER="${CONTAINER:-hivearmor-staging-backend-1}"

ALLOWED=(
  hivearmor_agent_service_linux_amd64
  hivearmor_agent_service_linux_arm64
  hivearmor_agent_service_darwin_amd64
  hivearmor_agent_service_darwin_arm64
  hivearmor_agent_service_windows_amd64.exe
  hivearmor_agent_service_windows_arm64.exe
)

if [[ -z "$SOURCE_DIR" ]]; then
  echo "ERROR: set SOURCE_DIR to a directory containing agent binaries" >&2
  echo "Example: SOURCE_DIR=./dist/agents VERSION=11.0.0-staging $0" >&2
  exit 1
fi
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "ERROR: SOURCE_DIR is not a directory: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
copied=0
missing=0
for name in "${ALLOWED[@]}"; do
  src="$SOURCE_DIR/$name"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$TARGET_DIR/$name"
    chmod a+r "$TARGET_DIR/$name" || true
    echo "published: $name"
    copied=$((copied + 1))
  else
    echo "skip (missing in SOURCE_DIR): $name"
    missing=$((missing + 1))
  fi
done

cat >"$TARGET_DIR/version.json" <<EOF
{
  "version": "${VERSION}",
  "updater_version": "${UPDATER_VERSION}"
}
EOF
echo "wrote version.json version=${VERSION}"

if [[ "$SYNC_DOCKER" == "auto" ]]; then
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    SYNC_DOCKER=1
  else
    SYNC_DOCKER=0
    echo "note: container $CONTAINER not running — host bind mount only (recreate backend to pick up mount if first time)"
  fi
fi

if [[ "$SYNC_DOCKER" == "1" ]]; then
  docker exec "$CONTAINER" mkdir -p /dependencies/agent /opt/hivearmor/agent-packages
  for name in "${ALLOWED[@]}"; do
    if [[ -f "$TARGET_DIR/$name" ]]; then
      docker cp "$TARGET_DIR/$name" "$CONTAINER:/dependencies/agent/$name"
      docker cp "$TARGET_DIR/$name" "$CONTAINER:/opt/hivearmor/agent-packages/$name" 2>/dev/null || true
    fi
  done
  docker cp "$TARGET_DIR/version.json" "$CONTAINER:/dependencies/agent/version.json"
  docker cp "$TARGET_DIR/version.json" "$CONTAINER:/opt/hivearmor/agent-packages/version.json" 2>/dev/null || true
  echo "synced into $CONTAINER:/dependencies/agent (and bind mount when writable)"
fi

echo "summary: copied=${copied} missing_in_source=${missing}"
echo "verify: GET /api/ha-agent-packages/summary after backend can see the files"
if [[ "$copied" -eq 0 ]]; then
  echo "ERROR: no binaries copied — publish incomplete" >&2
  exit 2
fi
