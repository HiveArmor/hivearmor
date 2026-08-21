#!/usr/bin/env bash
# Category 4: agent-health
# Requirements: 12.3, 12.4
#
# Checks the agent-manager /health endpoint.
#
# Exit codes:
#   0 — reachable and returned HTTP 200 (healthy)
#   2 — unreachable (connection refused / timeout) — AcceptableInfoExit in local-dev
#   1 — protocol-level failure (unexpected HTTP status from a reachable endpoint)
set -uo pipefail

AGENT_MANAGER_URL="${AGENT_MANAGER_URL:-http://localhost:9090}"

echo "[CAT4] Checking agent-manager health at ${AGENT_MANAGER_URL}/health"

# Capture HTTP status code; capture curl exit code separately.
# -s: silent  -o /dev/null: discard body  -w: write status code to stdout
# --connect-timeout 5: don't hang if agent-manager is not deployed locally
http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 \
    "${AGENT_MANAGER_URL}/health" 2>/dev/null) || true
curl_exit=$?

# curl exit code != 0  OR  http_code "000" both indicate the host is unreachable
# (connection refused, DNS failure, timeout, etc.)
if [[ $curl_exit -ne 0 || "$http_code" == "000" ]]; then
    echo "[CAT4] Agent-manager unreachable (curl_exit=${curl_exit}, http_code=${http_code}) — AcceptableInfoExit (exit 2)"
    exit 2
fi

# A 200 response means the agent-manager is up and healthy
if [[ "$http_code" == "200" ]]; then
    echo "[PASS] Agent-manager health: HTTP ${http_code}"
    exit 0
fi

# Any other HTTP status (4xx, 5xx, 3xx, etc.) is a protocol-level failure
echo "[FAIL] Unexpected HTTP status from agent-manager health endpoint: ${http_code}" >&2
exit 1
