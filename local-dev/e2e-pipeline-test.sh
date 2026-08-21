#!/usr/bin/env bash
# e2e-pipeline-test.sh — HiveArmor End-to-End Pipeline Integration Test
# Single entry point for running the entire E2E pipeline test.
#
# DEPRECATED FOR DETECTION ACCEPTANCE: both historical modes hydrate prepared
# OpenSearch documents and simulation may create alerts directly. Keep this
# script only for legacy dataset/UI smoke checks. Use
# `local-dev/tests/raw-log-alert-e2e.sh` to prove raw telemetry is normalized and
# evaluated by the processing engine before an alert is generated.
#
# Usage:
#   ./e2e-pipeline-test.sh [OPTIONS]
#
# Options:
#   --mode=auto|live|simulation   Execution mode (default: auto)
#   --skip-ui                     Skip UI verification phase
#   --verbose                     Enable verbose output
#   --clean-only                  Only run cleanup, then exit
#   --help                        Show this help message
#
# Modes:
#   auto        — Detect mode automatically (live if event-processor running, else simulation)
#   live        — Use event-processor for real correlation (requires running container)
#   simulation  — Generate alerts/entities/findings directly into OpenSearch
#
# Exit codes:
#   0 — all phases passed
#   1 — API verification failed
#   2 — UI verification failed (non-fatal)
#   3 — injection phase failed
#
# Example:
#   bash local-dev/e2e-pipeline-test.sh --mode=simulation --skip-ui

set -uo pipefail

###############################################################################
# Script paths
###############################################################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="${SCRIPT_DIR}/e2e"

###############################################################################
# Phase tracking (bash 3.x compatible — no associative arrays)
###############################################################################
PHASE_CLEANUP_STATUS="skip"
PHASE_CLEANUP_DURATION=0
PHASE_RULES_STATUS="skip"
PHASE_RULES_DURATION=0
PHASE_INJECTION_STATUS="skip"
PHASE_INJECTION_DURATION=0
PHASE_GENERATE_STATUS="skip"
PHASE_GENERATE_DURATION=0
PHASE_API_STATUS="skip"
PHASE_API_DURATION=0
PHASE_UI_STATUS="skip"
PHASE_UI_DURATION=0

START_TIME=$(date +%s)
CURRENT_PHASE_START=0

###############################################################################
# Defaults
###############################################################################
MODE="auto"
SKIP_UI=false
VERBOSE=false
CLEAN_ONLY=false
OPENSEARCH_URL=""
OS_CREDS='admin:LocalDev@2024!'

###############################################################################
# Colors (if terminal supports them)
###############################################################################
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

###############################################################################
# Argument parsing
###############################################################################
show_help() {
    echo "e2e-pipeline-test.sh — HiveArmor End-to-End Pipeline Integration Test"
    echo "DEPRECATED FOR DETECTION ACCEPTANCE — use tests/raw-log-alert-e2e.sh"
    echo ""
    echo "Usage:"
    echo "  ./e2e-pipeline-test.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --mode=auto|live|simulation   Execution mode (default: auto)"
    echo "  --skip-ui                     Skip UI verification phase"
    echo "  --verbose                     Enable verbose output"
    echo "  --clean-only                  Only run cleanup, then exit"
    echo "  --help                        Show this help message"
    echo ""
    echo "Modes:"
    echo "  auto        Detect mode (live if event-processor running, else simulation)"
    echo "  live        Use event-processor for real correlation"
    echo "  simulation  Generate alerts/entities/findings directly into OpenSearch"
    echo ""
    echo "Exit codes:"
    echo "  0 — all phases passed"
    echo "  1 — API verification failed"
    echo "  2 — UI verification failed (non-fatal)"
    echo "  3 — injection phase failed"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        --mode=*)
            MODE="${arg#--mode=}"
            if [[ "$MODE" != "auto" && "$MODE" != "live" && "$MODE" != "simulation" ]]; then
                echo "ERROR: Invalid mode '${MODE}'. Must be auto, live, or simulation." >&2
                exit 1
            fi
            ;;
        --skip-ui)
            SKIP_UI=true
            ;;
        --verbose)
            VERBOSE=true
            ;;
        --clean-only)
            CLEAN_ONLY=true
            ;;
        --help|-h)
            show_help
            ;;
        *)
            echo "ERROR: Unknown argument: $arg" >&2
            echo "Use --help for usage information." >&2
            exit 1
            ;;
    esac
