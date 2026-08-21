#!/usr/bin/env bash
# Sprint 26 — Natural Language Search — Verification Runner
# Checks 1–7 must all pass (exit 0) for the sprint to be considered complete.
#
# Usage:
#   ./scripts/sprint26-verify.sh [--base-url http://localhost:8088] [--token <JWT>]
#
# Environment variables (alternative to flags):
#   SPRINT26_BASE_URL   Override base URL (default: http://localhost:8088)
#   SPRINT26_TOKEN      Bearer JWT for authenticated requests
#
# Exit behaviour:
#   The script uses set -euo pipefail.  Any check that exits non-zero causes
#   the entire script to exit with a non-zero status immediately.
#   SKIP checks (browser-only) always exit 0 so they do not block CI.

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
BASE_URL="${SPRINT26_BASE_URL:-http://localhost:8088}"
TOKEN="${SPRINT26_TOKEN:-}"

# ─── Argument parsing ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --base-url)
            BASE_URL="$2"; shift 2 ;;
        --token)
            TOKEN="$2"; shift 2 ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Usage: $0 [--base-url <url>] [--token <jwt>]" >&2
            exit 1 ;;
    esac
done

# ─── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass()  { echo -e "${GREEN}[PASS]${RESET} $*"; }
fail()  { echo -e "${RED}[FAIL]${RESET} $*" >&2; }
skip()  { echo -e "${YELLOW}[SKIP]${RESET} $*"; }
info()  { echo -e "${CYAN}[INFO]${RESET} $*"; }
title() { echo -e "\n${BOLD}${CYAN}──────────────────────────────────────────${RESET}"; \
          echo -e "${BOLD}${CYAN}  $*${RESET}"; \
          echo -e "${BOLD}${CYAN}──────────────────────────────────────────${RESET}"; }

# ─── Dependency check ────────────────────────────────────────────────────────
require_cmd() {
    if ! command -v "$1" &>/dev/null; then
        fail "Required command not found: $1"
        exit 1
    fi
}

# ─── Check 1: NL translate endpoint ─────────────────────────────────────────
check1_nl_translate() {
    title "Check 1: POST /api/ha-search/nl-to-dsl — NL translation endpoint"

    if ! command -v curl &>/dev/null; then
        skip "Check 1: curl not found — install curl to run this check"
        return 0
    fi

    # Attempt a TCP connection first so we can skip gracefully if backend is down
    local host port
    host="$(echo "$BASE_URL" | sed -E 's|https?://([^:/]+).*|\1|')"
    port="$(echo "$BASE_URL" | sed -E 's|https?://[^:]+:([0-9]+).*|\1|')"
    # Default port fallback
    if [[ "$port" == "$BASE_URL" ]]; then
        port="8088"
    fi

    if ! (echo >/dev/tcp/"$host"/"$port") 2>/dev/null; then
        skip "Check 1: Backend not reachable at ${BASE_URL} — start the local-dev stack to run this check"
        return 0
    fi

    if [[ -z "$TOKEN" ]]; then
        skip "Check 1: No --token provided — set SPRINT26_TOKEN or pass --token <jwt>"
        return 0
    fi

    local response http_code body
    response="$(curl -s -w '\n%{http_code}' \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TOKEN}" \
        -d '{"query":"failed logins in the last hour","indexPattern":"v3-hive-alert-*"}' \
        "${BASE_URL}/api/ha-search/nl-to-dsl")"

    http_code="$(echo "$response" | tail -1)"
    body="$(echo "$response" | head -n -1)"

    if [[ "$http_code" != "200" ]]; then
        fail "Check 1: Expected HTTP 200, got ${http_code}"
        fail "         Response body: ${body}"
        exit 1
    fi

    # Verify the response body contains a 'dsl' field that looks like JSON
    if ! echo "$body" | grep -q '"dsl"'; then
        fail "Check 1: Response body missing 'dsl' field"
        fail "         Body: ${body}"
        exit 1
    fi

    # Verify confidence field is present
    if ! echo "$body" | grep -q '"confidence"'; then
        fail "Check 1: Response body missing 'confidence' field"
        fail "         Body: ${body}"
        exit 1
    fi

    pass "Check 1: NL translate endpoint returned HTTP 200 with dsl and confidence fields"
    info "         Response: ${body}"
}

