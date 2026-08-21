#!/usr/bin/env bash
# verify-api.sh — Verifies backend API endpoints return pipeline-generated data
# Part of HiveArmor E2E Pipeline Integration Test (Sprint 50)
#
# Usage:
#   ./verify-api.sh [--backend-url=URL]
#
# Options:
#   --backend-url=URL    Override backend URL (default: http://localhost:8088)
#   --help               Show this help message
#
# Behavior:
#   1. Authenticates with the backend API to obtain a JWT token
#   2. Tests alert queue, severities, MITRE, entities
#   3. Tests severity board
#   4. Tests entity inventory, types, dossier
#   5. Tests correlated findings
#   6. Tests filtering
#   7. Reports pass/fail per assertion and summary
#
# Exit codes:
#   0 — all assertions passed
#   1 — one or more assertions failed

set -uo pipefail

###############################################################################
# Configuration
###############################################################################
BACKEND_URL="http://localhost:8088"
AUTH_USER="admin"
AUTH_PASS="localdev123!"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

###############################################################################
# Argument parsing
###############################################################################
show_help() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        --backend-url=*)
            BACKEND_URL="${arg#--backend-url=}"
            ;;
        --help|-h)
            show_help
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

###############################################################################
# Utility: check if jq is available
###############################################################################
HAS_JQ=false
if command -v jq &>/dev/null; then
    HAS_JQ=true
fi

###############################################################################
# Assertion helpers
###############################################################################
assert_pass() {
    local name="$1"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  PASS: $name"
}

assert_fail() {
    local name="$1"
    local detail="${2:-}"
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    FAIL_COUNT=$((FAIL_COUNT + 1))
    if [[ -n "$detail" ]]; then
        echo "  FAIL: $name — $detail"
    else
        echo "  FAIL: $name"
    fi
}

###############################################################################
# JSON helpers (jq with grep fallback)
###############################################################################
json_field() {
    local json="$1"
    local field="$2"

    if [[ "$HAS_JQ" == "true" ]]; then
        echo "$json" | jq -r "$field" 2>/dev/null
    else
        # Fallback: basic grep extraction (limited but functional)
        echo "$json" | grep -oP "\"${field#.}\"\\s*:\\s*\"?[^,\"}]*" | head -1 | sed -E 's/.*:\s*"?//'
    fi
}

json_length() {
    local json="$1"
    local path="$2"

    if [[ "$HAS_JQ" == "true" ]]; then
        echo "$json" | jq -r "$path | length" 2>/dev/null
    else
        # Fallback: count array items by counting opening braces at array level
        echo "0"
    fi
}

json_array_contains() {
    local json="$1"
    local path="$2"
    local value="$3"

    if [[ "$HAS_JQ" == "true" ]]; then
        local result
        result=$(echo "$json" | jq -r "$path | map(select(. == \"$value\")) | length" 2>/dev/null)
        [[ "$result" -gt 0 ]]
    else
        echo "$json" | grep -q "\"$value\""
    fi
}

###############################################################################
# 7.2 — Login and obtain JWT token
###############################################################################
test_login() {
    echo ""
    echo "--- 7.2 Login and obtain JWT token ---"

    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"${AUTH_USER}\",\"password\":\"${AUTH_PASS}\",\"rememberMe\":false}" \
        "${BACKEND_URL}/api/authenticate" 2>&1)

    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        assert_fail "Login returns 200" "got HTTP $http_code"
        echo "  ERROR: Cannot authenticate — subsequent tests will fail" >&2
        JWT_TOKEN=""
        return 1
    fi

    # Extract token — the API returns {"token":"..."}
    if [[ "$HAS_JQ" == "true" ]]; then
        JWT_TOKEN=$(echo "$body" | jq -r '.token // empty' 2>/dev/null)
    else
        JWT_TOKEN=$(echo "$body" | grep -oP '"token"\s*:\s*"\K[^"]+' | head -1)
    fi

    if [[ -z "$JWT_TOKEN" ]]; then
        assert_fail "JWT token extracted" "token field missing or empty"
        return 1
    fi

    assert_pass "Login returns 200 with JWT token"
    return 0
}

###############################################################################
# Auth header helper
###############################################################################
auth_header() {
    echo "Authorization: Bearer ${JWT_TOKEN}"
}

###############################################################################
# 7.3 — Test alert queue
###############################################################################
ALERT_QUEUE_RESPONSE=""

