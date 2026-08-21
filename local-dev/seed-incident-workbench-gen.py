#!/usr/bin/env python3
"""
Sprint 43 Incident Workbench — Data Generator

Generates:
  - seed.sql         → PostgreSQL inserts (incidents, tasks, activity, custody, entities)
  - evidence.ndjson  → OpenSearch bulk for v3-hive-evidence-<tenant>-*
  - alerts.ndjson    → OpenSearch bulk for v3-hive-alert-<tenant>-*

Usage: python3 seed-incident-workbench-gen.py <output_dir>
"""

import json, uuid, hashlib, random, os, sys
from datetime import datetime, timedelta, timezone

random.seed(2043)
NOW = datetime.now(timezone.utc)
TODAY_STR = NOW.strftime("%Y.%m.%d")

OUTPUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ha_iwb_seed"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── Constants ───────────────────────────────────────────────────────────────

ANALYSTS = ["maya.chen", "james.wilson", "priya.sharma", "carlos.rodriguez", "aisha.thompson"]
TASK_STATUSES = ["open", "in_progress", "completed", "blocked"]
TASK_PRIORITIES = ["critical", "high", "medium", "low"]
EVIDENCE_SOURCES = ["endpoint_agent", "opensearch", "manual_upload", "network_tap"]
EVIDENCE_CLASSES = ["unclassified", "internal", "confidential", "restricted"]
EVIDENCE_TYPES = ["pcap", "memory_dump", "disk_image", "log_export", "email", "screenshot", "binary_sample", "registry_hive"]
CUSTODY_ACTIONS = ["collected", "analyzed", "transferred", "archived", "exported"]
ACTIVITY_TYPES = ["note", "field_change", "task_completed", "response_action", "alert_linked", "evidence_added"]
ACTIVITY_WEIGHTS = [30, 25, 15, 10, 10, 10]

CHECKLIST_LABELS = [
    "Extract IOCs from memory dump", "Verify containment boundary",
    "Check backup integrity", "Notify affected business unit",
    "Review network traffic captures", "Analyze malware sample in sandbox",
    "Cross-reference with threat intel feeds", "Validate log source coverage",
    "Document timeline in case notes", "Escalate to CIRT lead if P1",
    "Collect volatile memory from affected host", "Review lateral movement indicators",
    "Check for persistence mechanisms", "Verify EDR coverage on affected endpoints",
    "Coordinate with legal team", "Reset compromised credentials",
    "Update firewall rules to block C2 IPs", "Scan for additional indicators",
    "Prepare executive briefing", "Verify no data exfiltration occurred",
]

ALERT_NAMES = [
    "Brute Force Authentication Attempt", "Suspicious PowerShell Encoded Command",
    "Lateral Movement via SMB", "C2 Beacon Communication Detected",
    "Data Exfiltration Large Outbound Transfer", "Privilege Escalation via Token",
    "Ransomware File Encryption Activity", "Credential Dumping via LSASS Access",
    "DNS Tunneling Communication", "Phishing Link Clicked",
]

ALERT_CATEGORIES = [
    "Credential Access", "Execution", "Lateral Movement", "Command and Control",
    "Exfiltration", "Privilege Escalation", "Impact", "Credential Access",
    "Command and Control", "Initial Access",
]

HOSTNAMES = [
    "FIN-WKS-044", "FIN-WKS-078", "FIN-SRV-005", "ENG-SRV-012", "ENG-WKS-031",
    "HR-LPT-007", "HR-DSK-015", "IT-SRV-001", "IT-WKS-099", "SEC-MON-002",
    "MKT-DSK-019", "DEV-WKS-007", "OPS-NAS-003", "DC-PROD-01", "MAIL-SRV-01",
]

USER_ENTITIES = [
    "sarah.chen", "admin-svc-01", "james.wilson", "priya.sharma",
    "backup-agent", "deploy-svc", "k.martinez", "l.thompson",
]