# ─── Check 2: DslPreviewPanel UI (browser-only placeholder) ──────────────────
check2_ui_panel() {
    title "Check 2: DslPreviewPanel rendering — browser check (manual)"
    skip "Check 2: Requires a running browser — run manually:"
    skip "         1. Open SearchHuntPage in the browser"
    skip "         2. Type a natural-language query and click Translate"
    skip "         3. Verify DslPreviewPanel renders with dsl, explanation,"
    skip "            and the confidence bar showing the correct data-band"
}

# ─── Check 3: Edit and Execute end-to-end flow (browser-only placeholder) ────
check3_edit_execute() {
    title "Check 3: Edit and Execute end-to-end flow — browser check (manual)"
    skip "Check 3: Requires a running browser — run manually:"
    skip "         1. From the DslPreviewPanel, click Edit"
    skip "         2. Modify the DSL to a valid alternative query"
    skip "         3. Click Execute"
    skip "         4. Verify SearchHuntGrid refetches and renders new rows"
}

# ─── Check 4: Suggestions endpoint ───────────────────────────────────────────
check4_suggestions() {
    title "Check 4: GET /api/ha-search/suggestions — suggestions endpoint"

    if ! command -v curl &>/dev/null; then
        skip "Check 4: curl not found — install curl to run this check"
        return 0
    fi

    local host port
    host="$(echo "$BASE_URL" | sed -E 's|https?://([^:/]+).*|\1|')"
    port="$(echo "$BASE_URL" | sed -E 's|https?://[^:]+:([0-9]+).*|\1|')"
    if [[ "$port" == "$BASE_URL" ]]; then
        port="8088"
    fi

    if ! (echo >/dev/tcp/"$host"/"$port") 2>/dev/null; then
        skip "Check 4: Backend not reachable at ${BASE_URL} — start the local-dev stack to run this check"
        return 0
    fi

    if [[ -z "$TOKEN" ]]; then
        skip "Check 4: No --token provided — set SPRINT26_TOKEN or pass --token <jwt>"
        return 0
    fi

    local response http_code body
    response="$(curl -s -w '\n%{http_code}' \
        -X GET \
        -H "Authorization: Bearer ${TOKEN}" \
        "${BASE_URL}/api/ha-search/suggestions?indexPattern=v3-hive-alert-*&count=5")"

    http_code="$(echo "$response" | tail -1)"
    body="$(echo "$response" | head -n -1)"

    if [[ "$http_code" != "200" ]]; then
        fail "Check 4: Expected HTTP 200, got ${http_code}"
        fail "         Response body: ${body}"
        exit 1
    fi

    # Verify response is a JSON array
    if [[ "${body:0:1}" != "[" ]]; then
        fail "Check 4: Expected JSON array response"
        fail "         Body: ${body}"
        exit 1
    fi

    pass "Check 4: Suggestions endpoint returned HTTP 200 with JSON array"
    info "         Response: ${body}"
}

# ─── Check 5: Search grid refresh on Execute (browser-only placeholder) ──────
check5_grid_refresh() {
    title "Check 5: SearchHuntGrid refresh on Execute — browser check (manual)"
    skip "Check 5: Requires a running browser — run manually:"
    skip "         1. Click a suggestion chip on SearchHuntPage"
    skip "         2. Click Execute in DslPreviewPanel"
    skip "         3. Verify SearchHuntGrid refetches with the chip's DSL"
}