test_alert_queue() {
    echo ""
    echo "--- 7.3 Test alert queue ---"

    ALERT_QUEUE_RESPONSE=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-alerts?limit=20" 2>&1)

    # Check for error response
    if [[ "$HAS_JQ" == "true" ]]; then
        local status_check
        status_check=$(echo "$ALERT_QUEUE_RESPONSE" | jq -r '.status // empty' 2>/dev/null)
        if [[ "$status_check" == "500" ]]; then
            assert_fail "Alert queue returns ≥5 alerts" "backend returned 500 (pre-existing issue)"
            return
        fi
    fi

    local content_length
    if [[ "$HAS_JQ" == "true" ]]; then
        content_length=$(echo "$ALERT_QUEUE_RESPONSE" | jq -r '(.items // []) | length' 2>/dev/null)
    else
        # Fallback: count "alertId" occurrences as proxy for array length
        content_length=$(echo "$ALERT_QUEUE_RESPONSE" | grep -o '"alertId"' | wc -l | tr -d ' ')
    fi

    if [[ -z "$content_length" || "$content_length" == "null" ]]; then
        content_length=0
    fi

    if [[ "$content_length" -ge 5 ]]; then
        assert_pass "Alert queue returns ≥5 alerts (got $content_length)"
    else
        assert_fail "Alert queue returns ≥5 alerts" "got $content_length"
    fi

    # Also verify totalApproximate field exists
    if [[ "$HAS_JQ" == "true" ]]; then
        local total
        total=$(echo "$ALERT_QUEUE_RESPONSE" | jq -r '.totalApproximate // empty' 2>/dev/null)
        if [[ -n "$total" && "$total" != "null" ]]; then
            assert_pass "Alert queue has totalApproximate field (value: $total)"
        else
            assert_fail "Alert queue has totalApproximate field" "field missing"
        fi
    fi
}

###############################################################################
# 7.4 — Test alert severities
# Note: severity is numeric: 0=info, 1-3=low, 4-6=medium, 7-8=high, 9+=critical
# The API projection adds severityLabel when severity is a Number.
###############################################################################
test_alert_severities() {
    echo ""
    echo "--- 7.4 Test alert severities ---"

    if [[ -z "$ALERT_QUEUE_RESPONSE" ]]; then
        assert_fail "Alert severities check" "no alert queue response available"
        return
    fi

    local has_critical=false
    local has_high=false
    local has_medium=false

    if [[ "$HAS_JQ" == "true" ]]; then
        local severities
        severities=$(echo "$ALERT_QUEUE_RESPONSE" | jq -r '.items[].severity // empty' 2>/dev/null)

        # Severity is numeric: 9+=critical, 7-8=high, 4-6=medium
        echo "$severities" | awk '{v=int($0)} v>=9{found=1} END{exit !found}' && has_critical=true
        echo "$severities" | awk '{v=int($0)} v>=7 && v<9{found=1} END{exit !found}' && has_high=true
        echo "$severities" | awk '{v=int($0)} v>=4 && v<7{found=1} END{exit !found}' && has_medium=true
    else
        # Fallback: check for numeric severity values ≥9 (critical), 7-8 (high), 4-6 (medium)
        echo "$ALERT_QUEUE_RESPONSE" | grep -qE '"severity"\s*:\s*(9|10|11|12)' && has_critical=true
        echo "$ALERT_QUEUE_RESPONSE" | grep -qE '"severity"\s*:\s*[78]\b' && has_high=true
        echo "$ALERT_QUEUE_RESPONSE" | grep -qE '"severity"\s*:\s*[456]\b' && has_medium=true
    fi

    if [[ "$has_critical" == "true" ]]; then
        assert_pass "Critical alerts present (severity≥9)"
    else
        assert_fail "Critical alerts present (severity≥9)"
    fi

    if [[ "$has_high" == "true" ]]; then
        assert_pass "High alerts present (severity 7-8)"
    else
        assert_fail "High alerts present (severity 7-8)"
    fi

    if [[ "$has_medium" == "true" ]]; then
        assert_pass "Medium alerts present (severity 4-6)"
    else
        assert_fail "Medium alerts present (severity 4-6)"
    fi
}

