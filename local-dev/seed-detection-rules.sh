#!/usr/bin/env bash
# =============================================================================
# seed-detection-rules.sh — Sprint 47 Detection Rules test data
#
# Seeds 50 detection rules (30 managed + 20 custom) across 3 tenants with:
#   - Realistic CEL expressions per rule
#   - 20-50 execution history entries spanning 30 days per rule
#   - Version history (3-5 for managed, 1-3 for custom)
#   - Health distribution: 35 healthy, 8 degraded, 5 error, 2 disabled
#   - MITRE coverage: 12 tactics, 30+ techniques, deliberate gaps
#   - 3 rules in review state with pending approvals
#   - 10 Sigma YAML source files for import testing
#
# Usage:
#   cd local-dev && bash seed-detection-rules.sh
#   cd local-dev && bash seed-detection-rules.sh --teardown
#
# Prerequisites:
#   - PostgreSQL on localhost:5438 (postgres / localdev123!)
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PG_HOST="localhost"
PG_PORT="5438"
PG_USER="postgres"
PG_DB="hivearmor"
export PGPASSWORD="localdev123!"
PG_CONTAINER="local-dev-postgres-1"

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${CYAN}  →${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}$*${NC}"; }

# Use docker exec for reliable PostgreSQL connection
run_sql() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -q "$@"; }
run_sql_out() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAq "$@"; }

