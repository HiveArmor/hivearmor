#!/usr/bin/env bash
# HiveArmor Phase-1 Integration Test Runner
# Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
#
# Usage:
#   bash scripts/integration/phase1_test.sh
#   BASE_URL=http://localhost:8088 bash scripts/integration/phase1_test.sh
#
# Runtime dependencies: bash 4+, curl, python3 — nothing else (Req 12.2)
# Exit codes:
#   0 = all categories passed (or AcceptableInfoExit on Cat 4/7)
#   1 = a non-acceptable category failed
set -uo pipefail

# ── Environment defaults ────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:8088}"
AGENT_MANAGER_URL="${AGENT_MANAGER_URL:-http://localhost:9090}"
OPENSEARCH_URL="${OPENSEARCH_URL:-https://localhost:9200}"
FRONTEND_DIR="${FRONTEND_DIR:-frontend-v3}"
BACKEND_DIR="${BACKEND_DIR:-backend}"

# Directory containing this script — used to locate cat/ sub-scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Helpers ─────────────────────────────────────────────────────────────────
banner() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  $*"
    echo "═══════════════════════════════════════════════════════════"
}

info() {
    echo "[INFO]  $*"
}

pass() {
    echo "[PASS]  $*"
}

fail() {
    echo "[FAIL]  $*" >&2
}

# json_get <python-key-expression>
# Reads JSON from stdin and evaluates the given Python key expression.
# Example: echo '{"a":{"b":1}}' | json_get "['a']['b']"
json_get() {
    python3 -c "import sys, json; print(json.load(sys.stdin)${1})"
}

# ── Category names (1-indexed; index 0 unused) ──────────────────────────────
# Req 12.3: ten categories in fixed order
CATEGORY_NAMES=(
    ""                          # index 0 — unused sentinel
    "backend-health"            # 1
    "authentication"            # 2
    "system-settings"           # 3
    "agent-health"              # 4  (may return AcceptableInfoExit = 2)
    "api-key-crud"              # 5
    "data-source-aggregation"   # 6
    "kafka-broker"              # 7  (may return AcceptableInfoExit = 2)
    "opensearch-indices"        # 8
    "frontend-gates"            # 9
    "backend-production-build"  # 10
)

# ── Category runner ──────────────────────────────────────────────────────────
# run_category <num>
# Sources and executes the corresponding category script.
# Exit code 2 from Category 4 or Category 7 is treated as AcceptableInfoExit
# (Req 12.4) and execution continues.
# Any other non-zero exit code is fatal: prints the failing category name and
# exits this runner with code 1 (Req 12.5).
run_category() {
    local num=$1
    local name="${CATEGORY_NAMES[$num]}"

    banner "Category ${num}: ${name}"

    local script="${SCRIPT_DIR}/cat/${name}.sh"

    # Invoke the category script in a sub-shell so its own set -e/-u flags
    # cannot terminate the runner prematurely.
    bash "${script}"
    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        pass "Category ${num} (${name}) passed"
    elif [[ $exit_code -eq 2 && ( $num -eq 4 || $num -eq 7 ) ]]; then
        # AcceptableInfoExit — Req 12.4
        info "Category ${num} (${name}) returned exit code 2 — AcceptableInfoExit; continuing"
    else
        fail "Category ${num} (${name}) failed with exit code ${exit_code}"
        exit 1   # Req 12.5
    fi
}

# ── Main: invoke categories 1..10 in fixed order (Req 12.3) ─────────────────
for i in $(seq 1 10); do
    run_category "$i"
done

echo ""
pass "All Phase-1 integration test categories completed successfully."
exit 0