###############################################################################
# 7.5 — Test alert MITRE
# MITRE field is at .items[].mitre.technique (passthrough from OpenSearch source)
###############################################################################
test_alert_mitre() {
    echo ""
    echo "--- 7.5 Test alert MITRE ---"

    if [[ -z "$ALERT_QUEUE_RESPONSE" ]]; then
        assert_fail "Alert MITRE check" "no alert queue response available"
        return
    fi

    local mitre_count=0

    if [[ "$HAS_JQ" == "true" ]]; then
        mitre_count=$(echo "$ALERT_QUEUE_RESPONSE" | jq '[.items[] | select(.mitre != null and .mitre.technique != null and .mitre.technique != "")] | length' 2>/dev/null)
    else
        mitre_count=$(echo "$ALERT_QUEUE_RESPONSE" | grep -o '"technique"' | wc -l | tr -d ' ')
    fi

    if [[ -z "$mitre_count" || "$mitre_count" == "null" ]]; then
        mitre_count=0
    fi

    if [[ "$mitre_count" -ge 1 ]]; then
        assert_pass "Alerts have MITRE technique fields ($mitre_count alerts with MITRE)"
    else
        assert_fail "Alerts have MITRE technique fields" "no MITRE data found"
    fi
}

###############################################################################
# 7.6 — Test alert entities
# Entities are at .items[].entities[] (if present)
###############################################################################
test_alert_entities() {
    echo ""
    echo "--- 7.6 Test alert entities ---"

    if [[ -z "$ALERT_QUEUE_RESPONSE" ]]; then
        assert_fail "Alert entities check" "no alert queue response available"
        return
    fi

    local alerts_with_entities=0

    if [[ "$HAS_JQ" == "true" ]]; then
        alerts_with_entities=$(echo "$ALERT_QUEUE_RESPONSE" | jq '[.items[] | select(.entities != null and (.entities | length) >= 2)] | length' 2>/dev/null)
    else
        # Fallback: check for entities arrays
        alerts_with_entities=$(echo "$ALERT_QUEUE_RESPONSE" | grep -o '"entities"' | wc -l | tr -d ' ')
    fi

    if [[ -z "$alerts_with_entities" || "$alerts_with_entities" == "null" ]]; then
        alerts_with_entities=0
    fi

    if [[ "$alerts_with_entities" -ge 1 ]]; then
        assert_pass "Alerts have entities[] with ≥2 entities ($alerts_with_entities alerts qualify)"
    else
        assert_fail "Alerts have entities[] with ≥2 entities" "got $alerts_with_entities"
    fi
}

###############################################################################
# 7.7 — Test severity board
# GET /api/ha-alerts/severity-board
# Returns: {"overview":{...}, "lanes":[{"severity":"critical","count":N,"alerts":[...]}, ...]}
###############################################################################
test_severity_board() {
    echo ""
    echo "--- 7.7 Test severity board ---"

    local response
    response=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-alerts/severity-board" 2>&1)

    local non_empty_lanes=0

    if [[ "$HAS_JQ" == "true" ]]; then
        # Response has .lanes[] with .count field — count lanes where count > 0
        non_empty_lanes=$(echo "$response" | jq '[.lanes[] | select(.count > 0)] | length' 2>/dev/null)

        if [[ -z "$non_empty_lanes" || "$non_empty_lanes" == "null" ]]; then
            non_empty_lanes=0
        fi
    else
        # Fallback: count severity labels that appear with data
        for sev in critical high medium low; do
            if echo "$response" | grep -qi "$sev"; then
                non_empty_lanes=$((non_empty_lanes + 1))
            fi
        done
    fi

    if [[ -z "$non_empty_lanes" || "$non_empty_lanes" == "null" ]]; then
        non_empty_lanes=0
    fi

    if [[ "$non_empty_lanes" -ge 2 ]]; then
        assert_pass "Severity board has ≥2 non-empty lanes ($non_empty_lanes)"
    else
        assert_fail "Severity board has ≥2 non-empty lanes" "got $non_empty_lanes non-empty"
    fi
}

###############################################################################
# 7.8 — Test entity inventory
# GET /api/ha-entities?page=0&size=50
# Returns: {"items":[...], "total": N, "cursor": ...}
###############################################################################
ENTITY_RESPONSE=""