# Chain entities for similar incident discovery (INC-003)
CHAIN_A_IPS = ["10.1.5.44", "10.1.5.78", "10.1.5.102"]
CHAIN_A_RULE = "rule-smb-lateral-001"
CHAIN_B_DOMAINS = ["phish-portal.evil-cdn.net", "login-secure.fake-auth.com", "update-service.malware-cdn.xyz"]
CHAIN_B_HASHES = [
    "3a7f2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
    "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
]
CHAIN_C_USERS = ["sarah.chen", "admin-svc-01"]

# Incident definitions per tenant
# Format: (iwb_id, title, severity_int, status_enum, priority, tenant_prefix, tenant_id, chain)
# severity: 1=low, 2=medium, 3=high, 4=critical
# status: OPEN, IN_REVIEW, COMPLETED
# chain: None, "A", "B", "C"

INCIDENTS = [
    # ─── CWM Tenant (12 incidents) ───────────────────────────────────────────
    # 4 critical (active)
    ("IWB-CWM-001", "Ransomware Lateral Movement - Finance Segment", 4, "OPEN", "P1", "cwm", 3813, "A"),
    ("IWB-CWM-002", "Active C2 Beacon with Data Staging - Executive Hosts", 4, "OPEN", "P1", "cwm", 3813, "A"),
    ("IWB-CWM-003", "Credential Harvesting via Phishing Campaign", 4, "OPEN", "P1", "cwm", 3813, "B"),
    ("IWB-CWM-004", "Zero-Day Exploitation on Internet-Facing Server", 4, "OPEN", "P1", "cwm", 3813, None),
    # 3 high (active)
    ("IWB-CWM-005", "Insider Threat - Unauthorized Data Access", 3, "OPEN", "P2", "cwm", 3813, "C"),
    ("IWB-CWM-006", "Lateral SSH Movement Between Database Segments", 3, "OPEN", "P2", "cwm", 3813, "A"),
    ("IWB-CWM-007", "Brute Force Authentication Against VPN Gateway", 3, "IN_REVIEW", "P2", "cwm", 3813, None),
    # 3 medium (investigating)
    ("IWB-CWM-008", "Anomalous After-Hours Access Pattern - Finance Team", 2, "IN_REVIEW", "P3", "cwm", 3813, "B"),
    ("IWB-CWM-009", "Suspicious USB Device Connection on Classified System", 2, "IN_REVIEW", "P3", "cwm", 3813, None),
    ("IWB-CWM-010", "Multiple Failed MFA Challenges - Service Account", 2, "IN_REVIEW", "P3", "cwm", 3813, "C"),
    # 2 low (closed)
    ("IWB-CWM-011", "Policy Violation - Unapproved Cloud Storage Usage", 1, "COMPLETED", "P4", "cwm", 3813, None),
    ("IWB-CWM-012", "Expired Certificate on Internal Service", 1, "COMPLETED", "P4", "cwm", 3813, None),

    # ─── Workmates1 Tenant (10 incidents) ────────────────────────────────────
    # 2 critical
    ("IWB-WM1-001", "Cryptominer Deployment on Build Servers", 4, "OPEN", "P1", "workmates1", 3812, "B"),
    ("IWB-WM1-002", "Data Exfiltration to External FTP", 4, "IN_REVIEW", "P1", "workmates1", 3812, None),
    # 3 high
    ("IWB-WM1-003", "DLL Sideloading on Development Workstations", 3, "OPEN", "P2", "workmates1", 3812, "B"),
    ("IWB-WM1-004", "Suspicious DNS Tunneling Activity Detected", 3, "IN_REVIEW", "P2", "workmates1", 3812, "C"),
    ("IWB-WM1-005", "Credential Stuffing Attack on Customer Portal", 3, "OPEN", "P2", "workmates1", 3812, None),
    # 3 medium
    ("IWB-WM1-006", "Outbound Traffic to Newly Registered Domain", 2, "IN_REVIEW", "P3", "workmates1", 3812, "B"),
    ("IWB-WM1-007", "Web Application SQL Injection Probing", 2, "OPEN", "P3", "workmates1", 3812, None),
    ("IWB-WM1-008", "Unauthorized Scheduled Task Creation", 2, "IN_REVIEW", "P3", "workmates1", 3812, None),
    # 2 low
    ("IWB-WM1-009", "Low-Confidence Threat Intel Match - Domain", 1, "COMPLETED", "P4", "workmates1", 3812, None),
    ("IWB-WM1-010", "Non-Critical Patch Missing on Endpoint Group", 1, "COMPLETED", "P4", "workmates1", 3812, None),

    # ─── Workmates2 Tenant (8 incidents) ─────────────────────────────────────
    # 2 critical
    ("IWB-WM2-001", "APT-29 Attributed Infrastructure Communication", 4, "OPEN", "P1", "workmates2", 3814, "A"),
    ("IWB-WM2-002", "Supply Chain Compromise - Build Pipeline", 4, "IN_REVIEW", "P1", "workmates2", 3814, None),
    # 2 high
    ("IWB-WM2-003", "Malicious PowerShell Execution via Macro", 3, "OPEN", "P2", "workmates2", 3814, "C"),
    ("IWB-WM2-004", "Unauthorized Remote Desktop from External IP", 3, "IN_REVIEW", "P2", "workmates2", 3814, None),
    # 2 medium
    ("IWB-WM2-005", "Suspicious Registry Modification Detected", 2, "OPEN", "P3", "workmates2", 3814, None),
    ("IWB-WM2-006", "Unpatched System Vulnerability Exploitation", 2, "IN_REVIEW", "P3", "workmates2", 3814, None),
    # 2 low
    ("IWB-WM2-007", "Policy Violation - Shadow IT SaaS Usage", 1, "COMPLETED", "P4", "workmates2", 3814, None),
    ("IWB-WM2-008", "Expired Service Account Password Alert", 1, "COMPLETED", "P4", "workmates2", 3814, None),
]