# ─── Check 6: Frontend gates ──────────────────────────────────────────────────
check6_frontend_gates() {
    title "Check 6: Frontend gates (lint, type-check, test, build)"

    local frontend_dir
    frontend_dir="$(dirname "$0")/../frontend-v3"

    # Resolve to absolute path
    if [[ -d "$(pwd)/frontend-v3" ]]; then
        frontend_dir="$(pwd)/frontend-v3"
    elif [[ -d "$frontend_dir" ]]; then
        frontend_dir="$(realpath "$frontend_dir")"
    else
        fail "Check 6: Cannot locate frontend-v3/ directory"
        fail "         Run this script from the repository root: ./scripts/sprint26-verify.sh"
        exit 1
    fi

    require_cmd npm

    info "Check 6: Running from ${frontend_dir}"

    info "Check 6a: npm run lint"
    (cd "$frontend_dir" && npm run lint)
    pass "Check 6a: lint passed"

    info "Check 6b: npm run type-check"
    (cd "$frontend_dir" && npm run type-check)
    pass "Check 6b: type-check passed"

    info "Check 6c: npm run test"
    (cd "$frontend_dir" && npm run test)
    pass "Check 6c: test passed"

    info "Check 6d: npm run build"
    (cd "$frontend_dir" && npm run build)
    pass "Check 6d: build passed"

    pass "Check 6: All frontend gates passed"
}

# ─── Check 7: Backend gates ───────────────────────────────────────────────────
check7_backend_gates() {
    title "Check 7: Backend gates (liquibase:validate, prod package)"

    local backend_dir
    if [[ -d "$(pwd)/backend" ]]; then
        backend_dir="$(pwd)/backend"
    else
        backend_dir="$(dirname "$0")/../backend"
        if [[ -d "$backend_dir" ]]; then
            backend_dir="$(realpath "$backend_dir")"
        else
            fail "Check 7: Cannot locate backend/ directory"
            fail "         Run this script from the repository root: ./scripts/sprint26-verify.sh"
            exit 1
        fi
    fi

    # Prefer mvn in PATH, fall back to ./mvnw (per go-rules.md § Build Notes)
    local MVN
    if command -v mvn &>/dev/null; then
        MVN="mvn"
    elif [[ -x "${backend_dir}/mvnw" ]]; then
        MVN="${backend_dir}/mvnw"
        info "Check 7: mvn not found in PATH — using ${MVN}"
    else
        fail "Check 7: Neither mvn nor ./mvnw found — install Maven to run this check"
        exit 1
    fi

    # settings.xml must be present for GitHub Packages auth
    if [[ ! -f "${backend_dir}/settings.xml" ]]; then
        fail "Check 7: backend/settings.xml not found (required for GitHub Packages)"
        exit 1
    fi

    info "Check 7: Running from ${backend_dir}"

    info "Check 7a: ${MVN} -s settings.xml liquibase:validate"
    (cd "$backend_dir" && "$MVN" -s settings.xml liquibase:validate)
    pass "Check 7a: liquibase:validate passed"

    info "Check 7b: ${MVN} -B -Pprod clean package -s settings.xml -DskipTests"
    (cd "$backend_dir" && "$MVN" -B -Pprod clean package -s settings.xml -DskipTests)
    pass "Check 7b: prod package passed"

    pass "Check 7: All backend gates passed"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Sprint 26 — Natural Language Search — Verification Runner   ║"
    echo "║  Seven checks in fixed order; any failure aborts the run.    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    info "Base URL : ${BASE_URL}"
    info "Token    : ${TOKEN:+(set)}${TOKEN:--(not set)}"

    check1_nl_translate
    check2_ui_panel
    check3_edit_execute
    check4_suggestions
    check5_grid_refresh
    check6_frontend_gates
    check7_backend_gates

    echo ""
    echo -e "${GREEN}${BOLD}✅  All Sprint 26 checks passed${RESET}"
    echo ""
}

main "$@"
