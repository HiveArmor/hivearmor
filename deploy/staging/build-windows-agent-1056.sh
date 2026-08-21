#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/ubuntu/HiveArmor-v1
WRAP=/root/hivearmor-agent-wrap.key
sudo test -f "$WRAP"
grep -n 1056 "$ROOT/agent/utils/services.go" | head -3
GOIMG=golang:1.25
echo "GOIMG=$GOIMG"
docker run --rm -v "$ROOT:/src" -v "$WRAP:/wrap:ro" -w /src/agent \
  -e CGO_ENABLED=0 -e GOOS=windows -e GOARCH=amd64 "$GOIMG" \
  sh -c 'go build -ldflags "-X github.com/hivearmor/agent/config.REPLACE_KEY=$(cat /wrap)" -o /src/agent/hivearmor_agent_service.exe .'
docker run --rm -v "$ROOT:/src" -v "$WRAP:/wrap:ro" -w /src/agent/updater \
  -e CGO_ENABLED=0 -e GOOS=windows -e GOARCH=amd64 "$GOIMG" \
  sh -c 'go build -ldflags "-X github.com/hivearmor/agent/updater/config.REPLACE_KEY=$(cat /wrap)" -o /src/agent/hivearmor_updater_service.exe .'
ls -la "$ROOT/agent/hivearmor_agent_service.exe" "$ROOT/agent/hivearmor_updater_service.exe"
OUT=/tmp/hivearmor-windows-pkg
PKGDIR="$OUT/hivearmor-agent-11.0.0-staging-windows-amd64"
rm -rf "$OUT" && mkdir -p "$PKGDIR"
cp "$ROOT/agent/hivearmor_agent_service.exe" "$PKGDIR/"
cp "$ROOT/agent/hivearmor_updater_service.exe" "$PKGDIR/"
cp "$ROOT/deploy/staging/verify-packaged-windows-staging.ps1" "$PKGDIR/verify-packaged-windows.ps1"
( cd "$PKGDIR" && sha256sum hivearmor_agent_service.exe hivearmor_updater_service.exe > SHA256SUMS )
( cd "$OUT" && tar czf hivearmor-agent-windows-amd64.tar.gz hivearmor-agent-11.0.0-staging-windows-amd64 )
ls -la "$OUT/hivearmor-agent-windows-amd64.tar.gz"
stat -c "%y %s %n" "$ROOT/agent/hivearmor_agent_service.exe"
echo BUILD_OK