# ─── Utility functions ───────────────────────────────────────────────────────

def uid():
    return str(uuid.uuid4())

def sha256_hash():
    return hashlib.sha256(uuid.uuid4().bytes).hexdigest()

def ts_offset(seconds):
    return (NOW - timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def ts_pg(seconds):
    return (NOW - timedelta(seconds=seconds)).strftime("%Y-%m-%d %H:%M:%S")

def esc(s):
    """Escape single quotes for PostgreSQL."""
    return s.replace("'", "''")

def pick_weighted(items, weights):
    return random.choices(items, weights=weights, k=1)[0]

# ─── Generate SQL and NDJSON ─────────────────────────────────────────────────

sql_lines = []
evidence_lines = []
alert_lines = []
incident_lines = []  # OpenSearch incident documents for v3-hive-incident-*

sql_lines.append("-- Sprint 43 Incident Workbench Seed Data")
sql_lines.append("-- Generated by seed-incident-workbench-gen.py")
sql_lines.append("BEGIN;")
sql_lines.append("")

# Track PG IDs for entity linking (we use a sequence variable)
incident_pg_ids = {}  # iwb_id -> will be populated at runtime via RETURNING

# We'll use a CTE approach: insert incidents and capture IDs
# But since we need the IDs for entity links, let's use a simpler approach
# with explicit ID assignment via a subquery

sql_lines.append("-- ─── Incidents ───────────────────────────────────────────────────────────")
sql_lines.append("")

SEV_LABELS = {1: "low", 2: "medium", 3: "high", 4: "critical"}
STATUS_MAP = {"OPEN": "open", "IN_REVIEW": "in_review", "COMPLETED": "completed"}

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    days_ago = random.randint(1, 30)
    created_offset = days_ago * 86400 + random.randint(0, 43200)
    assignee = random.choice(ANALYSTS)
    incident_name = f"{iwb_id}: {title}"
    chain_label = chain or "none"
    description = f"Automated seed incident for Sprint 43 workbench testing. Tenant: {tenant}. Chain: {chain_label}."

    sql_lines.append(
        f"INSERT INTO hive_incident (incident_name, incident_description, incident_status, "
        f"incident_severity, incident_created_date, incident_assigned_to, incident_priority, "
        f"sla_breached) "
        f"SELECT '{esc(incident_name)}', '{esc(description)}', '{status}', {severity}, "
        f"'{ts_pg(created_offset)}', '{assignee}', '{priority}', false "
        f"WHERE NOT EXISTS (SELECT 1 FROM hive_incident WHERE incident_name = '{esc(incident_name)}');"
    )
    sql_lines.append("")

    # OpenSearch incident document for PATCH endpoint (INC-001)
    incident_index = f"v3-hive-incident-{tenant}-{TODAY_STR}"
    inc_doc = {
        "id": iwb_id,
        "title": title,
        "description": description,
        "severity": SEV_LABELS.get(severity, "medium"),
        "status": STATUS_MAP.get(status, "open"),
        "priority": priority,
        "assignee": assignee,
        "createdAt": ts_offset(created_offset),
        "createdBy": "seed-script",
        "tenantId": tenant_id,
        "visibleBy": tenant,
        "version": 1,
        "tags": ["workbench-seed", f"chain-{chain_label}"],
    }
    incident_lines.append(json.dumps({"index": {"_index": incident_index, "_id": iwb_id}}))
    incident_lines.append(json.dumps(inc_doc))

# ─── Tasks per incident ──────────────────────────────────────────────────────

sql_lines.append("")
sql_lines.append("-- ─── Incident Tasks ─────────────────────────────────────────────────────")
sql_lines.append("")

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    num_tasks = random.randint(3, 8)

    for t in range(num_tasks):
        task_id = uid()
        task_title = random.choice([
            "Analyze C2 traffic patterns", "Isolate affected endpoint",
            "Collect memory dump from host", "Review firewall logs for lateral movement",
            "Extract and submit IOCs to threat intel", "Verify backup restore point",
            "Update containment rules", "Notify affected business unit",
            "Perform root cause analysis", "Document attack timeline",
            "Validate EDR telemetry coverage", "Review email gateway quarantine",
            "Check for data exfiltration indicators", "Reset compromised credentials",
            "Coordinate with legal for breach notification", "Deploy emergency patch",
        ])
        task_status = random.choice(TASK_STATUSES)
        task_priority = random.choice(TASK_PRIORITIES)
        assignee = random.choice(ANALYSTS)
        created_by = random.choice(ANALYSTS)
        task_offset = random.randint(3600, 259200)

        # Generate checklist (2-5 items)
        num_checklist = random.randint(2, 5)
        checklist_items = []
        for ci in range(num_checklist):
            checklist_items.append({
                "id": f"chk-{uid()[:8]}",
                "label": random.choice(CHECKLIST_LABELS),
                "checked": random.random() < 0.4
            })
        checklist_json = json.dumps(checklist_items)

        completed_at = f"'{ts_pg(task_offset - 7200)}'" if task_status == "completed" else "NULL"
        due_offset = task_offset - random.randint(86400, 172800)
        due_at = f"'{ts_pg(due_offset)}'" if random.random() < 0.6 else "NULL"

        sql_lines.append(
            f"INSERT INTO incident_tasks (id, incident_id, title, description, status, assignee, "
            f"priority, due_at, created_by, tenant_id, checklist, version, created_at, updated_at, completed_at) VALUES ("
            f"'{task_id}', '{iwb_id}', '{esc(task_title)}', "
            f"'Task for incident {iwb_id}', '{task_status}', '{assignee}', "
            f"'{task_priority}', {due_at}, '{created_by}', {tenant_id}, "
            f"'{esc(checklist_json)}'::jsonb, "
            f"{random.randint(1, 5)}, '{ts_pg(task_offset)}', '{ts_pg(task_offset - 3600)}', "
            f"{completed_at});"
        )

sql_lines.append("")

# ─── Activity entries per incident ───────────────────────────────────────────

sql_lines.append("-- ─── Incident Activity ───────────────────────────────────────────────────")
sql_lines.append("")

NOTE_TEMPLATES = [
    "Confirmed C2 beaconing pattern with 60-second intervals. Checking proxy logs.",
    "Memory analysis complete: credential material likely harvested via LSASS dump.",
    "EDR telemetry shows lateral movement via SMB. Firewall rule proposed.",
    "Threat intel match attributed to known APT infrastructure per advisory.",
    "Containment action executed: host isolated from network. No further beaconing.",
    "Forensic image captured. Chain of custody initiated.",
    "Reviewing alert correlations. Pattern suggests targeted campaign.",
    "Updated severity based on expanded scope. Additional hosts affected.",
    "Backup validation complete. Restore point identified.",
    "Legal notified per breach protocol. DPO engaged.",
    "Sandbox detonation confirms trojan dropper behavior. IoCs extracted.",
    "Network TAP deployed on affected VLAN. Passive monitoring active.",
    "Endpoint isolation lifted after clean scan. Monitoring continues.",
    "Phishing email headers analyzed. Originating IP traced to bulletproof hosting.",
    "Credential reset complete for all affected accounts. MFA enforcement verified.",
]

FIELD_CHANGE_FIELDS = ["severity", "status", "assignee", "priority", "tags", "category"]

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    num_activity = random.randint(20, 50)

    for a in range(num_activity):
        act_id = uid()
        act_type = pick_weighted(ACTIVITY_TYPES, ACTIVITY_WEIGHTS)
        actor = random.choice(ANALYSTS)
        act_offset = random.randint(600, 604800)  # within last 7 days

        if act_type == "note":
            content = random.choice(NOTE_TEMPLATES)
            metadata = json.dumps({"mentions": [random.choice(ANALYSTS)] if random.random() < 0.3 else []})
        elif act_type == "field_change":
            field = random.choice(FIELD_CHANGE_FIELDS)
            content = f"Changed {field}"
            metadata = json.dumps({"field": field, "oldValue": "previous", "newValue": "current"})
        elif act_type == "task_completed":
            content = f"Completed task: {random.choice(CHECKLIST_LABELS)}"
            metadata = json.dumps({"taskId": uid(), "taskTitle": content.replace("Completed task: ", "")})
        elif act_type == "response_action":
            content = f"Response action executed: Block IP / Isolate Host"
            metadata = json.dumps({"actionId": uid()[:8], "status": "completed", "target": f"10.1.{random.randint(1,254)}.{random.randint(1,254)}"})
        elif act_type == "alert_linked":
            content = f"Alert linked: {random.choice(ALERT_NAMES)}"
            metadata = json.dumps({"alertId": uid()[:12], "alertName": content.replace("Alert linked: ", "")})
        else:  # evidence_added
            content = f"Evidence added: {random.choice(EVIDENCE_TYPES)} from {random.choice(EVIDENCE_SOURCES)}"
            metadata = json.dumps({"evidenceId": uid()[:12], "type": random.choice(EVIDENCE_TYPES)})

        sql_lines.append(
            f"INSERT INTO incident_activity (id, incident_id, type, actor_id, content, metadata, tenant_id, created_at) VALUES ("
            f"'{act_id}', '{iwb_id}', '{act_type}', '{actor}', "
            f"'{esc(content)}', '{esc(metadata)}'::jsonb, "
            f"{tenant_id}, '{ts_pg(act_offset)}');"
        )

sql_lines.append("")

# ─── Evidence items (OpenSearch) and custody events (PostgreSQL) ─────────────

sql_lines.append("-- ─── Evidence Custody ────────────────────────────────────────────────────")
sql_lines.append("")

EVIDENCE_TITLES = [
    "Network capture - C2 beaconing traffic",
    "Memory dump - infected workstation",
    "Disk image - compromised server",
    "Email export - phishing campaign samples",
    "Endpoint agent collection - process tree",
    "Log export - authentication events",
    "Binary sample - malware dropper",
    "Registry hive - persistence artifacts",
    "Screenshot - unauthorized access evidence",
    "Network TAP capture - lateral movement",
    "PCAP - DNS tunneling traffic",
    "Email headers - sender analysis",
    "Sandbox report - detonation results",
    "Firewall logs - blocked connections",
    "Proxy logs - C2 communication",
]

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    num_evidence = random.randint(5, 15)
    evidence_index = f"v3-hive-evidence-{tenant}-{TODAY_STR}"

    for e in range(num_evidence):
        evi_id = uid()
        evi_title = random.choice(EVIDENCE_TITLES)
        evi_type = random.choice(EVIDENCE_TYPES)
        evi_source = random.choice(EVIDENCE_SOURCES)
        evi_class = random.choice(EVIDENCE_CLASSES)
        evi_sha = sha256_hash()
        evi_size = random.randint(1024, 52428800)  # 1KB to 50MB
        collected_offset = random.randint(7200, 604800)
        created_offset = collected_offset - random.randint(0, 3600)

        # OpenSearch evidence document
        evi_doc = {
            "@timestamp": ts_offset(created_offset),
            "incidentId": iwb_id,
            "title": evi_title,
            "type": evi_type,
            "sourceSystem": evi_source,
            "collectedAt": ts_offset(collected_offset),
            "createdAt": ts_offset(created_offset),
            "sha256": evi_sha,
            "classification": evi_class,
            "size": evi_size,
            "visibleBy": tenant,
            "tenantId": tenant_id,
        }
        evidence_lines.append(json.dumps({"index": {"_index": evidence_index, "_id": evi_id}}))
        evidence_lines.append(json.dumps(evi_doc))

        # Custody events (2-4 per evidence)
        num_custody = random.randint(2, 4)
        custody_offset = collected_offset
        for c in range(num_custody):
            cust_id = uid()
            action = CUSTODY_ACTIONS[min(c, len(CUSTODY_ACTIONS) - 1)]
            actor = random.choice(ANALYSTS) if action != "collected" else f"agent-{random.choice(HOSTNAMES).lower()}"
            notes_options = [
                f"Auto-collected by {evi_source}",
                f"Analyzed: confirmed {evi_type} contains relevant artifacts",
                f"Transferred to threat intel team for IOC extraction",
                f"Archived per retention policy",
                f"Exported for legal review",
            ]
            notes = notes_options[min(c, len(notes_options) - 1)]
            custody_offset -= random.randint(1800, 14400)

            sql_lines.append(
                f"INSERT INTO evidence_custody (id, evidence_id, incident_id, actor, action, notes, tenant_id, created_at) VALUES ("
                f"'{cust_id}', '{evi_id}', '{iwb_id}', '{esc(actor)}', '{action}', "
                f"'{esc(notes)}', {tenant_id}, '{ts_pg(abs(custody_offset))}');"
            )

sql_lines.append("")

# ─── Linked alerts (OpenSearch) ──────────────────────────────────────────────

RULE_NAMES = [
    "SMB Lateral Movement Detection", "C2 Beacon Periodic Communication",
    "Brute Force SSH Authentication", "PowerShell Encoded Command Execution",
    "Data Exfiltration Volume Threshold", "Credential Dumping LSASS Access",
    "Ransomware File Extension Change", "DNS Tunneling Detection",
    "Phishing Email Click-Through", "Privilege Escalation Token Manipulation",
]

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    num_alerts = random.randint(3, 10)
    alert_index = f"v3-hive-alert-{tenant}-{TODAY_STR}"

    for a in range(num_alerts):
        alert_id = uid()
        alert_name_idx = random.randint(0, len(ALERT_NAMES) - 1)
        alert_sev = random.choice([1, 2, 3, 4])
        sev_labels = {1: "low", 2: "medium", 3: "high", 4: "critical"}
        alert_offset = random.randint(3600, 604800)
        rule_name = random.choice(RULE_NAMES)

        # For chain incidents, use specific rules
        if chain == "A":
            rule_name = CHAIN_A_RULE  # "rule-smb-lateral-001"
        elif chain == "B":
            rule_name = "rule-phishing-click-001"

        src_ip = f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
        dst_ip = f"192.168.{random.randint(1,10)}.{random.randint(1,254)}"

        alert_doc = {
            "@timestamp": ts_offset(alert_offset),
            "id": alert_id,
            "name": ALERT_NAMES[alert_name_idx],
            "incidentId": iwb_id,
            "severity": alert_sev,
            "severityLabel": sev_labels[alert_sev],
            "status": 1,
            "statusLabel": "Open",
            "category": ALERT_CATEGORIES[alert_name_idx],
            "ruleName": rule_name,
            "host": {"name": random.choice(HOSTNAMES)},
            "user": {"name": random.choice(USER_ENTITIES)},
            "source": {"ip": src_ip},
            "destination": {"ip": dst_ip},
            "message": f"Alert triggered for incident {iwb_id}: {ALERT_NAMES[alert_name_idx]}",
            "visibleBy": tenant,
            "tenantId": tenant_id,
            "tags": ["workbench-seed"],
        }
        alert_lines.append(json.dumps({"index": {"_index": alert_index, "_id": alert_id}}))
        alert_lines.append(json.dumps(alert_doc))

# ─── Entity links per incident ───────────────────────────────────────────────
# These go into hive_incident_entity but need the PG incident ID.
# We'll use a subquery to look up the PG ID by name.

sql_lines.append("-- ─── Entity Links ───────────────────────────────────────────────────────")
sql_lines.append("")

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    incident_name = f"{iwb_id}: {title}"
    num_entities = random.randint(3, 8)

    entities = []

    # Add chain-specific entities
    if chain == "A":
        for ip in CHAIN_A_IPS:
            entities.append((ip, "ip"))
        entities.append((random.choice(["FIN-WKS-044", "FIN-WKS-078", "FIN-SRV-005"]), "host"))
    elif chain == "B":
        for domain in CHAIN_B_DOMAINS[:2]:
            entities.append((domain, "domain"))
        entities.append((random.choice(CHAIN_B_HASHES), "file"))
    elif chain == "C":
        for user in CHAIN_C_USERS:
            entities.append((user, "user"))
        entities.append((random.choice(["HR-LPT-007", "FIN-WKS-022", "ENG-SRV-012"]), "host"))

    # Add random entities to reach num_entities
    while len(entities) < num_entities:
        etype = random.choice(["ip", "host", "user"])
        if etype == "ip":
            entities.append((f"10.1.{random.randint(1,254)}.{random.randint(1,254)}", "ip"))
        elif etype == "host":
            entities.append((random.choice(HOSTNAMES), "host"))
        else:
            entities.append((random.choice(USER_ENTITIES), "user"))

    # Deduplicate
    seen = set()
    unique_entities = []
    for eid, etype in entities:
        if eid not in seen:
            seen.add(eid)
            unique_entities.append((eid, etype))

    for eid, etype in unique_entities:
        added_by = random.choice(ANALYSTS)
        link_offset = random.randint(3600, 259200)
        sql_lines.append(
            f"INSERT INTO hive_incident_entity (incident_id, entity_id, entity_type, added_by, added_at) "
            f"SELECT id, '{esc(eid)}', '{etype}', '{added_by}', '{ts_pg(link_offset)}' "
            f"FROM hive_incident WHERE incident_name = '{esc(incident_name)}' "
            f"AND NOT EXISTS ("
            f"SELECT 1 FROM hive_incident_entity WHERE incident_id = ("
            f"SELECT id FROM hive_incident WHERE incident_name = '{esc(incident_name)}') "
            f"AND entity_id = '{esc(eid)}');"
        )

sql_lines.append("")

# ─── Timeline entries (hive_incident_history) ────────────────────────────────
# These provide the timeline progression: detection → triage → investigation → containment → eradication

sql_lines.append("-- ─── Timeline Entries (hive_incident_history) ──────────────────────────")
sql_lines.append("")

TIMELINE_ACTIONS = [
    ("INCIDENT_CREATED", "Incident created", "Automated detection triggered by correlation engine"),
    ("INCIDENT_STATUS_CHANGE", "Status changed to OPEN", "Initial triage - severity assessed, priority assigned"),
    ("INCIDENT_ASSIGNED_TO", "Assigned to analyst", "Assigned to lead analyst for investigation"),
    ("INCIDENT_NOTE_ADD", "Investigation note added", "Initial IOC extraction and containment assessment"),
    ("INCIDENT_STATUS_CHANGE", "Investigation phase started", "Full investigation initiated - evidence collection underway"),
    ("INCIDENT_ALERT_ADD", "Additional alert correlated", "New alert linked - expanding scope of investigation"),
    ("INCIDENT_NOTE_ADD", "Containment decision noted", "Containment boundary defined - isolation pending approval"),
    ("INCIDENT_STATUS_CHANGE", "Containment actions executed", "Affected hosts isolated, firewall rules applied"),
    ("INCIDENT_COMMAND_EXECUTED", "Response action executed", "Automated containment action completed"),
    ("INCIDENT_NOTE_ADD", "Eradication progress noted", "Malware removed, persistence mechanisms cleared"),
    ("INCIDENT_ASSIGNED_CHANGE", "Re-assigned for review", "Handed off to senior analyst for closure review"),
    ("INCIDENT_STATUS_CHANGE", "Post-incident review scheduled", "Lessons learned meeting scheduled"),
    ("INCIDENT_NOTE_ADD", "Root cause documented", "Root cause analysis complete - documented in case notes"),
    ("INCIDENT_COMPLETED", "Incident resolved", "All remediation actions verified, incident closed"),
]

for inc in INCIDENTS:
    iwb_id, title, severity, status, priority, tenant, tenant_id, chain = inc
    incident_name = f"{iwb_id}: {title}"
    num_timeline = random.randint(10, 30)

    # Pick a subset of timeline actions based on status
    if status == "COMPLETED":
        max_phase = len(TIMELINE_ACTIONS)
    elif status == "IN_REVIEW":
        max_phase = random.randint(8, 12)
    else:  # OPEN
        max_phase = random.randint(5, 9)

    # Generate timeline entries — repeat phases with variations to hit 10-30 range
    base_offset = random.randint(172800, 2592000)  # 2-30 days ago
    actual_entries = min(num_timeline, max(num_timeline, 10))  # ensure at least 10
    for t in range(actual_entries):
        action_idx = t % len(TIMELINE_ACTIONS)
        if action_idx >= max_phase:
            action_idx = random.randint(0, max_phase - 1)  # recycle earlier phases
        action_type, action_text, detail = TIMELINE_ACTIONS[action_idx]
        actor = random.choice(ANALYSTS)
        entry_offset = base_offset - (t * random.randint(1800, 14400))

        sql_lines.append(
            f"INSERT INTO hive_incident_history (incident_id, action_date, action_type, "
            f"action_created_by, action, action_detail) "
            f"SELECT id, '{ts_pg(abs(entry_offset))}', '{action_type}', "
            f"'{actor}', '{esc(action_text)}', '{esc(detail)}' "
            f"FROM hive_incident WHERE incident_name = '{esc(incident_name)}';"
        )

sql_lines.append("")

# ─── Finalize ────────────────────────────────────────────────────────────────

sql_lines.append("COMMIT;")
sql_lines.append("")
sql_lines.append(f"-- Total incidents: {len(INCIDENTS)}")
sql_lines.append(f"-- Chain A (SMB Lateral): IWB-CWM-001, IWB-CWM-002, IWB-CWM-006, IWB-WM2-001")
sql_lines.append(f"-- Chain B (Phishing): IWB-CWM-003, IWB-CWM-008, IWB-WM1-001, IWB-WM1-003, IWB-WM1-006")
sql_lines.append(f"-- Chain C (Credential Theft): IWB-CWM-005, IWB-CWM-010, IWB-WM1-004, IWB-WM2-003")

# Write output files
with open(os.path.join(OUTPUT_DIR, "seed.sql"), "w") as f:
    f.write("\n".join(sql_lines))
    f.write("\n")

with open(os.path.join(OUTPUT_DIR, "evidence.ndjson"), "w") as f:
    f.write("\n".join(evidence_lines))
    f.write("\n")

with open(os.path.join(OUTPUT_DIR, "alerts.ndjson"), "w") as f:
    f.write("\n".join(alert_lines))
    f.write("\n")

with open(os.path.join(OUTPUT_DIR, "incidents.ndjson"), "w") as f:
    f.write("\n".join(incident_lines))
    f.write("\n")

# Summary
print(f"Generated seed data in {OUTPUT_DIR}/")
print(f"  Incidents:  {len(INCIDENTS)}")
print(f"  SQL file:   seed.sql")
print(f"  Incidents:  incidents.ndjson ({len(incident_lines) // 2} docs)")
print(f"  Evidence:   evidence.ndjson ({len(evidence_lines) // 2} docs)")
print(f"  Alerts:     alerts.ndjson ({len(alert_lines) // 2} docs)")
print(f"  Chains:     A(4 incidents), B(5 incidents), C(4 incidents)")