done

###############################################################################
# Utility functions
###############################################################################
log() {
    echo -e "${CYAN}[E2E]${RESET} $*"
}

log_success() {
    echo -e "${GREEN}[E2E] ✓${RESET} $*"
}

log_error() {
    echo -e "${RED}[E2E] ✗${RESET} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[E2E] ⚠${RESET} $*"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}[E2E]${RESET}   $*"
    fi
}

phase_start() {
    local desc="$1"
    echo ""
    echo -e "${BOLD}━━━ Phase: ${desc} ━━━${RESET}"
    CURRENT_PHASE_START=$(date +%s)
}

set_phase_result() {
    local phase="$1"
    local status="$2"
    local end_time=$(date +%s)
    local duration=$((end_time - CURRENT_PHASE_START))

    case "$phase" in
        cleanup)    PHASE_CLEANUP_STATUS="$status";   PHASE_CLEANUP_DURATION=$duration ;;
        rules)      PHASE_RULES_STATUS="$status";     PHASE_RULES_DURATION=$duration ;;
        injection)  PHASE_INJECTION_STATUS="$status";  PHASE_INJECTION_DURATION=$duration ;;
        generate)   PHASE_GENERATE_STATUS="$status";   PHASE_GENERATE_DURATION=$duration ;;
        api)        PHASE_API_STATUS="$status";        PHASE_API_DURATION=$duration ;;
        ui)         PHASE_UI_STATUS="$status";         PHASE_UI_DURATION=$duration ;;
    esac

    if [[ "$status" == "pass" ]]; then
        log_success "Phase complete (${duration}s)"
    elif [[ "$status" == "skip" ]]; then
        log_warn "Phase skipped"
    else
        log_error "Phase failed (${duration}s)"
    fi
}

###############################################################################
# Pre-flight checks
###############################################################################
preflight_opensearch() {
    log "Checking OpenSearch connectivity..."

    # Try HTTPS first (with -k for self-signed certs)
    if curl -sk -u "$OS_CREDS" --connect-timeout 5 "https://localhost:9200/_cluster/health" &>/dev/null; then
        OPENSEARCH_URL="https://localhost:9200"
        log_verbose "OpenSearch reachable at ${OPENSEARCH_URL} (HTTPS)"
        return 0
    fi

    # Fallback to HTTP
    if curl -s -u "$OS_CREDS" --connect-timeout 5 "http://localhost:9200/_cluster/health" &>/dev/null; then
        OPENSEARCH_URL="http://localhost:9200"
        log_verbose "OpenSearch reachable at ${OPENSEARCH_URL} (HTTP)"
        return 0
    fi

    log_error "Cannot connect to OpenSearch at localhost:9200 (tried HTTPS and HTTP)"
    log_error "Make sure OpenSearch is running: cd local-dev && docker compose up -d"
    return 1
}

preflight_backend() {
    log "Checking backend API connectivity..."

    if curl -s --connect-timeout 5 "http://localhost:8088/management/health" &>/dev/null; then
        log_verbose "Backend API reachable at http://localhost:8088"
        return 0
    fi

    log_warn "Backend API not reachable at http://localhost:8088"
    log_warn "API verification phase will likely fail"
    return 0  # Non-fatal — script can still run injection/simulation
}

detect_event_processor() {
    log "Detecting event-processor container..."

    if docker ps 2>/dev/null | grep -qE 'event.processor|eventprocessor'; then
        log_verbose "Event-processor container is running"
        return 0
    fi

    log_verbose "Event-processor container not detected"
    return 1
}

###############################################################################
# Mode auto-detection
###############################################################################
autodetect_mode() {
    if [[ "$MODE" != "auto" ]]; then
        return
    fi

    if detect_event_processor; then
        MODE="live"
    else
        MODE="simulation"
    fi
}

print_mode_banner() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║   HiveArmor E2E Pipeline Integration Test                  ║${RESET}"
    echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
    echo -e "${BOLD}║${RESET}  Mode:       ${CYAN}${MODE}${RESET}"
    echo -e "${BOLD}║${RESET}  Skip UI:    ${SKIP_UI}"
    echo -e "${BOLD}║${RESET}  Verbose:    ${VERBOSE}"
    echo -e "${BOLD}║${RESET}  OpenSearch: ${OPENSEARCH_URL:-not yet detected}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
}

