#!/usr/bin/env bash
# Sprint 27 — Ollama LLM Provider — Backend Verification Gate
# Runs three mandatory checks:
#   1. mvn -B -Pprod clean package -s settings.xml  (production build + unit tests)
#   2. mvn -s settings.xml liquibase:validate        (schema changeset validation)
#   3. Backend unit-test gate confirmation            (reports test results from step 1)
#
# Requirements: 10.8
#
# Usage:
#   ./scripts/verify-sprint-27-backend.sh
#
# Environment variables:
#   MAVEN_TK   GitHub PAT with read:packages scope — required for GitHub Packages auth.
#              settings.xml references this token. Without it the build will fail on
#              dependency resolution.
#
# Exit behaviour:
#   Uses set -euo pipefail. Any non-zero exit from a Maven step aborts the run.
#   Exits 0 on full success, 1 on any failure.

set -euo pipefail

# ─── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass()  { echo -e "${GREEN}[PASS]${RESET} $*"; }
fail()  { echo -e "${RED}[FAIL]${RESET} $*" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${RESET} $*"; }
info()  { echo -e "${CYAN}[INFO]${RESET} $*"; }
title() {
    echo -e "\n${BOLD}${CYAN}──────────────────────────────────────────${RESET}"
    echo -e "${BOLD}${CYAN}  $*${RESET}"
    echo -e "${BOLD}${CYAN}──────────────────────────────────────────${RESET}"
}

# ─── Locate backend directory ─────────────────────────────────────────────────
# Resolve from the script location so the script works regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

if [[ ! -d "${BACKEND_DIR}" ]]; then
    fail "Cannot locate backend/ directory under ${REPO_ROOT}"
    fail "Run this script from the repository root or any subdirectory."
    exit 1
fi

# ─── Resolve Maven wrapper (per go-rules.md §12 / AGENTS.md conventions) ─────
if command -v mvn &>/dev/null; then
    MVN="mvn"
elif [[ -x "${BACKEND_DIR}/mvnw" ]]; then
    MVN="${BACKEND_DIR}/mvnw"
    info "mvn not found in PATH — using ${MVN}"
else
    fail "Neither mvn nor ./mvnw found."
    fail "Install Maven or ensure ${BACKEND_DIR}/mvnw is executable."
    exit 1
fi

# ─── Sanity-check settings.xml ────────────────────────────────────────────────
if [[ ! -f "${BACKEND_DIR}/settings.xml" ]]; then
    fail "backend/settings.xml not found — required for GitHub Packages authentication."
    exit 1
fi

# ─── MAVEN_TK guard ──────────────────────────────────────────────────────────
# settings.xml uses ${MAVEN_TK} for GitHub Packages (read:packages PAT).
# Missing token causes dependency resolution failure with a cryptic 401.
# Warn now so the developer knows what to fix before the build starts.
if [[ -z "${MAVEN_TK:-}" ]]; then
    warn "MAVEN_TK is not set."
    warn "backend/settings.xml requires a GitHub PAT (read:packages scope) in MAVEN_TK."
    warn "The build will likely fail on dependency resolution."
    warn "Set it with:  export MAVEN_TK=<your-github-pat>"
    warn "Continuing anyway — you may have local Maven caches that cover the gap."
fi

# ─── Print banner ─────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Sprint 27 — Ollama LLM Provider — Backend Verification      ║"
echo "║  Three steps in order; any failure aborts immediately.        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
info "Backend dir : ${BACKEND_DIR}"
info "Maven       : ${MVN}"
info "MAVEN_TK    : ${MAVEN_TK:+(set)}${MAVEN_TK:--(not set)}"

# ─── Step 1: Production build + unit tests ────────────────────────────────────
step1_prod_build() {
    title "Step 1: Production build + unit tests"
    info "Running: ${MVN} -B -Pprod clean package -s settings.xml"
    info "This compiles all sources, runs all backend unit tests, and produces the WAR."
    info "(No -DskipTests — tests are part of the gate per Requirement 10.8)"

    if (cd "${BACKEND_DIR}" && "${MVN}" -B -Pprod clean package -s settings.xml); then
        pass "Step 1: Production build succeeded — WAR at backend/target/hivearmor.war"
        pass "Step 1: Unit tests passed as part of the build"
    else
        fail "Step 1: mvn -B -Pprod clean package failed — check the Maven output above"
        exit 1
    fi
}

# ─── Step 2: Liquibase changeset validation ───────────────────────────────────
step2_liquibase_validate() {
    title "Step 2: Liquibase changeset validation"
    info "Running: ${MVN} -s settings.xml liquibase:validate"
    info "Validates all changesets (including 20260127001_seed_llm_config.xml)"
    info "against the declared schema and verifies master.xml registration."

    if (cd "${BACKEND_DIR}" && "${MVN}" -s settings.xml liquibase:validate); then
        pass "Step 2: liquibase:validate passed — all changesets are consistent"
    else
        fail "Step 2: liquibase:validate failed — check changeset XML and master.xml"
        exit 1
    fi
}

# ─── Step 3: Unit-test gate confirmation ──────────────────────────────────────
# Unit tests were already executed during the production package in Step 1.
# This step prints an explicit gate confirmation aligned with Requirement 10.8's
# three-part wording: "mvn ... clean package", "liquibase:validate", "unit-test gate".
step3_unit_test_gate() {
    title "Step 3: Backend unit-test gate"
    info "Unit tests run as part of Step 1 (mvn -B -Pprod clean package)."
    info "No separate execution needed — Maven Surefire reports are in:"
    info "  backend/target/surefire-reports/"
    pass "Step 3: Backend unit-test gate confirmed (tests completed in Step 1)"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    step1_prod_build
    step2_liquibase_validate
    step3_unit_test_gate

    echo ""
    echo -e "${GREEN}${BOLD}✅  All Sprint 27 backend verification steps passed${RESET}"
    echo ""
}

main "$@"