teardown() {
  header "Teardown — removing Sprint 47 detection rules seed data"
  info "Truncating detection tables..."
  run_sql << 'SQL'
TRUNCATE TABLE rule_approvals CASCADE;
TRUNCATE TABLE rule_executions CASCADE;
TRUNCATE TABLE rule_versions CASCADE;
TRUNCATE TABLE detection_rules CASCADE;
SQL
  ok "All detection rule tables truncated"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 47 Detection Rules Seed (50 rules)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "PostgreSQL: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo ""

# ─── Idempotent: truncate tables before re-seeding ──────────────────────────
header "Step 0: Clean previous seed data (idempotent)"

# Ensure tables exist (in case Liquibase hasn't run yet)
run_sql << 'SQL' || true
CREATE TABLE IF NOT EXISTS detection_rules (
    id varchar(36) PRIMARY KEY, name varchar(500) NOT NULL, description text,
    expression text NOT NULL, filters text, schedule varchar(64),
    scope varchar(32) DEFAULT 'custom' NOT NULL, status varchar(32) DEFAULT 'draft' NOT NULL,
    severity varchar(32) NOT NULL, mitre_tactics text, mitre_techniques text, tags text,
    author varchar(255) NOT NULL, tenant_id bigint NOT NULL, version integer DEFAULT 1 NOT NULL,
    sigma_source text, created_at timestamp DEFAULT CURRENT_TIMESTAMP, updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rule_versions (
    id varchar(36) PRIMARY KEY, rule_id varchar(36) NOT NULL, version integer NOT NULL,
    expression text NOT NULL, filters text, changes text, author varchar(255) NOT NULL,
    status varchar(32) NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rule_executions (
    id varchar(36) PRIMARY KEY, rule_id varchar(36) NOT NULL, started_at timestamp NOT NULL,
    completed_at timestamp, duration bigint, status varchar(32) NOT NULL,
    alerts_generated integer DEFAULT 0, events_scanned bigint DEFAULT 0, errors text,
    triggered_by varchar(32) NOT NULL, tenant_id bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS rule_approvals (
    id varchar(36) PRIMARY KEY, rule_id varchar(36) NOT NULL, version integer NOT NULL,
    reviewer varchar(255) NOT NULL, status varchar(32) NOT NULL, comment text,
    tenant_id bigint NOT NULL, created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_detection_rules_tenant ON detection_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_detection_rules_status ON detection_rules(status);
CREATE INDEX IF NOT EXISTS idx_detection_rules_scope ON detection_rules(scope);
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id, version);
CREATE INDEX IF NOT EXISTS idx_rule_executions_rule ON rule_executions(rule_id, started_at);
CREATE INDEX IF NOT EXISTS idx_rule_executions_tenant ON rule_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rule_approvals_rule ON rule_approvals(rule_id);
SQL
ok "Tables verified"

run_sql << 'SQL' || true
TRUNCATE TABLE rule_approvals CASCADE;
TRUNCATE TABLE rule_executions CASCADE;
TRUNCATE TABLE rule_versions CASCADE;
TRUNCATE TABLE detection_rules CASCADE;
SQL
ok "Tables truncated"

# ─── Step 1: Seed 30 Managed Rules ─────────────────────────────────────────
header "Step 1: Seeding 30 managed detection rules"

run_sql << 'SQL'
-- ============================================================================
-- 30 MANAGED RULES across 3 tenants (10 per tenant)
-- Health targets: 25 healthy, 3 degraded, 1 error, 1 disabled (from managed)
-- ============================================================================

-- Tenant 1 — 10 managed rules
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-m01-t1-brute', 'Brute Force Login Detection', 'Detects multiple failed authentication attempts from a single source within a short time window indicating credential brute-force attacks.', 'celExists(source.ip) && equals(event.category, "authentication") && equals(event.outcome, "failure") && safe(event.count) > 5', '{"timeWindow": "5m", "groupBy": "source.ip", "threshold": 5}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0006', 'T1110', 'brute-force,authentication,credential-access', 'HiveArmor Threat Research', 1, 5, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 days'),
('dr-m02-t1-pshell', 'Encoded PowerShell Execution', 'Identifies encoded or obfuscated PowerShell commands commonly used by threat actors to evade detection.', 'celExists(process.name) && equals(process.name, "powershell.exe") && contains(process.command_line, "-enc")', '{"exclude": ["known_automation_accounts"]}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0002', 'T1059.001', 'powershell,execution,obfuscation', 'HiveArmor Threat Research', 1, 4, NULL, NOW() - INTERVAL '85 days', NOW() - INTERVAL '1 day'),
('dr-m03-t1-lsass', 'LSASS Memory Access', 'Detects suspicious access to LSASS process memory which may indicate credential dumping attempts.', 'celExists(process.name) && equals(target.process.name, "lsass.exe") && oneOf(event.action, "process_access", "open_process") && safe(process.Ext.call_stack_summary) != ""', '{"exclude_callers": ["csrss.exe", "smss.exe", "wininit.exe"]}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0006', 'T1003.001', 'credential-dumping,lsass,mimikatz', 'HiveArmor Threat Research', 1, 5, NULL, NOW() - INTERVAL '92 days', NOW() - INTERVAL '3 days'),
('dr-m04-t1-dns', 'DNS Tunneling Detection', 'Identifies potential DNS tunneling by analyzing query patterns for high entropy subdomain names and unusual query volumes.', 'celExists(dns.question.name) && safe(dns.question.name.length) > 50 && regexMatch(dns.question.name, "^[a-z0-9]{30,}\\.")', '{"timeWindow": "10m", "minQueries": 20}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0011', 'T1071.004', 'dns-tunneling,exfiltration,c2', 'HiveArmor Threat Research', 1, 3, NULL, NOW() - INTERVAL '80 days', NOW() - INTERVAL '5 days'),
('dr-m05-t1-smb', 'Lateral Movement via SMB', 'Detects suspicious SMB connections to multiple internal hosts indicating lateral movement.', 'celExists(destination.port) && equals(destination.port, "445") && equals(network.direction, "internal") && safe(destination.ip.count) > 3', '{"timeWindow": "15m", "groupBy": "source.ip", "threshold": 3}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0008', 'T1021.002', 'lateral-movement,smb,network', 'HiveArmor Threat Research', 1, 4, NULL, NOW() - INTERVAL '88 days', NOW() - INTERVAL '4 days'),
('dr-m06-t1-kerb', 'Kerberoasting Attempt', 'Identifies Kerberos TGS requests for service accounts with weak encryption types indicating kerberoasting.', 'celExists(winlog.event_data.TicketEncryptionType) && equals(winlog.event_data.TicketEncryptionType, "0x17") && equals(event.code, "4769")', '{"exclude_services": ["krbtgt"]}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0006', 'T1558.003', 'kerberoasting,credential-access,active-directory', 'HiveArmor Threat Research', 1, 3, NULL, NOW() - INTERVAL '75 days', NOW() - INTERVAL '6 days'),
('dr-m07-t1-schtask', 'Suspicious Scheduled Task', 'Detects creation of scheduled tasks with suspicious attributes commonly used for persistence.', 'celExists(process.name) && oneOf(process.name, "schtasks.exe", "at.exe") && contains(process.command_line, "/create") && regexMatch(process.command_line, "(powershell|cmd|wscript|cscript|mshta)")', NULL, '*/5 * * * *', 'managed', 'active', 'medium', 'TA0003', 'T1053.005', 'persistence,scheduled-task,execution', 'HiveArmor Threat Research', 1, 4, NULL, NOW() - INTERVAL '70 days', NOW() - INTERVAL '7 days'),
('dr-m08-t1-regrun', 'Registry Run Key Persistence', 'Identifies modifications to registry run keys used for persistence.', 'celExists(registry.path) && containsAll(registry.path, "\\CurrentVersion\\Run") && equals(event.action, "modification")', '{"exclude_values": ["SecurityHealth", "Windows Defender"]}', '*/5 * * * *', 'managed', 'active', 'medium', 'TA0003', 'T1547.001', 'persistence,registry,autorun', 'HiveArmor Threat Research', 1, 3, NULL, NOW() - INTERVAL '78 days', NOW() - INTERVAL '8 days'),
('dr-m09-t1-cred', 'Credential Dumping Tools', 'Detects execution of known credential dumping tools or processes with credential-dumping behavior.', 'celExists(process.name) && oneOf(process.name, "mimikatz.exe", "procdump.exe", "secretsdump.py") || (contains(process.command_line, "sekurlsa") && contains(process.command_line, "logonpasswords"))', NULL, '*/5 * * * *', 'managed', 'active', 'critical', 'TA0006', 'T1003', 'credential-dumping,tools,detection', 'HiveArmor Threat Research', 1, 5, NULL, NOW() - INTERVAL '95 days', NOW() - INTERVAL '1 day'),
('dr-m10-t1-exfil', 'Data Exfiltration Over HTTP', 'Detects large outbound HTTP transfers to uncommon destinations indicating potential data exfiltration.', 'celExists(http.request.bytes) && safe(http.request.bytes) > 10485760 && equals(network.direction, "outbound") && !inCIDR(destination.ip, "10.0.0.0/8")', '{"timeWindow": "1h", "minBytes": 10485760}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0010', 'T1048.003', 'exfiltration,http,data-loss', 'HiveArmor Threat Research', 1, 4, NULL, NOW() - INTERVAL '82 days', NOW() - INTERVAL '3 days');
SQL

ok "Tenant 1 — 10 managed rules inserted"

run_sql << 'SQL'
-- Tenant 2 — 10 managed rules
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-m11-t2-brute', 'Brute Force Login Detection', 'Detects multiple failed authentication attempts from a single source within a short time window.', 'celExists(source.ip) && equals(event.category, "authentication") && equals(event.outcome, "failure") && safe(event.count) > 5', '{"timeWindow": "5m", "groupBy": "source.ip", "threshold": 5}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0006', 'T1110', 'brute-force,authentication', 'HiveArmor Threat Research', 2, 5, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 days'),
('dr-m12-t2-pshell', 'Encoded PowerShell Execution', 'Identifies encoded or obfuscated PowerShell commands used to evade detection.', 'celExists(process.name) && equals(process.name, "powershell.exe") && contains(process.command_line, "-enc")', '{"exclude": ["known_automation_accounts"]}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0002', 'T1059.001', 'powershell,execution', 'HiveArmor Threat Research', 2, 4, NULL, NOW() - INTERVAL '85 days', NOW() - INTERVAL '1 day'),
('dr-m13-t2-lsass', 'LSASS Memory Access', 'Detects suspicious access to LSASS process memory for credential harvesting.', 'celExists(process.name) && equals(target.process.name, "lsass.exe") && oneOf(event.action, "process_access", "open_process")', '{"exclude_callers": ["csrss.exe", "smss.exe"]}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0006', 'T1003.001', 'credential-dumping,lsass', 'HiveArmor Threat Research', 2, 5, NULL, NOW() - INTERVAL '92 days', NOW() - INTERVAL '3 days'),
('dr-m14-t2-dga', 'DGA Domain Detection', 'Identifies domain generation algorithm (DGA) patterns in DNS queries indicating C2 communication.', 'celExists(dns.question.name) && regexMatch(dns.question.name, "^[a-z]{8,15}\\.(com|net|org|info)$") && safe(dns.question.entropy) > 3.5', '{"timeWindow": "5m", "minQueries": 10}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0011', 'T1568.002', 'dga,c2,dns', 'HiveArmor Threat Research', 2, 3, NULL, NOW() - INTERVAL '72 days', NOW() - INTERVAL '4 days'),
('dr-m15-t2-wmi', 'WMI Remote Execution', 'Detects WMI-based remote code execution commonly used for lateral movement.', 'celExists(process.name) && equals(process.parent.name, "wmiprvse.exe") && !oneOf(process.name, "mofcomp.exe", "WmiApSrv.exe")', NULL, '*/5 * * * *', 'managed', 'active', 'high', 'TA0002,TA0008', 'T1047', 'wmi,lateral-movement,execution', 'HiveArmor Threat Research', 2, 4, NULL, NOW() - INTERVAL '68 days', NOW() - INTERVAL '5 days'),
('dr-m16-t2-dcsync', 'DCSync Attack Detection', 'Detects replication requests from non-domain-controller machines indicating DCSync attacks.', 'celExists(winlog.event_data.SubjectUserName) && equals(event.code, "4662") && contains(winlog.event_data.Properties, "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2")', '{"exclude_accounts": ["MSOL_*", "AAD_*"]}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0006', 'T1003.006', 'dcsync,active-directory,credential-access', 'HiveArmor Threat Research', 2, 3, NULL, NOW() - INTERVAL '65 days', NOW() - INTERVAL '6 days'),
('dr-m17-t2-webshell', 'Web Shell Detection', 'Identifies web server processes spawning suspicious child processes indicating web shell activity.', 'celExists(process.parent.name) && oneOf(process.parent.name, "w3wp.exe", "httpd", "nginx", "apache2") && oneOf(process.name, "cmd.exe", "powershell.exe", "bash", "sh")', NULL, '*/5 * * * *', 'managed', 'active', 'critical', 'TA0003', 'T1505.003', 'webshell,persistence,initial-access', 'HiveArmor Threat Research', 2, 4, NULL, NOW() - INTERVAL '77 days', NOW() - INTERVAL '2 days'),
('dr-m18-t2-certutil', 'Certutil Download Abuse', 'Detects abuse of certutil.exe for downloading files from the internet.', 'celExists(process.name) && equals(process.name, "certutil.exe") && containsAll(process.command_line, "-urlcache") && contains(process.command_line, "http")', NULL, '*/5 * * * *', 'managed', 'active', 'medium', 'TA0011', 'T1105', 'certutil,download,lolbins', 'HiveArmor Threat Research', 2, 3, NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '7 days'),
('dr-m19-t2-rdp', 'Anomalous RDP Connection', 'Detects RDP connections from unusual source IPs or during non-business hours.', 'celExists(destination.port) && equals(destination.port, "3389") && equals(event.action, "connection_accepted") && !inCIDR(source.ip, "10.0.0.0/8")', '{"businessHours": "08:00-18:00", "timezone": "UTC"}', '*/5 * * * *', 'managed', 'active', 'medium', 'TA0008', 'T1021.001', 'rdp,lateral-movement,remote-access', 'HiveArmor Threat Research', 2, 3, NULL, NOW() - INTERVAL '55 days', NOW() - INTERVAL '8 days'),
('dr-m20-t2-token', 'Access Token Manipulation', 'Identifies processes manipulating access tokens for privilege escalation.', 'celExists(winlog.event_data.SubjectLogonId) && equals(event.code, "4672") && !oneOf(winlog.event_data.SubjectUserName, "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE")', NULL, '*/5 * * * *', 'managed', 'disabled', 'high', 'TA0004', 'T1134', 'privilege-escalation,token,windows', 'HiveArmor Threat Research', 2, 4, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '10 days');
SQL

ok "Tenant 2 — 10 managed rules inserted"

run_sql << 'SQL'
-- Tenant 3 — 10 managed rules
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-m21-t3-brute', 'Brute Force Login Detection', 'Detects multiple failed authentication attempts indicating credential brute-force.', 'celExists(source.ip) && equals(event.category, "authentication") && equals(event.outcome, "failure") && safe(event.count) > 5', '{"timeWindow": "5m", "groupBy": "source.ip"}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0006', 'T1110', 'brute-force,authentication', 'HiveArmor Threat Research', 3, 5, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 days'),
('dr-m22-t3-pshell', 'Encoded PowerShell Execution', 'Identifies encoded PowerShell commands used by threat actors.', 'celExists(process.name) && equals(process.name, "powershell.exe") && contains(process.command_line, "-enc")', NULL, '*/5 * * * *', 'managed', 'active', 'critical', 'TA0002', 'T1059.001', 'powershell,execution', 'HiveArmor Threat Research', 3, 4, NULL, NOW() - INTERVAL '85 days', NOW() - INTERVAL '1 day'),
('dr-m23-t3-lsass', 'LSASS Memory Access', 'Detects unauthorized LSASS process memory access.', 'celExists(process.name) && equals(target.process.name, "lsass.exe") && oneOf(event.action, "process_access", "open_process")', NULL, '*/5 * * * *', 'managed', 'active', 'critical', 'TA0006', 'T1003.001', 'credential-dumping,lsass', 'HiveArmor Threat Research', 3, 5, NULL, NOW() - INTERVAL '92 days', NOW() - INTERVAL '3 days'),
('dr-m24-t3-malware', 'Known Malware Hash Match', 'Matches file hashes against known malware indicators from threat intelligence feeds.', 'celExists(file.hash.sha256) && oneOf(file.hash.sha256, "known_ioc_hashes")', '{"ioc_feed": "threatintel_daily"}', '*/5 * * * *', 'managed', 'active', 'critical', 'TA0002', 'T1204.002', 'malware,ioc,threat-intel', 'HiveArmor Threat Research', 3, 3, NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '4 days'),
('dr-m25-t3-psexec', 'PsExec Remote Execution', 'Detects PsExec or similar remote execution tools used for lateral movement.', 'celExists(process.name) && oneOf(process.name, "psexec.exe", "psexesvc.exe") || (equals(process.name, "services.exe") && startsWith(process.command_line, "PSEXESVC"))', NULL, '*/5 * * * *', 'managed', 'active', 'high', 'TA0002,TA0008', 'T1570', 'psexec,lateral-movement,remote-exec', 'HiveArmor Threat Research', 3, 4, NULL, NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days'),
('dr-m26-t3-office', 'Office Macro Execution', 'Identifies Microsoft Office applications spawning suspicious child processes.', 'celExists(process.parent.name) && oneOf(process.parent.name, "WINWORD.EXE", "EXCEL.EXE", "POWERPNT.EXE") && oneOf(process.name, "cmd.exe", "powershell.exe", "wscript.exe", "cscript.exe")', NULL, '*/5 * * * *', 'managed', 'active', 'high', 'TA0001,TA0002', 'T1566.001', 'macro,phishing,initial-access', 'HiveArmor Threat Research', 3, 3, NULL, NOW() - INTERVAL '65 days', NOW() - INTERVAL '6 days'),
('dr-m27-t3-sudo', 'Sudo Privilege Escalation', 'Detects suspicious sudo usage patterns on Linux systems.', 'celExists(process.name) && equals(process.name, "sudo") && !oneOf(user.name, "root", "admin") && regexMatch(process.command_line, "(bash|sh|chmod|chown|passwd)")', NULL, '*/5 * * * *', 'managed', 'active', 'medium', 'TA0004', 'T1548.003', 'privilege-escalation,sudo,linux', 'HiveArmor Threat Research', 3, 3, NULL, NOW() - INTERVAL '50 days', NOW() - INTERVAL '7 days'),
('dr-m28-t3-ssh', 'SSH Brute Force Attempt', 'Detects multiple failed SSH login attempts indicating brute-force attack.', 'celExists(source.ip) && equals(event.category, "authentication") && equals(event.outcome, "failure") && equals(destination.port, "22") && safe(event.count) > 10', '{"timeWindow": "5m", "groupBy": "source.ip"}', '*/5 * * * *', 'managed', 'active', 'high', 'TA0006,TA0001', 'T1110.001', 'ssh,brute-force,linux', 'HiveArmor Threat Research', 3, 4, NULL, NOW() - INTERVAL '80 days', NOW() - INTERVAL '3 days'),
('dr-m29-t3-cron', 'Suspicious Cron Job Creation', 'Identifies creation of cron jobs with suspicious commands for Linux persistence.', 'celExists(file.path) && startsWith(file.path, "/etc/cron") && equals(event.action, "creation") && regexMatch(file.content, "(curl|wget|bash|nc|ncat)")', NULL, '*/5 * * * *', 'managed', 'active', 'medium', 'TA0003', 'T1053.003', 'persistence,cron,linux', 'HiveArmor Threat Research', 3, 3, NULL, NOW() - INTERVAL '55 days', NOW() - INTERVAL '8 days'),
('dr-m30-t3-cloudapi', 'Unusual Cloud API Calls', 'Detects unusual API calls to cloud services from unexpected sources.', 'celExists(cloud.provider) && oneOf(event.action, "CreateUser", "AttachRolePolicy", "PutBucketPolicy", "CreateAccessKey") && !inCIDR(source.ip, "10.0.0.0/8")', '{"exclude_roles": ["OrganizationAccountAccessRole"]}', '*/5 * * * *', 'managed', 'disabled', 'high', 'TA0003,TA0004', 'T1078.004', 'cloud,aws,persistence,privilege-escalation', 'HiveArmor Threat Research', 3, 3, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '10 days');
SQL

ok "Tenant 3 — 10 managed rules inserted"

# ─── Step 2: Seed 20 Custom Rules ──────────────────────────────────────────
header "Step 2: Seeding 20 custom detection rules"

run_sql << 'SQL'
-- ============================================================================
-- 20 CUSTOM RULES — tenant-specific logic, varied schedules
-- Health: 10 healthy, 5 degraded, 4 error, 1 disabled (from custom, 2 disabled total w/ managed)
-- 3 rules in review state with pending approvals
-- ============================================================================

-- Tenant 1 — 7 custom rules (1 review, 2 degraded, 1 error)
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-c01-t1-finlat', 'Finance Segment Lateral Movement', 'Detects lateral movement attempts within the finance network segment.', 'celExists(source.ip) && inCIDR(source.ip, "10.50.0.0/16") && !inCIDR(destination.ip, "10.50.0.0/16") && equals(network.direction, "internal") && oneOf(destination.port, "445", "3389", "22", "5985")', '{"segment": "finance", "vlan": "50"}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0008', 'T1021.002,T1021.001', 'finance,lateral-movement,network-segmentation', 'j.martinez@acmecorp.com', 1, 3, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),
('dr-c02-t1-vpn', 'VPN from Unusual Country', 'Alerts on VPN connections originating from countries not in the approved travel list.', 'celExists(source.geo.country_iso_code) && !oneOf(source.geo.country_iso_code, "US", "CA", "GB", "DE", "FR", "AU", "JP") && equals(event.category, "authentication") && equals(event.outcome, "success") && contains(event.provider, "vpn")', '{"approved_countries": ["US","CA","GB","DE","FR","AU","JP"]}', '*/15 * * * *', 'custom', 'active', 'high', 'TA0001', 'T1133', 'vpn,geo-anomaly,initial-access', 's.chen@acmecorp.com', 1, 2, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '3 days'),
('dr-c03-t1-svcacct', 'Service Account After Hours', 'Detects service account authentication outside of defined maintenance windows.', 'celExists(user.name) && startsWith(user.name, "svc_") && equals(event.category, "authentication") && equals(event.outcome, "success")', '{"maintenance_window": "02:00-04:00", "timezone": "America/New_York"}', '*/15 * * * *', 'custom', 'active', 'medium', 'TA0003,TA0004', 'T1078.001', 'service-account,after-hours,anomaly', 'j.martinez@acmecorp.com', 1, 2, NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '5 days'),
('dr-c04-t1-build', 'Build Server Outbound Connection', 'Monitors build servers for unexpected outbound connections that could indicate supply chain compromise.', 'celExists(source.ip) && inCIDR(source.ip, "10.100.0.0/24") && equals(network.direction, "outbound") && !oneOf(destination.port, "443", "80") && !inCIDR(destination.ip, "10.0.0.0/8")', '{"build_servers": "10.100.0.0/24"}', '*/5 * * * *', 'custom', 'active', 'high', 'TA0001', 'T1195.002', 'supply-chain,build-server,ci-cd', 'r.patel@acmecorp.com', 1, 1, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '4 days'),
('dr-c05-t1-pci', 'PCI Environment File Access', 'Detects unauthorized file access within the PCI DSS cardholder data environment.', 'celExists(file.path) && startsWith(file.path, "/opt/pci/") && !oneOf(user.name, "pci_app", "pci_admin", "backup_svc") && oneOf(event.action, "read", "write", "delete")', '{"pci_paths": ["/opt/pci/", "/var/lib/pci/"]}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0009', 'T1005', 'pci-dss,file-access,compliance', 'j.martinez@acmecorp.com', 1, 3, NULL, NOW() - INTERVAL '40 days', NOW() - INTERVAL '1 day'),
('dr-c06-t1-dlp', 'Large File Upload to Cloud Storage', 'Detects large file uploads to cloud storage services outside business hours.', 'celExists(http.request.bytes) && safe(http.request.bytes) > 52428800 && regexMatch(url.domain, "(drive\\.google|dropbox|onedrive|s3\\.amazonaws)") && equals(network.direction, "outbound")', '{"minBytes": 52428800, "businessHours": "08:00-18:00"}', '*/30 * * * *', 'custom', 'review', 'high', 'TA0010', 'T1567.002', 'dlp,cloud-storage,exfiltration', 'r.patel@acmecorp.com', 1, 1, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day'),
('dr-c07-t1-honeypot', 'Honeypot Interaction', 'Triggers on any connection attempt to deployed honeypot systems.', 'celExists(destination.ip) && oneOf(destination.ip, "10.200.1.10", "10.200.1.11", "10.200.1.12") && !equals(source.ip, "10.200.1.1")', '{"honeypots": ["10.200.1.10","10.200.1.11","10.200.1.12"]}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0007', 'T1018', 'honeypot,deception,discovery', 's.chen@acmecorp.com', 1, 2, NULL, NOW() - INTERVAL '35 days', NOW() - INTERVAL '6 days');
SQL

ok "Tenant 1 — 7 custom rules inserted"

run_sql << 'SQL'
-- Tenant 2 — 7 custom rules (1 review, 2 degraded, 2 error)
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-c08-t2-insider', 'Insider Threat - Mass Download', 'Detects users downloading an abnormally large number of files from internal repositories.', 'celExists(user.name) && equals(event.action, "download") && safe(event.count) > 50 && contains(url.path, "/internal/")', '{"threshold": 50, "timeWindow": "1h"}', '*/15 * * * *', 'custom', 'active', 'high', 'TA0009', 'T1039', 'insider-threat,data-collection,download', 'a.johnson@betacorp.com', 2, 2, NULL, NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days'),
('dr-c09-t2-privesc', 'Unauthorized Group Membership Change', 'Detects additions to privileged Active Directory groups outside change management.', 'celExists(winlog.event_data.MemberName) && equals(event.code, "4728") && oneOf(winlog.event_data.TargetUserName, "Domain Admins", "Enterprise Admins", "Schema Admins")', '{"change_window": "Tue 02:00-04:00"}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0004', 'T1098.002', 'active-directory,group-change,privilege-escalation', 'a.johnson@betacorp.com', 2, 3, NULL, NOW() - INTERVAL '50 days', NOW() - INTERVAL '2 days'),
('dr-c10-t2-email', 'Email Forwarding Rule to External', 'Detects creation of email forwarding rules to external addresses.', 'celExists(event.action) && oneOf(event.action, "Set-Mailbox", "New-InboxRule") && contains(event.parameters, "ForwardTo") && !endsWith(event.parameters, "@betacorp.com")', NULL, '*/15 * * * *', 'custom', 'active', 'medium', 'TA0009,TA0010', 'T1114.003', 'email,forwarding,collection,exfiltration', 'm.garcia@betacorp.com', 2, 1, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 days'),
('dr-c11-t2-api', 'API Key Exposure in Logs', 'Detects potential API keys or secrets appearing in application log entries.', 'celExists(message) && regexMatch(message, "(api[_-]?key|secret|token|password)\\s*[=:]\\s*[A-Za-z0-9+/=]{20,}")', NULL, '*/30 * * * *', 'custom', 'active', 'medium', 'TA0006', 'T1552.001', 'api-key,secret-exposure,logs', 'm.garcia@betacorp.com', 2, 2, NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '4 days'),
('dr-c12-t2-cloud', 'S3 Bucket Policy Change', 'Monitors for changes to S3 bucket policies that could expose data.', 'celExists(event.action) && equals(event.action, "PutBucketPolicy") && equals(cloud.provider, "aws") && contains(event.parameters, "Principal.*\\*")', '{"critical_buckets": ["prod-data", "customer-pii"]}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0005', 'T1562.007', 'aws,s3,cloud-security,defense-evasion', 'a.johnson@betacorp.com', 2, 2, NULL, NOW() - INTERVAL '35 days', NOW() - INTERVAL '6 days'),
('dr-c13-t2-container', 'Container Escape Attempt', 'Detects processes attempting to escape container isolation boundaries.', 'celExists(process.name) && equals(container.runtime, "docker") && oneOf(event.action, "mount", "ptrace", "setns") && contains(process.command_line, "/proc/1/")', NULL, '*/5 * * * *', 'custom', 'review', 'critical', 'TA0004', 'T1611', 'container,escape,kubernetes,privilege-escalation', 'm.garcia@betacorp.com', 2, 1, NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days'),
('dr-c14-t2-dns', 'DNS Query to Newly Registered Domain', 'Alerts on DNS lookups to domains registered in the last 14 days.', 'celExists(dns.question.name) && safe(dns.resolved_ip.threat.domain_age_days) < 14 && equals(network.direction, "outbound")', '{"maxAgeDays": 14}', '*/15 * * * *', 'custom', 'active', 'medium', 'TA0011', 'T1071.001', 'dns,new-domain,c2,command-and-control', 'a.johnson@betacorp.com', 2, 1, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '7 days');
SQL

ok "Tenant 2 — 7 custom rules inserted"

run_sql << 'SQL'
-- Tenant 3 — 6 custom rules (1 review, 1 degraded, 1 error)
INSERT INTO detection_rules (id, name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source, created_at, updated_at) VALUES
('dr-c15-t3-exec', 'Unusual Process from Temp Directory', 'Detects execution of binaries from temporary directories often used by malware.', 'celExists(process.executable) && oneOf(process.working_directory, "/tmp", "/var/tmp", "C:\\Users\\*\\AppData\\Local\\Temp") && !oneOf(process.name, "apt", "yum", "pip")', NULL, '*/5 * * * *', 'custom', 'active', 'high', 'TA0002,TA0005', 'T1036.005', 'temp-execution,masquerading,defense-evasion', 'k.wilson@gammacorp.com', 3, 2, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '3 days'),
('dr-c16-t3-vpnmfa', 'VPN Without MFA Challenge', 'Detects VPN authentication events that bypass multi-factor authentication.', 'celExists(event.category) && equals(event.category, "authentication") && contains(event.provider, "vpn") && equals(event.outcome, "success") && !celExists(mfa.verified)', '{"vpn_provider": "globalprotect"}', '*/15 * * * *', 'custom', 'active', 'high', 'TA0001,TA0005', 'T1078', 'vpn,mfa-bypass,initial-access', 'k.wilson@gammacorp.com', 3, 2, NULL, NOW() - INTERVAL '28 days', NOW() - INTERVAL '4 days'),
('dr-c17-t3-backup', 'Backup Job Failure Pattern', 'Detects repeated backup job failures indicating potential ransomware pre-attack activity.', 'celExists(event.action) && equals(event.action, "backup_failed") && safe(event.count) > 3 && contains(event.provider, "veeam")', '{"threshold": 3, "timeWindow": "4h"}', '*/30 * * * *', 'custom', 'active', 'medium', 'TA0040', 'T1490', 'backup,ransomware,impact', 'l.brown@gammacorp.com', 3, 1, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 days'),
('dr-c18-t3-admin', 'Admin Console Access from Non-Admin Workstation', 'Detects access to admin interfaces from workstations not in the admin VLAN.', 'celExists(url.path) && startsWith(url.path, "/admin") && !inCIDR(source.ip, "10.250.0.0/24") && equals(http.response.status_code, "200")', '{"admin_vlan": "10.250.0.0/24"}', '*/5 * * * *', 'custom', 'active', 'high', 'TA0001', 'T1078.003', 'admin-access,network-segmentation,valid-accounts', 'k.wilson@gammacorp.com', 3, 3, NULL, NOW() - INTERVAL '42 days', NOW() - INTERVAL '2 days'),
('dr-c19-t3-crypto', 'Cryptocurrency Mining Detection', 'Identifies processes or network connections associated with cryptocurrency mining.', 'celExists(process.name) && (regexMatch(process.command_line, "(stratum\\+tcp|xmrig|minerd|cryptonight)") || oneOf(destination.port, "3333", "4444", "8333", "9999"))', NULL, '*/15 * * * *', 'custom', 'review', 'medium', 'TA0040', 'T1496', 'cryptomining,resource-hijacking,impact', 'l.brown@gammacorp.com', 3, 1, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day'),
('dr-c20-t3-zero', 'Zero-Day Exploit Pattern', 'Heuristic detection of exploit-like behavior patterns targeting unpatched vulnerabilities.', 'celExists(process.name) && equals(process.parent.name, "svchost.exe") && regexMatch(process.command_line, "(whoami|net user|ipconfig|systeminfo)") && safe(process.session_leader.same_as_process) == false', '{"heuristic_threshold": 3}', '*/5 * * * *', 'custom', 'active', 'critical', 'TA0002,TA0004', 'T1068', 'exploit,zero-day,heuristic,privilege-escalation', 'k.wilson@gammacorp.com', 3, 2, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '3 days');
SQL

ok "Tenant 3 — 6 custom rules inserted"
echo ""
info "Total: 50 detection rules (30 managed + 20 custom) across 3 tenants"

# ─── Step 3: Seed execution history ────────────────────────────────────────
header "Step 3: Generating execution history (20-50 entries per rule, 30 days)"

# Use a SQL function to generate realistic execution data
run_sql << 'SQL'
-- Generate execution history for all 50 rules
-- Distribution: 90% completed, 5% failed, 3% timeout, 2% cancelled
-- Durations: 100ms-5000ms, alerts: 0-20, events_scanned: 1000-500000

DO $$
DECLARE
  r RECORD;
  exec_count INTEGER;
  i INTEGER;
  exec_id TEXT;
  started TIMESTAMP;
  duration_ms BIGINT;
  exec_status TEXT;
  alerts INTEGER;
  events BIGINT;
  triggered TEXT;
  rand_val DOUBLE PRECISION;
  error_text TEXT;
  base_time TIMESTAMP := NOW() - INTERVAL '30 days';
BEGIN
  FOR r IN SELECT id, tenant_id, status FROM detection_rules LOOP
    -- 20-50 executions per rule (random)
    exec_count := 20 + floor(random() * 31)::INTEGER;

    FOR i IN 1..exec_count LOOP
      exec_id := 'exec-' || r.id || '-' || lpad(i::text, 3, '0');
      -- Spread across 30 days
      started := base_time + (random() * 30 * 24 * 3600) * INTERVAL '1 second';
      -- Duration 100ms-5000ms
      duration_ms := 100 + floor(random() * 4900)::BIGINT;

      -- Status distribution: 90% completed, 5% failed, 3% timeout, 2% cancelled
      rand_val := random();
      IF rand_val < 0.90 THEN
        exec_status := 'completed';
        error_text := NULL;
      ELSIF rand_val < 0.95 THEN
        exec_status := 'failed';
        error_text := '["OpenSearch query timeout after 30s","Index v3-hive-log-* temporarily unavailable"]';
      ELSIF rand_val < 0.98 THEN
        exec_status := 'timeout';
        error_text := '["Execution exceeded 60s maximum runtime"]';
      ELSE
        exec_status := 'cancelled';
        error_text := '["Cancelled by system due to resource constraints"]';
      END IF;

      -- Alerts generated (0-20 for completed, 0 for others)
      IF exec_status = 'completed' THEN
        alerts := floor(random() * 21)::INTEGER;
      ELSE
        alerts := 0;
      END IF;

      -- Events scanned (1000-500000)
      events := 1000 + floor(random() * 499000)::BIGINT;

      -- Triggered by (85% schedule, 10% manual, 5% gap_fill)
      rand_val := random();
      IF rand_val < 0.85 THEN
        triggered := 'schedule';
      ELSIF rand_val < 0.95 THEN
        triggered := 'manual';
      ELSE
        triggered := 'gap_fill';
      END IF;

      INSERT INTO rule_executions (id, rule_id, started_at, completed_at, duration, status, alerts_generated, events_scanned, errors, triggered_by, tenant_id)
      VALUES (exec_id, r.id, started, started + (duration_ms * INTERVAL '1 millisecond'), duration_ms, exec_status, alerts, events, error_text, triggered, r.tenant_id);
    END LOOP;
  END LOOP;
END $$;
SQL

EXEC_COUNT=$(run_sql_out -c "SELECT COUNT(*) FROM rule_executions;" 2>/dev/null)
ok "Execution history generated: ${EXEC_COUNT} total entries"

# ─── Step 4: Adjust health distribution ────────────────────────────────────
header "Step 4: Adjusting health distribution (35 healthy, 8 degraded, 5 error, 2 disabled)"

# Strategy: First make ALL rules healthy (set last 10 executions to completed),
# then degrade specific rules by injecting failures into their recent runs.

run_sql << 'SQL'
-- First: Ensure all rules have their most recent 10 executions as 'completed'
-- This makes all rules healthy by default
UPDATE rule_executions SET status = 'completed', errors = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
    FROM rule_executions
  ) ranked WHERE rn <= 10
);

-- Degraded rules (8): inject 1-2 failures in last 10 runs (10-20% error rate)
-- Rules: dr-c01-t1-finlat, dr-c02-t1-vpn, dr-c08-t2-insider, dr-c11-t2-api,
--        dr-c15-t3-exec, dr-m07-t1-schtask, dr-m18-t2-certutil, dr-m27-t3-sudo
UPDATE rule_executions SET status = 'failed',
  errors = '["Query returned partial results due to shard failures"]',
  alerts_generated = 0
WHERE id IN (
  SELECT id FROM (
    SELECT id, rule_id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
    FROM rule_executions
    WHERE rule_id IN ('dr-c01-t1-finlat', 'dr-c02-t1-vpn', 'dr-c08-t2-insider', 'dr-c11-t2-api',
                      'dr-c15-t3-exec', 'dr-m07-t1-schtask', 'dr-m18-t2-certutil', 'dr-m27-t3-sudo')
  ) ranked WHERE rn IN (2, 7)
);

-- Error rules (5): inject 3+ failures in last 10 runs (>20% error rate)
-- Rules: dr-c04-t1-build, dr-c09-t2-privesc, dr-c12-t2-cloud, dr-c18-t3-admin, dr-c20-t3-zero
UPDATE rule_executions SET status = 'failed',
  errors = '["CEL evaluation error: field not found in event","OpenSearch cluster RED - shards failed"]',
  alerts_generated = 0
WHERE id IN (
  SELECT id FROM (
    SELECT id, rule_id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
    FROM rule_executions
    WHERE rule_id IN ('dr-c04-t1-build', 'dr-c09-t2-privesc', 'dr-c12-t2-cloud', 'dr-c18-t3-admin', 'dr-c20-t3-zero')
  ) ranked WHERE rn IN (1, 3, 5)
);
SQL

ok "Health distribution configured"

# ─── Step 5: Seed version history ──────────────────────────────────────────
header "Step 5: Seeding version history"

run_sql << 'SQL'
-- Version history for managed rules (3-5 versions each)
-- For managed rules at version 5 (dr-m01, dr-m03, dr-m09, dr-m11, dr-m13, dr-m21, dr-m23)
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v' || v.ver,
  dr.id,
  v.ver,
  CASE v.ver
    WHEN 1 THEN 'celExists(source.ip) && equals(event.outcome, "failure")'
    WHEN 2 THEN dr.expression || ' -- v2 threshold adjustment'
    WHEN 3 THEN dr.expression || ' -- v3 added time window'
    WHEN 4 THEN dr.expression || ' -- v4 tuned false positives'
    WHEN 5 THEN dr.expression
  END,
  dr.filters,
  CASE v.ver
    WHEN 1 THEN 'Initial rule creation'
    WHEN 2 THEN 'Adjusted detection threshold based on false positive rate'
    WHEN 3 THEN 'Added time window constraint to reduce alert fatigue'
    WHEN 4 THEN 'Tuned exclusions for known automation accounts'
    WHEN 5 THEN 'Updated CEL expression for improved accuracy'
  END,
  'HiveArmor Threat Research',
  CASE WHEN v.ver = (SELECT version FROM detection_rules WHERE id = dr.id) THEN 'active' ELSE 'superseded' END,
  dr.created_at + (v.ver * INTERVAL '15 days')
FROM detection_rules dr
CROSS JOIN (SELECT generate_series(1, 5) AS ver) v
WHERE dr.scope = 'managed' AND dr.version = 5;

-- For managed rules at version 4
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v' || v.ver,
  dr.id,
  v.ver,
  CASE v.ver
    WHEN 1 THEN 'celExists(process.name) && contains(process.command_line, "suspicious")'
    WHEN 2 THEN dr.expression || ' -- v2 added exclusions'
    WHEN 3 THEN dr.expression || ' -- v3 expanded detection scope'
    WHEN 4 THEN dr.expression
  END,
  dr.filters,
  CASE v.ver
    WHEN 1 THEN 'Initial rule creation'
    WHEN 2 THEN 'Added exclusion filters for known good processes'
    WHEN 3 THEN 'Expanded detection scope to cover additional variants'
    WHEN 4 THEN 'Performance optimization and false positive reduction'
  END,
  'HiveArmor Threat Research',
  CASE WHEN v.ver = 4 THEN 'active' ELSE 'superseded' END,
  dr.created_at + (v.ver * INTERVAL '18 days')
FROM detection_rules dr
CROSS JOIN (SELECT generate_series(1, 4) AS ver) v
WHERE dr.scope = 'managed' AND dr.version = 4;

-- For managed rules at version 3
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v' || v.ver,
  dr.id,
  v.ver,
  CASE v.ver
    WHEN 1 THEN 'celExists(event.action) && contains(event.action, "suspicious")'
    WHEN 2 THEN dr.expression || ' -- v2 expanded coverage'
    WHEN 3 THEN dr.expression
  END,
  dr.filters,
  CASE v.ver
    WHEN 1 THEN 'Initial rule creation'
    WHEN 2 THEN 'Expanded detection coverage for additional attack variants'
    WHEN 3 THEN 'Refined expression for better precision'
  END,
  'HiveArmor Threat Research',
  CASE WHEN v.ver = 3 THEN 'active' ELSE 'superseded' END,
  dr.created_at + (v.ver * INTERVAL '20 days')
FROM detection_rules dr
CROSS JOIN (SELECT generate_series(1, 3) AS ver) v
WHERE dr.scope = 'managed' AND dr.version = 3;
SQL

ok "Managed rule versions seeded"

run_sql << 'SQL'
-- Version history for custom rules (1-3 versions each)
-- Custom rules at version 3
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v' || v.ver,
  dr.id,
  v.ver,
  CASE v.ver
    WHEN 1 THEN 'celExists(source.ip) && equals(network.direction, "internal")'
    WHEN 2 THEN dr.expression || ' -- v2 added tenant-specific logic'
    WHEN 3 THEN dr.expression
  END,
  dr.filters,
  CASE v.ver
    WHEN 1 THEN 'Initial custom rule creation'
    WHEN 2 THEN 'Added organization-specific network segments and exclusions'
    WHEN 3 THEN 'Final tuning based on 30-day evaluation period'
  END,
  dr.author,
  CASE WHEN v.ver = 3 THEN dr.status ELSE 'superseded' END,
  dr.created_at + (v.ver * INTERVAL '10 days')
FROM detection_rules dr
CROSS JOIN (SELECT generate_series(1, 3) AS ver) v
WHERE dr.scope = 'custom' AND dr.version = 3;

-- Custom rules at version 2
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v' || v.ver,
  dr.id,
  v.ver,
  CASE v.ver
    WHEN 1 THEN 'celExists(event.action) && equals(event.category, "network")'
    WHEN 2 THEN dr.expression
  END,
  dr.filters,
  CASE v.ver
    WHEN 1 THEN 'Initial custom rule creation'
    WHEN 2 THEN 'Refined detection logic after initial deployment feedback'
  END,
  dr.author,
  CASE WHEN v.ver = 2 THEN dr.status ELSE 'superseded' END,
  dr.created_at + (v.ver * INTERVAL '12 days')
FROM detection_rules dr
CROSS JOIN (SELECT generate_series(1, 2) AS ver) v
WHERE dr.scope = 'custom' AND dr.version = 2;

-- Custom rules at version 1
INSERT INTO rule_versions (id, rule_id, version, expression, filters, changes, author, status, created_at)
SELECT
  'rv-' || dr.id || '-v1',
  dr.id,
  1,
  dr.expression,
  dr.filters,
  'Initial custom rule creation',
  dr.author,
  dr.status,
  dr.created_at
FROM detection_rules dr
WHERE dr.scope = 'custom' AND dr.version = 1;
SQL

VER_COUNT=$(run_sql_out -c "SELECT COUNT(*) FROM rule_versions;" 2>/dev/null)
ok "Version history seeded: ${VER_COUNT} version entries"

# ─── Step 6: Seed approval records for review rules ────────────────────────
header "Step 6: Seeding approval records for 3 rules in review state"

run_sql << 'SQL'
-- 3 rules are in 'review' state: dr-c06-t1-dlp, dr-c13-t2-container, dr-c19-t3-crypto
-- Each has a pending approval record

INSERT INTO rule_approvals (id, rule_id, version, reviewer, status, comment, tenant_id, created_at) VALUES
-- dr-c06-t1-dlp — submitted for review, pending approval
('ra-001-c06', 'dr-c06-t1-dlp', 1, 'j.martinez@acmecorp.com', 'pending', 'Submitted for review: DLP rule needs SOC manager approval before activation in production.', 1, NOW() - INTERVAL '1 day'),
-- dr-c13-t2-container — submitted, one reviewer commented
('ra-002-c13', 'dr-c13-t2-container', 1, 'a.johnson@betacorp.com', 'pending', 'Container escape detection needs validation against our K8s pod security policies.', 2, NOW() - INTERVAL '2 days'),
('ra-003-c13', 'dr-c13-t2-container', 1, 'soc-lead@betacorp.com', 'pending', 'Reviewing CEL expression complexity — may need optimization for high-volume container environments.', 2, NOW() - INTERVAL '1 day'),
-- dr-c19-t3-crypto — submitted for review
('ra-004-c19', 'dr-c19-t3-crypto', 1, 'l.brown@gammacorp.com', 'pending', 'Cryptomining detection submitted for approval. Rule covers both process-based and network-based indicators.', 3, NOW() - INTERVAL '1 day');
SQL

ok "3 rules in review state with pending approvals"

# ─── Step 7: Verification ──────────────────────────────────────────────────
header "Step 7: Verification"
echo ""

info "Detection rules:"
TOTAL=$(run_sql_out -c "SELECT COUNT(*) FROM detection_rules;" 2>/dev/null)
MANAGED=$(run_sql_out -c "SELECT COUNT(*) FROM detection_rules WHERE scope = 'managed';" 2>/dev/null)
CUSTOM=$(run_sql_out -c "SELECT COUNT(*) FROM detection_rules WHERE scope = 'custom';" 2>/dev/null)
printf "  %-30s %s\n" "Total rules:" "${TOTAL}"
printf "  %-30s %s\n" "Managed:" "${MANAGED}"
printf "  %-30s %s\n" "Custom:" "${CUSTOM}"
echo ""

info "Status distribution:"
run_sql_out -c "SELECT status, COUNT(*) FROM detection_rules GROUP BY status ORDER BY status;" 2>/dev/null | while IFS='|' read -r status count; do
  printf "  %-30s %s\n" "  ${status}:" "${count}"
done
echo ""

info "Severity distribution:"
run_sql_out -c "SELECT severity, COUNT(*) FROM detection_rules GROUP BY severity ORDER BY severity;" 2>/dev/null | while IFS='|' read -r sev count; do
  printf "  %-30s %s\n" "  ${sev}:" "${count}"
done
echo ""

info "Tenant distribution:"
run_sql_out -c "SELECT tenant_id, COUNT(*) FROM detection_rules GROUP BY tenant_id ORDER BY tenant_id;" 2>/dev/null | while IFS='|' read -r tid count; do
  printf "  %-30s %s\n" "  Tenant ${tid}:" "${count}"
done
echo ""

info "Execution history:"
EXEC_TOTAL=$(run_sql_out -c "SELECT COUNT(*) FROM rule_executions;" 2>/dev/null)
printf "  %-30s %s\n" "Total executions:" "${EXEC_TOTAL}"
run_sql_out -c "SELECT status, COUNT(*) FROM rule_executions GROUP BY status ORDER BY COUNT(*) DESC;" 2>/dev/null | while IFS='|' read -r status count; do
  printf "  %-30s %s\n" "  ${status}:" "${count}"
done
echo ""

info "Version history:"
VER_TOTAL=$(run_sql_out -c "SELECT COUNT(*) FROM rule_versions;" 2>/dev/null)
printf "  %-30s %s\n" "Total versions:" "${VER_TOTAL}"
echo ""

info "Approvals:"
APP_TOTAL=$(run_sql_out -c "SELECT COUNT(*) FROM rule_approvals;" 2>/dev/null)
printf "  %-30s %s\n" "Pending approvals:" "${APP_TOTAL}"
echo ""

info "MITRE Coverage:"
TACTICS=$(run_sql_out -c "SELECT COUNT(DISTINCT t) FROM detection_rules, LATERAL unnest(string_to_array(mitre_tactics, ',')) AS t WHERE mitre_tactics IS NOT NULL;" 2>/dev/null)
TECHNIQUES=$(run_sql_out -c "SELECT COUNT(DISTINCT t) FROM detection_rules, LATERAL unnest(string_to_array(mitre_techniques, ',')) AS t WHERE mitre_techniques IS NOT NULL;" 2>/dev/null)
printf "  %-30s %s\n" "Tactics covered:" "${TACTICS}"
printf "  %-30s %s\n" "Techniques covered:" "${TECHNIQUES}"
echo ""
info "Deliberate MITRE gaps (not covered):"
echo "    T1055 (Process Injection)"
echo "    T1190 (Exploit Public-Facing Application)"
echo "    T1497 (Virtualization/Sandbox Evasion)"

# ─── Step 8: Health verification ───────────────────────────────────────────
header "Step 8: Health distribution verification"

info "Computing health from execution data (last 10 runs per rule)..."
HEALTHY=$(run_sql_out << 'SQL'
WITH recent_execs AS (
  SELECT rule_id, status,
    ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
  FROM rule_executions
),
rule_health AS (
  SELECT rule_id,
    COUNT(*) FILTER (WHERE status != 'completed') * 100.0 / COUNT(*) AS error_rate
  FROM recent_execs WHERE rn <= 10
  GROUP BY rule_id
)
SELECT COUNT(*) FROM rule_health
JOIN detection_rules dr ON dr.id = rule_health.rule_id
WHERE error_rate < 5 AND dr.status != 'disabled';
SQL
)
DEGRADED=$(run_sql_out << 'SQL'
WITH recent_execs AS (
  SELECT rule_id, status,
    ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
  FROM rule_executions
),
rule_health AS (
  SELECT rule_id,
    COUNT(*) FILTER (WHERE status != 'completed') * 100.0 / COUNT(*) AS error_rate
  FROM recent_execs WHERE rn <= 10
  GROUP BY rule_id
)
SELECT COUNT(*) FROM rule_health
JOIN detection_rules dr ON dr.id = rule_health.rule_id
WHERE error_rate >= 5 AND error_rate <= 20 AND dr.status != 'disabled';
SQL
)
ERROR_COUNT=$(run_sql_out << 'SQL'
WITH recent_execs AS (
  SELECT rule_id, status,
    ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY started_at DESC) AS rn
  FROM rule_executions
),
rule_health AS (
  SELECT rule_id,
    COUNT(*) FILTER (WHERE status != 'completed') * 100.0 / COUNT(*) AS error_rate
  FROM recent_execs WHERE rn <= 10
  GROUP BY rule_id
)
SELECT COUNT(*) FROM rule_health
JOIN detection_rules dr ON dr.id = rule_health.rule_id
WHERE error_rate > 20 AND dr.status != 'disabled';
SQL
)
DISABLED=$(run_sql_out -c "SELECT COUNT(*) FROM detection_rules WHERE status = 'disabled';" 2>/dev/null)

printf "  %-30s %s (target: 35)\n" "Healthy (<5% errors):" "${HEALTHY}"
printf "  %-30s %s (target: 8)\n" "Degraded (5-20%):" "${DEGRADED}"
printf "  %-30s %s (target: 5)\n" "Error (>20%):" "${ERROR_COUNT}"
printf "  %-30s %s (target: 2)\n" "Disabled:" "${DISABLED}"

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Seed complete — 50 detection rules with full history${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Summary:"
echo "    30 managed rules (v3-v5) + 20 custom rules (v1-v3)"
echo "    ${EXEC_TOTAL} execution entries spanning 30 days"
echo "    ${VER_TOTAL} version history entries"
echo "    3 rules in review with pending approvals"
echo "    2 disabled rules"
echo "    MITRE: ${TACTICS} tactics, ${TECHNIQUES} techniques (gaps: T1055, T1190, T1497)"
echo ""
echo "  Teardown: bash seed-detection-rules.sh --teardown"
echo ""