test_entity_inventory() {
    echo ""
    echo "--- 7.8 Test entity inventory ---"

    ENTITY_RESPONSE=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-entities?page=0&size=50" 2>&1)

    local content_length=0

    if [[ "$HAS_JQ" == "true" ]]; then
        content_length=$(echo "$ENTITY_RESPONSE" | jq -r '(.items // []) | length' 2>/dev/null)
    else
        content_length=$(echo "$ENTITY_RESPONSE" | grep -o '"id"' | wc -l | tr -d ' ')
    fi

    if [[ -z "$content_length" || "$content_length" == "null" ]]; then
        content_length=0
    fi

    if [[ "$content_length" -ge 10 ]]; then
        assert_pass "Entity inventory returns ≥10 entities (got $content_length)"
    else
        assert_fail "Entity inventory returns ≥10 entities" "got $content_length"
    fi

    # Verify total field (the API uses "total" as the count field)
    if [[ "$HAS_JQ" == "true" ]]; then
        local total_field
        total_field=$(echo "$ENTITY_RESPONSE" | jq -r '.total // .totalItems // empty' 2>/dev/null)
        if [[ -n "$total_field" && "$total_field" != "null" ]]; then
            assert_pass "Entity inventory has total field (value: $total_field)"
        else
            assert_fail "Entity inventory has total field" "field missing"
        fi
    fi
}

###############################################################################
# 7.9 — Test entity types
###############################################################################
test_entity_types() {
    echo ""
    echo "--- 7.9 Test entity types ---"

    if [[ -z "$ENTITY_RESPONSE" ]]; then
        assert_fail "Entity types check" "no entity response available"
        return
    fi

    local has_host=false
    local has_user=false
    local has_ip=false

    if [[ "$HAS_JQ" == "true" ]]; then
        local types
        types=$(echo "$ENTITY_RESPONSE" | jq -r '.items[].type // empty' 2>/dev/null)

        echo "$types" | grep -qi "host" && has_host=true
        echo "$types" | grep -qi "user" && has_user=true
        echo "$types" | grep -qi "ip" && has_ip=true
    else
        echo "$ENTITY_RESPONSE" | grep -qi '"type"[[:space:]]*:[[:space:]]*"host"' && has_host=true
        echo "$ENTITY_RESPONSE" | grep -qi '"type"[[:space:]]*:[[:space:]]*"user"' && has_user=true
        echo "$ENTITY_RESPONSE" | grep -qi '"type"[[:space:]]*:[[:space:]]*"ip"' && has_ip=true
    fi

    if [[ "$has_host" == "true" ]]; then
        assert_pass "Host entities present"
    else
        assert_fail "Host entities present"
    fi

    if [[ "$has_user" == "true" ]]; then
        assert_pass "User entities present"
    else
        assert_fail "User entities present"
    fi

    if [[ "$has_ip" == "true" ]]; then
        assert_pass "IP entities present"
    else
        assert_fail "IP entities present"
    fi
}

###############################################################################
# 7.10 — Test entity dossier
# GET /api/ha-entities/{id}/dossier
# Returns: {"dossier": {"identity": {...}, "riskProfile": {...}, ...}}
###############################################################################
test_entity_dossier() {
    echo ""
    echo "--- 7.10 Test entity dossier ---"

    # Get first entity ID from the entity response to use for dossier lookup
    local entity_id=""
    if [[ "$HAS_JQ" == "true" && -n "$ENTITY_RESPONSE" ]]; then
        entity_id=$(echo "$ENTITY_RESPONSE" | jq -r '.items[0].id // .items[0].entityId // empty' 2>/dev/null)
    fi

    # Fallback to a known test entity ID
    if [[ -z "$entity_id" ]]; then
        entity_id="ent-host-fin-wks-044"
    fi

    local response
    response=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-entities/${entity_id}/dossier" 2>&1)

    local has_data=false

    if [[ "$HAS_JQ" == "true" ]]; then
        # Check for meaningful response (not an error)
        local status_check
        status_check=$(echo "$response" | jq -r '.status // empty' 2>/dev/null)
        if [[ "$status_check" == "404" || "$status_check" == "500" ]]; then
            assert_fail "Entity dossier has data for $entity_id" "backend returned $status_check"
            return
        fi

        # Dossier response wraps data under .dossier key with identity, riskProfile, etc.
        local data_check
        data_check=$(echo "$response" | jq 'if .dossier != null or .identity != null or .activity != null or .alerts != null or .events != null or .timeline != null or .entityId != null or .id != null or .entity != null then "yes" else "no" end' 2>/dev/null)
        [[ "$data_check" == "\"yes\"" ]] && has_data=true
    else
        # Fallback: check if response has meaningful content (not an error)
        if echo "$response" | grep -qE '"(dossier|identity|activity|alerts|events|timeline|entityId|entity|id|riskProfile)"'; then
            has_data=true
        fi
    fi

    if [[ "$has_data" == "true" ]]; then
        assert_pass "Entity dossier has data for $entity_id"
    else
        assert_fail "Entity dossier has data for $entity_id" "no recognizable data fields found"
    fi
}

