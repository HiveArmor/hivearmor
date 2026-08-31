#!/usr/bin/env bash
# =============================================================================
# seed-compliance-governance.sh — CMP-012 governance drawer dev seed
#
# Seeds POA&M (ha_poam_item) and control exceptions (ha_compliance_exception)
# for an existing catalog control so compliance drawer tabs show live rows.
#
# Usage:
#   cd local-dev && bash seed-compliance-governance.sh
#
# Prerequisites:
#   - PostgreSQL on localhost:5438 (postgres / localdev123!)
#   - Liquibase migrations applied (ha_poam_item, ha_compliance_exception)
# =============================================================================
set -euo pipefail

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5438}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-hivearmor}"
export PGPASSWORD="${PGPASSWORD:-localdev123!}"
PG_CONTAINER="${PG_CONTAINER:-local-dev-postgres-1}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}[seed-gov]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*"; }

run_sql() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q "$@"
  else
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -q "$@"
  fi
}

run_sql_out() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAq "$@"
  else
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -tAq "$@"
  fi
}

if ! run_sql_out -c "SELECT 1" >/dev/null 2>&1; then
  err "Cannot connect to PostgreSQL at ${PG_HOST}:${PG_PORT}/${PG_DB}"
  exit 1
fi

for TABLE in ha_poam_item ha_compliance_exception hive_compliance_control_config; do
  if ! run_sql_out -c "SELECT to_regclass('public.${TABLE}')" | grep -q "${TABLE}"; then
    err "Required table ${TABLE} not found — run backend Liquibase migrations first"
    exit 1
  fi
done

CONTROL_ROW=$(run_sql_out << 'SQL'
SELECT c.id || '|' || std.id
FROM hive_compliance_control_config c
JOIN hive_compliance_standard_section sec ON c.standard_section_id = sec.id
JOIN hive_compliance_standard std ON sec.standard_id = std.id
ORDER BY c.id
LIMIT 1;
SQL
)

if [[ -z "$CONTROL_ROW" || "$CONTROL_ROW" != *"|"* ]]; then
  err "No catalog control found in hive_compliance_control_config — seed compliance frameworks first"
  exit 1
fi

CONTROL_ID="${CONTROL_ROW%%|*}"
FRAMEWORK_ID="${CONTROL_ROW##*|}"

log "Using catalog control_id=${CONTROL_ID}, framework_id=${FRAMEWORK_ID}"

# Idempotent: remove prior governance seed rows
run_sql << 'SQL'
DELETE FROM ha_poam_item WHERE title LIKE '[SEED-GOV]%';
DELETE FROM ha_compliance_exception WHERE title LIKE '[SEED-GOV]%';
SQL

DUE_30=$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d "+30 days" +%Y-%m-%d)
DUE_60=$(date -v+60d +%Y-%m-%d 2>/dev/null || date -d "+60 days" +%Y-%m-%d)
DUE_90=$(date -v+90d +%Y-%m-%d 2>/dev/null || date -d "+90 days" +%Y-%m-%d)
EFF_FROM=$(date +%Y-%m-%d)
EFF_UNTIL=$(date -v+180d +%Y-%m-%d 2>/dev/null || date -d "+180 days" +%Y-%m-%d)
EFF_UNTIL_SHORT=$(date -v+90d +%Y-%m-%d 2>/dev/null || date -d "+90 days" +%Y-%m-%d)

run_sql << SQL
INSERT INTO ha_poam_item (framework_id, control_id, title, description, status, assignee, due_date)
VALUES
  ('${FRAMEWORK_ID}', '${CONTROL_ID}',
   '[SEED-GOV] Enable MFA for privileged accounts',
   'Dev seed — enforce MFA on admin and SOC manager accounts per control gap.',
   'open', 'admin', '${DUE_30}'),
  ('${FRAMEWORK_ID}', '${CONTROL_ID}',
   '[SEED-GOV] Patch critical vulnerabilities',
   'Dev seed — remediate CVE backlog on production-facing assets.',
   'in_progress', 'admin', '${DUE_60}'),
  ('${FRAMEWORK_ID}', '${CONTROL_ID}',
   '[SEED-GOV] Document compensating control review',
   'Dev seed — quarterly review of interim controls until full remediation.',
   'open', 'soc-manager', '${DUE_90}');

INSERT INTO ha_compliance_exception (control_id, title, reason, status, effective_from, effective_until, approver)
VALUES
  (${CONTROL_ID},
   '[SEED-GOV] Legacy auth system waiver',
   'Dev seed — compensating control during IdP migration window.',
   'approved', '${EFF_FROM}', '${EFF_UNTIL}', 'soc-manager'),
  (${CONTROL_ID},
   '[SEED-GOV] Vendor SLA exception',
   'Dev seed — third-party patch cadence exceeds internal policy temporarily.',
   'pending', '${EFF_FROM}', '${EFF_UNTIL_SHORT}', NULL);
SQL

POAM_COUNT=$(run_sql_out -c "SELECT COUNT(*) FROM ha_poam_item WHERE title LIKE '[SEED-GOV]%';")
EXC_COUNT=$(run_sql_out -c "SELECT COUNT(*) FROM ha_compliance_exception WHERE title LIKE '[SEED-GOV]%';")

ok "Seeded ${POAM_COUNT} ha_poam_item row(s) and ${EXC_COUNT} ha_compliance_exception row(s) for control_id=${CONTROL_ID}"
echo ""
echo "Governance seed summary:"
echo "  control_id:    ${CONTROL_ID}"
echo "  framework_id:  ${FRAMEWORK_ID}"
echo "  ha_poam_item:  ${POAM_COUNT}"
echo "  ha_compliance_exception: ${EXC_COUNT}"
echo ""
echo "Verify: GET /api/ha-compliance/poam?controlId=${CONTROL_ID}"
echo "        GET /api/ha-compliance/exceptions?controlId=${CONTROL_ID}"
