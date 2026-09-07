#!/usr/bin/env bash
# Build endpoint agent flavors with size-cull tags (DEP-SIZE-01 / AGT-SIZE-02).
#
# Flavors:
#   log  — default published Sensors download; -tags agent_slim,nonetflow
#   edr  — same tags today (collectors gated at runtime by --mode); use nonetflow
#          unless product needs netflow on the endpoint binary
#   netflow — network-sensor style; -tags agent_slim only (keeps netflow collector)
#
# Usage:
#   bash agent/scripts/build-slim.sh                 # log flavor, host GOOS/GOARCH
#   FLAVOR=edr GOOS=linux GOARCH=amd64 bash agent/scripts/build-slim.sh
#   OUT_DIR=./dist bash agent/scripts/build-slim.sh
#
# Status: STAGING CANDIDATE — does not claim PRODUCTION READY.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FLAVOR="${FLAVOR:-log}"
OUT_DIR="${OUT_DIR:-$ROOT/build/slim}"
REPLACE_KEY="${REPLACE_KEY:-size-audit-dummy}"
STRIP="${STRIP:-0}"

case "$FLAVOR" in
  log|edr)
    GO_TAGS="agent_slim,nonetflow"
    ;;
  netflow)
    GO_TAGS="agent_slim"
    ;;
  *)
    echo "ERROR: FLAVOR must be log|edr|netflow (got: $FLAVOR)" >&2
    exit 1
    ;;
esac

GOOS="${GOOS:-$(go env GOOS)}"
GOARCH="${GOARCH:-$(go env GOARCH)}"
mkdir -p "$OUT_DIR"

ext=""
if [[ "$GOOS" == "windows" ]]; then
  ext=".exe"
fi
out_name="hivearmor_agent_service_${GOOS}_${GOARCH}${ext}"
# Publish script allowlist uses hivearmor_agent_service_* without "flavor" infix.
# Document flavor in a sibling .flavor file for ops.
out_path="$OUT_DIR/$out_name"

ldflags="-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${REPLACE_KEY}'"
if [[ "$STRIP" == "1" ]]; then
  ldflags="-s -w ${ldflags}"
fi

echo "building flavor=${FLAVOR} tags=${GO_TAGS} GOOS=${GOOS} GOARCH=${GOARCH} -> ${out_path}"
CGO_ENABLED=0 go build -trimpath -tags "$GO_TAGS" -ldflags "$ldflags" -o "$out_path" .

printf '%s\n' "$FLAVOR" >"${out_path}.flavor"
echo "tags=${GO_TAGS}" >"${out_path}.buildinfo"
echo "ok: $(wc -c <"$out_path" | tr -d ' ') bytes"