###############################################################################
# 7.11 — Test findings
# GET /api/ha-correlated-findings?limit=20
# Returns: {items: [...], total: N, cursor: ..., summary: {...}}
# Note: The endpoint is /ha-correlated-findings (NOT /ha-findings)
###############################################################################
FINDINGS_RESPONSE=""

test_findings() {
    echo ""
    echo "--- 7.11 Test findings ---"

    local http_code
    local response
    response=$(curl -s -w "\n%{http_code}" \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-correlated-findings?limit=20" 2>&1)

    http_code=$(echo "$response" | tail -1)
    FINDINGS_RESPONSE=$(echo "$response" | sed '$d')

    # If GET returns 500, note it as pre-existing issue
    if [[ "$http_code" == "500" ]]; then
        assert_fail "Findings returns ≥1 finding" "GET /api/ha-correlated-findings returned 500 (pre-existing issue)"
        return
    fi

    local content_length=0

    if [[ "$HAS_JQ" == "true" ]]; then
        content_length=$(echo "$FINDINGS_RESPONSE" | jq -r '(.items // []) | length' 2>/dev/null)
    else
        content_length=$(echo "$FINDINGS_RESPONSE" | grep -o '"findingId"\|"id"' | wc -l | tr -d ' ')
    fi

    if [[ -z "$content_length" || "$content_length" == "null" ]]; then
        content_length=0
    fi

    if [[ "$content_length" -ge 1 ]]; then
        assert_pass "Findings returns ≥1 finding (got $content_length)"
    else
        assert_fail "Findings returns ≥1 finding" "got $content_length"
    fi
}

###############################################################################
# 7.12 — Test finding structure
# Fetches a finding detail to verify full structure (entities, stages, narrative)
# Detail endpoint: GET /api/ha-correlated-findings/{id}
# Returns: {"finding": {...entities, stages, narrative, relationships...}}
###############################################################################
test_finding_structure() {
    echo ""
    echo "--- 7.12 Test finding structure ---"

    if [[ -z "$FINDINGS_RESPONSE" ]]; then
        assert_fail "Finding structure check" "no findings response available"
        return
    fi

    # Get first finding ID from the list
    local finding_id=""
    if [[ "$HAS_JQ" == "true" ]]; then
        finding_id=$(echo "$FINDINGS_RESPONSE" | jq -r '.items[0].id // empty' 2>/dev/null)
    fi

    if [[ -z "$finding_id" ]]; then
        assert_fail "Finding has entities[] field" "no finding ID available"
        assert_fail "Finding has stages[] field" "no finding ID available"
        assert_fail "Finding has narrative field" "no finding ID available"
        return
    fi

    # Fetch finding detail
    local detail_response
    detail_response=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-correlated-findings/${finding_id}" 2>&1)

    local has_entities=false
    local has_stages=false
    local has_narrative=false

    if [[ "$HAS_JQ" == "true" ]]; then
        # Detail is wrapped under .finding key
        local finding_obj
        finding_obj=$(echo "$detail_response" | jq '.finding // .' 2>/dev/null)

        if [[ -n "$finding_obj" && "$finding_obj" != "null" ]]; then
            [[ $(echo "$finding_obj" | jq 'has("entities")' 2>/dev/null) == "true" ]] && has_entities=true
            [[ $(echo "$finding_obj" | jq 'has("stages")' 2>/dev/null) == "true" ]] && has_stages=true
            [[ $(echo "$finding_obj" | jq 'has("narrative")' 2>/dev/null) == "true" ]] && has_narrative=true
        fi
    else
        echo "$detail_response" | grep -q '"entities"' && has_entities=true
        echo "$detail_response" | grep -q '"stages"' && has_stages=true
        echo "$detail_response" | grep -q '"narrative"' && has_narrative=true
    fi

    if [[ "$has_entities" == "true" ]]; then
        assert_pass "Finding has entities[] field"
    else
        assert_fail "Finding has entities[] field"
    fi

    if [[ "$has_stages" == "true" ]]; then
        assert_pass "Finding has stages[] field"
    else
        assert_fail "Finding has stages[] field"
    fi

    if [[ "$has_narrative" == "true" ]]; then
        assert_pass "Finding has narrative field"
    else
        assert_fail "Finding has narrative field"
    fi
}

###############################################################################
# 7.13 — Test filtering
# GET /api/ha-alerts?severity=critical&limit=20
# Backend translates severity=critical to range query: severity >= 9
###############################################################################
test_filtering() {
    echo ""
    echo "--- 7.13 Test filtering ---"

    local response
    response=$(curl -s \
        -X GET \
        -H "$(auth_header)" \
        "${BACKEND_URL}/api/ha-alerts?severity=critical&limit=20" 2>&1)

    local all_critical=true
    local content_length=0

    if [[ "$HAS_JQ" == "true" ]]; then
        content_length=$(echo "$response" | jq -r '(.items // []) | length' 2>/dev/null)

        if [[ -n "$content_length" && "$content_length" != "null" && "$content_length" -gt 0 ]]; then
            # Severity is numeric: critical = severity >= 9
            # Check that no items have severity < 9
            local non_critical
            non_critical=$(echo "$response" | jq '[.items[] | select(.severity != null and (.severity | tonumber) < 9)] | length' 2>/dev/null)
            if [[ -n "$non_critical" && "$non_critical" != "null" && "$non_critical" -gt 0 ]]; then
                all_critical=false
            fi
        fi
    else
        content_length=$(echo "$response" | grep -o '"alertId"' | wc -l | tr -d ' ')
        # Check if any severity < 9 appears
        if echo "$response" | grep -qE '"severity"\s*:\s*[0-8]\b'; then
            all_critical=false
        fi
    fi

    if [[ -z "$content_length" || "$content_length" == "null" ]]; then
        content_length=0
    fi

    if [[ "$content_length" -ge 1 && "$all_critical" == "true" ]]; then
        assert_pass "Filtered alert queue returns only critical alerts ($content_length results)"
    elif [[ "$content_length" -eq 0 ]]; then
        assert_fail "Filtered alert queue returns only critical alerts" "got 0 results"
    else
        assert_fail "Filtered alert queue returns only critical alerts" "non-critical alerts found in response"
    fi
}

###############################################################################
# 7.14 — Report
###############################################################################
print_report() {
    echo ""
    echo "==========================================="
    echo " API Verification Summary"
    echo "==========================================="
    echo ""
    echo "  ${PASS_COUNT}/${TOTAL_COUNT} assertions passed"
    echo ""

    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo "  Result: ALL PASSED ✓"
    else
        echo "  Result: ${FAIL_COUNT} FAILED ✗"
    fi

    echo ""
    echo "==========================================="
}

###############################################################################
# Main execution
###############################################################################
main() {
    echo "=== HiveArmor E2E API Verification ==="
    echo "Backend URL: ${BACKEND_URL}"
    echo ""

    # Check backend is reachable
    if ! curl -s --connect-timeout 5 "${BACKEND_URL}/management/health" &>/dev/null; then
        echo "ERROR: Backend not reachable at ${BACKEND_URL}" >&2
        echo "Make sure the backend is running: cd backend && mvn -s settings.xml -B" >&2
        exit 1
    fi

    # 7.2 — Login
    if ! test_login; then
        echo ""
        echo "ERROR: Authentication failed — cannot proceed with API tests" >&2
        print_report
        exit 1
    fi

    # 7.3 — Alert queue
    test_alert_queue

    # 7.4 — Alert severities
    test_alert_severities

    # 7.5 — Alert MITRE
    test_alert_mitre

    # 7.6 — Alert entities
    test_alert_entities

    # 7.7 — Severity board
    test_severity_board

    # 7.8 — Entity inventory
    test_entity_inventory

    # 7.9 — Entity types
    test_entity_types

    # 7.10 — Entity dossier
    test_entity_dossier

    # 7.11 — Findings
    test_findings

    # 7.12 — Finding structure
    test_finding_structure

    # 7.13 — Filtering
    test_filtering

    # 7.14 — Report
    print_report

    if [[ $FAIL_COUNT -gt 0 ]]; then
        exit 1
    fi

    exit 0
}

JWT_TOKEN=""
main
