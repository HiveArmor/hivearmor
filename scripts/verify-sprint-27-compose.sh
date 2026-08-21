#!/usr/bin/env bash
# Sprint 27 — Ollama LLM Provider — Compose Health Check
# Task 8.3: Automate Ollama Compose health check
#
# Verifies Requirement 10.1: Ollama_Service reports healthy status in Docker
# Compose under the `ai` profile, and Ollama_Init_Sidecar exits with code 0.
#
# Usage:
#   ./scripts/verify-sprint-27-compose.sh [--timeout <seconds>] [--no-cleanup]
#
# Environment variables (alternative to flags):
#   OLLAMA_HEALTH_TIMEOUT   Override health-poll timeout in seconds (default: 300)
#   SPRINT27_NO_CLEANUP     Set to 1 to skip `docker compose down` after the run
#
# Exit behaviour:
#   Uses set -euo pipefail throughout. Exits 0 on success, 1 on any failure.
#   The cleanup step runs even when the script is interrupted (SIGINT/SIGTERM).

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
HEALTH_TIMEOUT="${OLLAMA_HEALTH_TIMEOUT:-300}"   # 5 minutes
NO_CLEANUP="${SPRINT27_NO_CLEANUP:-0}"
POLL_INTERVAL=5                                  # seconds between health polls

# ─── Argument parsing ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --timeout)
            HEALTH_TIMEOUT="$2"; shift 2 ;;
        --no-cleanup)
            NO_CLEANUP=1; shift ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Usage: $0 [--timeout <seconds>] [--no-cleanup]" >&2
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
info()  { echo -e "${CYAN}[INFO]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET} $*"; }
title() {
    echo -e "\n${BOLD}${CYAN}──────────────────────────────────────────${RESET}"
    echo -e "${BOLD}${CYAN}  $*${RESET}"
    echo -e "${BOLD}${CYAN}──────────────────────────────────────────${RESET}"
}

# ─── Resolve local-dev directory ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_DEV="${REPO_ROOT}/local-dev"

if [[ ! -f "${LOCAL_DEV}/docker-compose.yml" ]]; then
    fail "Cannot locate local-dev/docker-compose.yml under ${REPO_ROOT}"
    fail "Run this script from the repository root: ./scripts/verify-sprint-27-compose.sh"
    exit 1
fi

# ─── Dependency check ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    fail "docker not found — install Docker Desktop or Docker Engine to run this check"
    exit 1
fi

if ! docker compose version &>/dev/null 2>&1; then
    fail "docker compose (v2 plugin) not found — upgrade Docker to a version that includes the compose plugin"
    exit 1
fi

# ─── Cleanup trap ────────────────────────────────────────────────────────────
# Runs on EXIT (success, failure, and signals) unless --no-cleanup is set.
cleanup() {
    local exit_code=$?
    if [[ "${NO_CLEANUP}" == "0" ]]; then
        title "Cleanup: docker compose --profile ai down"
        info "Tearing down ai-profile services..."
        docker compose --profile ai down --remove-orphans 2>&1 || \
            warn "docker compose down exited non-zero — manual cleanup may be required"
        pass "Cleanup complete"
    else
        warn "Skipping cleanup (--no-cleanup set) — ai-profile services may still be running"
    fi
    exit "$exit_code"
}
trap cleanup EXIT

# ─── Step 1: Bring up ollama and ollama-init ──────────────────────────────────
step1_bring_up() {
    title "Step 1: docker compose --profile ai up -d ollama ollama-init"
    info  "Starting ollama and ollama-init services..."

    docker compose --profile ai up -d ollama ollama-init

    pass "Step 1: Services started (or already running)"
}