###############################################################################
# Cleanup phase — delete previous e2e test data
###############################################################################
run_cleanup() {
    phase_start "Cleanup Previous E2E Data"

    local curl_opts=(-s -u "$OS_CREDS")
    if [[ "$OPENSEARCH_URL" == https://* ]]; then
        curl_opts+=(-k)
    fi

    log "Deleting alerts with e2e- prefix..."
    curl "${curl_opts[@]}" -X POST \
        -H "Content-Type: application/json" \
        "${OPENSEARCH_URL}/v3-hive-alert-*/_delete_by_query?conflicts=proceed" \
        -d '{"query":{"prefix":{"alertId":"e2e-"}}}' \
        &>/dev/null || true

    log "Deleting findings with e2e-finding- prefix..."
    curl "${curl_opts[@]}" -X POST \
        -H "Content-Type: application/json" \
        "${OPENSEARCH_URL}/v3-hive-correlation-*/_delete_by_query?conflicts=proceed" \
        -d '{"query":{"prefix":{"findingId":"e2e-finding-"}}}' \
        &>/dev/null || true

    log "Deleting entities with ent- prefix..."
    curl "${curl_opts[@]}" -X POST \
        -H "Content-Type: application/json" \
        "${OPENSEARCH_URL}/v3-hive-entity-*/_delete_by_query?conflicts=proceed" \
        -d '{"query":{"prefix":{"entityId":"ent-"}}}' \
        &>/dev/null || true

    log "Deleting test log indices (v3-hive-log-2026.08.20)..."
    curl "${curl_opts[@]}" -X DELETE \
        "${OPENSEARCH_URL}/v3-hive-log-2026.08.20" \
        &>/dev/null || true

    log_verbose "Cleanup complete"
    set_phase_result "cleanup" "pass"
}

###############################################################################
# Rule configuration phase (live mode only)
###############################################################################
run_rule_config() {
    if [[ "$MODE" != "live" ]]; then
        PHASE_RULES_STATUS="skip"
        PHASE_RULES_DURATION=0
        return 0
    fi

    phase_start "Rule Configuration (Live Mode)"

    # Copy rules from e2e/rules/ to rules/test/
    local rules_src="${E2E_DIR}/rules"
    local rules_dest="${SCRIPT_DIR}/rules/test"

    if [[ ! -d "$rules_src" ]]; then
        log_error "Rules source directory not found: ${rules_src}"
        set_phase_result "rules" "fail"
        return 1
    fi

    mkdir -p "$rules_dest"
    cp -f "${rules_src}"/*.yaml "$rules_dest/" 2>/dev/null || {
        log_error "Failed to copy rules to ${rules_dest}"
        set_phase_result "rules" "fail"
        return 1
    }
    log_verbose "Copied rules to ${rules_dest}"

    # Restart event-processor container
    log "Restarting event-processor container..."
    if docker compose restart eventprocessor 2>/dev/null; then
        log_verbose "Container restart initiated"
    elif docker-compose restart eventprocessor 2>/dev/null; then
        log_verbose "Container restart initiated (docker-compose v1)"
    else
        log_warn "Could not restart event-processor container"
    fi

    # Wait for health check
    log "Waiting for event-processor health check..."
    local attempts=0
    local max_attempts=30
    while [[ $attempts -lt $max_attempts ]]; do
        if docker ps 2>/dev/null | grep -qE 'event.processor|eventprocessor'; then
            log_verbose "Event-processor container is running"
            break
        fi
        sleep 2
        attempts=$((attempts + 1))
    done

    if [[ $attempts -ge $max_attempts ]]; then
        log_warn "Event-processor health check timed out"
    fi

    set_phase_result "rules" "pass"
}

###############################################################################
# Injection phase
###############################################################################
run_injection() {
    phase_start "Event Injection"

    # Generate events
    local gen_script="${E2E_DIR}/events/generate-events.sh"
    if [[ -f "$gen_script" ]]; then
        log "Generating event files..."
        if bash "$gen_script"; then
            log_verbose "Events generated successfully"
        else
            log_error "Event generation failed"
            set_phase_result "injection" "fail"
            return 1
        fi
    else
        # Check if event files already exist
        if [[ -f "${E2E_DIR}/events/windows-events.json" ]]; then
            log_verbose "Event files already exist, skipping generation"
        else
            log_error "generate-events.sh not found and no event files exist"
            set_phase_result "injection" "fail"
            return 1
        fi
    fi

    # Inject events
    local inject_script="${E2E_DIR}/inject-events.sh"
    if [[ ! -f "$inject_script" ]]; then
        log_error "inject-events.sh not found at ${inject_script}"
        set_phase_result "injection" "fail"
        return 1
    fi

    log "Injecting events into OpenSearch..."
    local inject_args=""
    if [[ -n "$OPENSEARCH_URL" ]]; then
        inject_args="--opensearch-url=${OPENSEARCH_URL}"
    fi

    if bash "$inject_script" $inject_args; then
        log_verbose "Event injection completed"
    else
        log_error "Event injection failed"
        set_phase_result "injection" "fail"
        return 1
    fi

    # Verify count
    local curl_opts=(-s -u "$OS_CREDS")
    if [[ "$OPENSEARCH_URL" == https://* ]]; then
        curl_opts+=(-k)
    fi

    sleep 1
    local count_response
    count_response=$(curl "${curl_opts[@]}" "${OPENSEARCH_URL}/v3-hive-log-*/_count" 2>/dev/null)
    local count
    count=$(echo "$count_response" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' | head -1)
    log "Verified ${count:-0} log events indexed"

    set_phase_result "injection" "pass"
}

###############################################################################
# Wait/Generate phase
###############################################################################
run_wait_generate() {
    phase_start "Wait / Generate Data"

    if [[ "$MODE" == "live" ]]; then
        log "Live mode: waiting 120s for event-processor correlation..."
        log_verbose "Event-processor will correlate injected events using configured rules"
        sleep 120
        log_verbose "Wait complete"
    else
        # Simulation mode: generate alerts, entities, findings directly
        local sim_dir="${E2E_DIR}/simulation"
        local sim_args=""
        if [[ -n "$OPENSEARCH_URL" ]]; then
            sim_args="--opensearch-url=${OPENSEARCH_URL}"
        fi

        log "Simulation mode: generating alerts..."
        if bash "${sim_dir}/generate-alerts.sh" $sim_args; then
            log_verbose "Alerts generated"
        else
            log_error "Alert generation failed"
            set_phase_result "generate" "fail"
            return 1
        fi

        log "Simulation mode: generating entities..."
        if bash "${sim_dir}/generate-entities.sh" $sim_args; then
            log_verbose "Entities generated"
        else
            log_error "Entity generation failed"
            set_phase_result "generate" "fail"
            return 1
        fi

        log "Simulation mode: generating findings..."
        if bash "${sim_dir}/generate-findings.sh" $sim_args; then
            log_verbose "Findings generated"
        else
            log_error "Finding generation failed"
            set_phase_result "generate" "fail"
            return 1
        fi
    fi

    set_phase_result "generate" "pass"
}

###############################################################################
# API verification phase
###############################################################################
run_api_verification() {
    phase_start "API Verification"

    local verify_script="${E2E_DIR}/verify/verify-api.sh"
    if [[ ! -f "$verify_script" ]]; then
        log_error "verify-api.sh not found at ${verify_script}"
        set_phase_result "api" "fail"
        return 1
    fi

    log "Running API verification..."
    local exit_code=0
    bash "$verify_script" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        log_success "API verification passed"
        set_phase_result "api" "pass"
        return 0
    else
        log_error "API verification failed (exit code: ${exit_code})"
        set_phase_result "api" "fail"
        return 1
    fi
}

###############################################################################
# UI verification phase
###############################################################################
run_ui_verification() {
    if [[ "$SKIP_UI" == "true" ]]; then
        PHASE_UI_STATUS="skip"
        PHASE_UI_DURATION=0
        log_warn "UI verification skipped (--skip-ui)"
        return 0
    fi

    phase_start "UI Verification"

    local verify_script="${E2E_DIR}/verify/verify-ui.sh"
    if [[ ! -f "$verify_script" ]]; then
        log_warn "verify-ui.sh not found at ${verify_script}"
        set_phase_result "ui" "skip"
        return 0
    fi

    log "Running UI verification..."
    local exit_code=0
    bash "$verify_script" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        log_success "UI verification passed"
        set_phase_result "ui" "pass"
        return 0
    else
        log_warn "UI verification failed (exit code: ${exit_code}) — non-fatal"
        set_phase_result "ui" "fail"
        return 1
    fi
}

###############################################################################
# Reporting
###############################################################################
print_report() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║              E2E Pipeline Test — Results                    ║${RESET}"
    echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
    printf "${BOLD}║${RESET}  %-18s │ %-8s │ %s\n" "Phase" "Status" "Duration"
    echo -e "${BOLD}║${RESET}  ──────────────────┼──────────┼──────────"

    print_phase_row "cleanup"   "$PHASE_CLEANUP_STATUS"   "$PHASE_CLEANUP_DURATION"
    print_phase_row "rules"     "$PHASE_RULES_STATUS"     "$PHASE_RULES_DURATION"
    print_phase_row "injection" "$PHASE_INJECTION_STATUS"  "$PHASE_INJECTION_DURATION"
    print_phase_row "generate"  "$PHASE_GENERATE_STATUS"   "$PHASE_GENERATE_DURATION"
    print_phase_row "api"       "$PHASE_API_STATUS"        "$PHASE_API_DURATION"
    print_phase_row "ui"        "$PHASE_UI_STATUS"         "$PHASE_UI_DURATION"

    echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
    echo -e "${BOLD}║${RESET}  Mode:           ${CYAN}${MODE}${RESET}"
    echo -e "${BOLD}║${RESET}  Total Duration: ${total_duration}s"
    echo -e "${BOLD}║${RESET}  OpenSearch:     ${OPENSEARCH_URL}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
}

print_phase_row() {
    local phase="$1"
    local status="$2"
    local duration="$3"
    local status_display=""

    case "$status" in
        pass)  status_display="${GREEN}PASS${RESET}" ;;
        fail)  status_display="${RED}FAIL${RESET}" ;;
        skip)  status_display="${YELLOW}SKIP${RESET}" ;;
        *)     status_display="${YELLOW}N/A${RESET}" ;;
    esac

    printf "${BOLD}║${RESET}  %-18s │ %b     │ %ss\n" "$phase" "$status_display" "$duration"
}

