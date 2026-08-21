#!/usr/bin/env bash
# Property 18: Phase-1 runner exit code invariant
# Validates: Requirements 12.4, 12.5
#
# For any tuple of 10 category exit codes (c1..c10), the runner's overall exit
# code is:
#   0 — if every cᵢ is 0, OR the only non-zero codes are c4=2 or c7=2 (or both)
#   1 — otherwise (and the runner prints the name of the first failing category)
#
# Strategy: copy phase1_test.sh into a temp sandbox so BASH_SOURCE[0] resolves
# to that directory, then replace cat/ with minimal mock scripts that exit with
# the desired code. This tests the real runner logic without any network calls.
#
# Runtime dependencies: bash, python3 only (Req 12.2)
# Usage: bash scripts/integration/tests/phase1_runner.property.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="${SCRIPT_DIR}/../phase1_test.sh"

# ── Colours (optional — disabled when not a tty) ────────────────────────────
if [ -t 1 ]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
else
    RED=''; GREEN=''; NC=''
fi

# ── Counters ────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# ── Category metadata (mirrors phase1_test.sh CATEGORY_NAMES array) ─────────
CATEGORY_NAMES=(
    ""                          # index 0 — unused sentinel
    "backend-health"            # 1
    "authentication"            # 2
    "system-settings"           # 3
    "agent-health"              # 4  (AcceptableInfoExit = 2)
    "api-key-crud"              # 5
    "data-source-aggregation"   # 6
    "kafka-broker"              # 7  (AcceptableInfoExit = 2)
    "opensearch-indices"        # 8
    "frontend-gates"            # 9
    "backend-production-build"  # 10
)

# ── Oracle: pure-bash model of the runner's exit-code decision ───────────────
# runner_oracle <c1> <c2> ... <c10>
# Prints "0" or "1" matching what phase1_test.sh should return for the given
# tuple of category exit codes.
runner_oracle() {
    local codes=("$@")
    for i in "${!codes[@]}"; do
        local cat_num=$(( i + 1 ))
        local code="${codes[$i]}"
        if [[ "$code" -eq 0 ]]; then
            continue
        elif [[ "$code" -eq 2 && ( "$cat_num" -eq 4 || "$cat_num" -eq 7 ) ]]; then
            continue  # AcceptableInfoExit — Req 12.4
        else
            echo "1"  # fatal — Req 12.5
            return
        fi
    done
    echo "0"
}

# ── Build a self-contained sandbox and run the actual runner ─────────────────
# run_runner_in_sandbox <c1> <c2> ... <c10>
# Returns (echoes) the actual exit code produced by phase1_test.sh when each
# category script exits with the corresponding provided code.
#
# Key insight: phase1_test.sh derives SCRIPT_DIR from BASH_SOURCE[0], so we
# copy the runner into the tmpdir. Then `cat/` scripts resolve relative to that
# copy, and our mock scripts in tmpdir/cat/ are invoked instead of the real ones.
run_runner_in_sandbox() {
    local codes=("$@")

    # Isolated temp directory — cleaned up in a local trap
    local tmpdir
    tmpdir="$(mktemp -d)"

    mkdir -p "${tmpdir}/cat"

    # Copy the real runner so BASH_SOURCE[0] → tmpdir/phase1_test.sh and
    # therefore SCRIPT_DIR → tmpdir, making cat/ point to our mocks.
    cp "${RUNNER}" "${tmpdir}/phase1_test.sh"
    chmod +x "${tmpdir}/phase1_test.sh"

    # Write one mock category script per slot
    for i in "${!codes[@]}"; do
        local cat_num=$(( i + 1 ))
        local name="${CATEGORY_NAMES[$cat_num]}"
        local exit_code="${codes[$i]}"
        printf '#!/usr/bin/env bash\nexit %s\n' "${exit_code}" \
            > "${tmpdir}/cat/${name}.sh"
        chmod +x "${tmpdir}/cat/${name}.sh"
    done

    # Execute the runner; suppress all output to keep test results clean.
    bash "${tmpdir}/phase1_test.sh" >/dev/null 2>&1
    local actual_rc=$?

    rm -rf "${tmpdir}"
    echo "${actual_rc}"
}

# ── Single test-case evaluator ───────────────────────────────────────────────
# run_case <label> <c1> <c2> ... <c10>
run_case() {
    local label="$1"
    shift
    local codes=("$@")

    local expected
    expected="$(runner_oracle "${codes[@]}")"

    local actual
    actual="$(run_runner_in_sandbox "${codes[@]}")"

    TOTAL_COUNT=$(( TOTAL_COUNT + 1 ))
    if [[ "${actual}" -eq "${expected}" ]]; then
        PASS_COUNT=$(( PASS_COUNT + 1 ))
    else
        FAIL_COUNT=$(( FAIL_COUNT + 1 ))
        printf "${RED}[FAIL]${NC} %s\n" "${label}"
        printf "       codes    : %s\n" "${codes[*]}"
        printf "       expected : runner exits %s\n" "${expected}"
        printf "       actual   : runner exits %s\n" "${actual}"
    fi
}