# ─── Step 2: Poll ollama until healthy or timeout ────────────────────────────
step2_wait_healthy() {
    title "Step 2: Wait for ollama service to report 'healthy'"
    info  "Polling every ${POLL_INTERVAL}s up to ${HEALTH_TIMEOUT}s timeout..."

    local elapsed=0
    local health_status

    while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
        # `docker compose ps --format json` outputs one JSON object per line
        # We filter for the ollama service and extract its Health field.
        health_status="$(
            docker compose ps --format '{{.Health}}' ollama 2>/dev/null \
            || echo "unknown"
        )"

        case "${health_status}" in
            healthy)
                pass "Step 2: ollama is healthy (elapsed: ${elapsed}s)"
                return 0
                ;;
            unhealthy)
                fail "Step 2: ollama reported 'unhealthy' after ${elapsed}s"
                fail "         Check logs: docker compose logs ollama"
                exit 1
                ;;
            *)
                info "  ${elapsed}s — ollama health: '${health_status:-unknown}' — waiting..."
                ;;
        esac

        sleep "${POLL_INTERVAL}"
        elapsed=$(( elapsed + POLL_INTERVAL ))
    done

    fail "Step 2: ollama did not become healthy within ${HEALTH_TIMEOUT}s"
    fail "         Check logs: docker compose logs ollama"
    exit 1
}

# ─── Step 3: Wait for ollama-init to exit and check its exit code ────────────
step3_check_init_exit() {
    title "Step 3: Assert ollama-init exits with code 0"
    info  "Waiting for ollama-init container to finish..."

    # ollama-init has restart: "no" so it will transition to 'exited' after the
    # pull command completes. We poll until the container is no longer running.
    local elapsed=0
    local init_state init_exit_code

    while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
        # Query the container state — returns empty string if container not found yet
        init_state="$(
            docker compose ps --format '{{.State}}' ollama-init 2>/dev/null \
            || echo ""
        )"

        case "${init_state}" in
            exited|"")
                # Container has exited — inspect its exit code
                break
                ;;
            running)
                info "  ${elapsed}s — ollama-init still running (model pull in progress)..."
                ;;
            *)
                info "  ${elapsed}s — ollama-init state: '${init_state}' — waiting..."
                ;;
        esac

        sleep "${POLL_INTERVAL}"
        elapsed=$(( elapsed + POLL_INTERVAL ))
    done

    if [[ $elapsed -ge $HEALTH_TIMEOUT && "${init_state}" == "running" ]]; then
        fail "Step 3: ollama-init did not exit within ${HEALTH_TIMEOUT}s"
        fail "         The model pull may be stalled. Check logs: docker compose logs ollama-init"
        exit 1
    fi

    # Inspect the actual exit code from the container
    local container_name
    container_name="$(
        docker compose ps --format '{{.Name}}' ollama-init 2>/dev/null | head -1 \
        || echo ""
    )"

    if [[ -z "${container_name}" ]]; then
        # Fall back: find container by project label pattern
        container_name="$(
            docker ps -a --filter "label=com.docker.compose.service=ollama-init" \
                       --format '{{.Names}}' | head -1 \
            || echo ""
        )"
    fi

    if [[ -z "${container_name}" ]]; then
        fail "Step 3: Could not locate ollama-init container to inspect its exit code"
        fail "         Ensure docker compose was run from ${LOCAL_DEV}"
        exit 1
    fi

    init_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "${container_name}" 2>/dev/null || echo "unknown")"

    if [[ "${init_exit_code}" == "0" ]]; then
        pass "Step 3: ollama-init exited with code 0 (model pull succeeded)"
    else
        fail "Step 3: ollama-init exited with code ${init_exit_code} (expected 0)"
        fail "         Model pull failed. Logs:"
        docker compose logs ollama-init 2>&1 | tail -20 >&2 || true
        exit 1
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Sprint 27 — Ollama Compose Health Check (Task 8.3)          ║"
    echo "║  Validates: Requirement 10.1                                  ║"
    echo "║  Steps: up → poll healthy → assert init exits 0 → down        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    info "Repo root   : ${REPO_ROOT}"
    info "Local-dev   : ${LOCAL_DEV}"
    info "Timeout     : ${HEALTH_TIMEOUT}s"
    info "Cleanup     : $([ "${NO_CLEANUP}" == "0" ] && echo 'yes (docker compose down on exit)' || echo 'no (--no-cleanup set)')"

    # Run all steps from local-dev/ so docker compose picks up the right project
    cd "${LOCAL_DEV}"

    step1_bring_up
    step2_wait_healthy
    step3_check_init_exit

    echo ""
    echo -e "${GREEN}${BOLD}✅  Sprint 27 Compose health check passed (Requirement 10.1)${RESET}"
    echo ""
}

main "$@"
