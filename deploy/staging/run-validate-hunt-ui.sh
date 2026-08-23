#!/usr/bin/env bash
set -euo pipefail
ROOT="/Users/encryptshell/GIT/HiveArmor-v1"
export PLAYWRIGHT_BROWSERS_PATH="${HOME}/Library/Caches/ms-playwright"
export HA_TOKEN_FILE="${ROOT}/.tmp-ha-ui.token"
export HA_BASE_URL="${HA_BASE_URL:-https://72.44.52.187}"
export HA_REPORT="${HA_REPORT:-/tmp/hivearmor-hunt-ui-validation.json}"
test -s "${HA_TOKEN_FILE}"
node "${ROOT}/deploy/staging/validate-hunt-ui.cjs"
STATUS=$?
rm -f "${HA_TOKEN_FILE}"
exit "${STATUS}"