# ── Deterministic corner cases ───────────────────────────────────────────────
run_deterministic_cases() {
    echo "── Deterministic cases ─────────────────────────────────────────────"

    # All zeros → 0
    run_case "all-zeros"                    0 0 0 0 0 0 0 0 0 0

    # cat4=2, all others 0 → 0  (AcceptableInfoExit)
    run_case "cat4-info-exit"               0 0 0 2 0 0 0 0 0 0

    # cat7=2, all others 0 → 0  (AcceptableInfoExit)
    run_case "cat7-info-exit"               0 0 0 0 0 0 2 0 0 0

    # cat4=2 AND cat7=2, all others 0 → 0
    run_case "cat4-and-cat7-info-exit"      0 0 0 2 0 0 2 0 0 0

    # cat1=1 → 1  (first category fails)
    run_case "cat1-fail-code-1"             1 0 0 0 0 0 0 0 0 0

    # cat4=1 → 1  (cat4 with code 1, not the acceptable 2)
    run_case "cat4-fail-code-1"             0 0 0 1 0 0 0 0 0 0

    # cat7=1 → 1  (cat7 with code 1, not the acceptable 2)
    run_case "cat7-fail-code-1"             0 0 0 0 0 0 1 0 0 0

    # cat4=3 → 1  (non-zero, non-2 on cat4)
    run_case "cat4-fail-code-3"             0 0 0 3 0 0 0 0 0 0

    # cat7=3 → 1  (non-zero, non-2 on cat7)
    run_case "cat7-fail-code-3"             0 0 0 0 0 0 3 0 0 0

    # cat10=1 → 1  (last category fails)
    run_case "cat10-fail-code-1"            0 0 0 0 0 0 0 0 0 1

    # cat5=2 → 1  (cat5 is not an AcceptableInfoExit category)
    run_case "cat5-code-2-is-fail"          0 0 0 0 2 0 0 0 0 0

    # cat1=2 → 1  (cat1 is not an AcceptableInfoExit category)
    run_case "cat1-code-2-is-fail"          2 0 0 0 0 0 0 0 0 0

    # cat4=2 but cat5=1 → 1  (cat4 info-OK, then cat5 fatal)
    run_case "cat4-ok-then-cat5-fail"       0 0 0 2 1 0 0 0 0 0

    # cat4=2 cat7=2 cat1=1 → 1  (fails at cat1 before reaching cat4/cat7)
    run_case "info-cats-ok-others-fail"     1 1 1 2 1 1 2 1 1 1

    # All ones → 1  (fails at cat1)
    run_case "all-ones"                     1 1 1 1 1 1 1 1 1 1
}

# ── Boundary sweep: every single-category deviation from all-zeros baseline ──
run_boundary_sweep() {
    echo "── Boundary sweep (single-category deviations) ─────────────────────"
    local fail_codes=(1 2 3 127 255)
    for cat_num in $(seq 1 10); do
        for code in "${fail_codes[@]}"; do
            local codes=()
            for j in $(seq 1 10); do
                if [[ "$j" -eq "$cat_num" ]]; then
                    codes+=("${code}")
                else
                    codes+=(0)
                fi
            done
            run_case "cat${cat_num}-exits-${code}" "${codes[@]}"
        done
    done
}

# ── Property-based random sampling via python3 ──────────────────────────────
# Generates N random 10-tuples with a distribution that exercises both passing
# and failing cases at realistic proportions:
#   0 (pass)         — 60%
#   1 (hard fail)    — 20%
#   2 (info or fail) — 10%
#   3 (other fail)   — 10%
# Prints one tuple per line: "c1 c2 c3 c4 c5 c6 c7 c8 c9 c10"
generate_tuples() {
    local n="$1"
    python3 - <<PYEOF
import random
random.seed(42)   # fixed seed for reproducibility
weights = [0]*6 + [1]*2 + [2]*1 + [3]*1
for _ in range(${n}):
    row = [random.choice(weights) for _ in range(10)]
    print(" ".join(str(x) for x in row))
PYEOF
}

run_property_cases() {
    local n="${1:-200}"
    echo "── Property-based random cases (n=${n}) ────────────────────────────"
    local case_num=0
    while IFS=" " read -r -a codes; do
        case_num=$(( case_num + 1 ))
        run_case "random-tuple-${case_num} [${codes[*]}]" "${codes[@]}"
    done < <(generate_tuples "${n}")
}

# ── Main ────────────────────────────────────────────────────────────────────
main() {
    echo "════════════════════════════════════════════════════════════════════"
    echo "  Property 18: Phase-1 runner exit code invariant"
    echo "  Validates: Requirements 12.4, 12.5"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""

    if [[ ! -f "${RUNNER}" ]]; then
        printf "${RED}ERROR${NC}: runner not found at %s\n" "${RUNNER}" >&2
        exit 1
    fi

    # Callers can tune sample count via PROPERTY18_SAMPLES env var
    local samples="${PROPERTY18_SAMPLES:-200}"

    run_deterministic_cases
    echo ""
    run_boundary_sweep
    echo ""
    run_property_cases "${samples}"

    echo ""
    echo "════════════════════════════════════════════════════════════════════"
    if [[ "${FAIL_COUNT}" -eq 0 ]]; then
        printf "${GREEN}PASSED${NC}  %d / %d cases\n" "${PASS_COUNT}" "${TOTAL_COUNT}"
        exit 0
    else
        printf "${RED}FAILED${NC}  %d failures out of %d cases\n" "${FAIL_COUNT}" "${TOTAL_COUNT}"
        exit 1
    fi
}

main "$@"