print_exit_explanation() {
    local code="$1"
    echo ""
    case "$code" in
        0) log_success "All phases passed — pipeline is healthy" ;;
        1) log_error "API verification failed — backend/OpenSearch data issue" ;;
        2) log_warn "UI verification failed (non-fatal) — frontend may not be running" ;;
        3) log_error "Injection failed — OpenSearch connectivity or data issue" ;;
    esac
}

###############################################################################
# Main execution
###############################################################################
main() {
    # Pre-flight checks
    phase_start "Pre-flight Checks"
    if ! preflight_opensearch; then
        log_error "Pre-flight failed: OpenSearch is not available"
        log_error "Start the local dev environment: cd local-dev && docker compose up -d"
        exit 3
    fi
    preflight_backend
    log_success "Pre-flight checks passed"

    # Mode auto-detection
    autodetect_mode
    print_mode_banner

    # Cleanup phase (always runs first for idempotency)
    run_cleanup

    # Clean-only mode exits here
    if [[ "$CLEAN_ONLY" == "true" ]]; then
        log_success "Cleanup complete. Exiting (--clean-only mode)."
        exit 0
    fi

    # Rule configuration (live mode only)
    run_rule_config

    # Injection phase
    if ! run_injection; then
        print_report
        print_exit_explanation 3
        exit 3
    fi

    # Wait/Generate phase
    if ! run_wait_generate; then
        print_report
        print_exit_explanation 3
        exit 3
    fi

    # API verification phase
    local api_result=0
    run_api_verification || api_result=$?

    # UI verification phase
    local ui_result=0
    run_ui_verification || ui_result=$?

    # Report
    print_report

    # Determine exit code
    if [[ $api_result -ne 0 ]]; then
        print_exit_explanation 1
        exit 1
    elif [[ $ui_result -ne 0 && "$SKIP_UI" != "true" ]]; then
        print_exit_explanation 2
        exit 2
    else
        print_exit_explanation 0
        exit 0
    fi
}

main
