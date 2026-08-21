#!/usr/bin/env python3
"""
Seed 200 production-shaped alerts into OpenSearch for Sprint 38 triage drawer testing.

Generates alerts with:
- 5 attack chain templates across 3 tenants
- Full MITRE ATT&CK tactic/technique pairs
- Risk factors, threat intel, adversary/target, SLA, notes, tags
- Proper severity distribution: Critical(25), High(40), Medium(60), Low(50), Info(25)
"""

import json
import random
import urllib.request
import urllib.error
import ssl
import base64
import uuid
from datetime import datetime, timedelta, timezone

# --- Config ---
ES_URL = "https://localhost:9200"
ES_USER = "admin"
ES_PASS = "LocalDev@2024!"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

random.seed(38)  # Reproducible for debugging

# --- Tenants ---
TENANTS = [
    {"id": "3813", "name": "CWM", "prefix": "cwm", "count": 70,
     "chains": ["brute-force", "malware-delivery", "phishing", "supply-chain", "insider-threat"]},
    {"id": "3812", "name": "Workmates1", "prefix": "workmates1", "count": 65,
     "chains": ["brute-force", "malware-delivery", "phishing", "supply-chain"]},
    {"id": "3814", "name": "Workmates2", "prefix": "workmates2", "count": 65,
     "chains": ["malware-delivery", "phishing", "supply-chain", "insider-threat"]},
]

# --- Analysts ---
ANALYSTS = [
    {"id": "41", "name": "Maya Chen"},
    {"id": "42", "name": "James Walker"},
    {"id": "43", "name": "Priya Patel"},
    {"id": "44", "name": "Carlos Reyes"},
    {"id": "45", "name": "Sarah Kim"},
]

# --- MITRE ATT&CK Tactic/Technique Mapping ---
MITRE = {
    "Reconnaissance": {"tacticId": "TA0043", "techniques": [
        ("T1595.001", "Active Scanning: Scanning IP Blocks"),
        ("T1592.001", "Gather Victim Host Information: Hardware"),
        ("T1589.001", "Gather Victim Identity Information: Credentials"),
    ]},
    "Initial Access": {"tacticId": "TA0001", "techniques": [
        ("T1566.001", "Phishing: Spearphishing Attachment"),
        ("T1566.002", "Phishing: Spearphishing Link"),
        ("T1190", "Exploit Public-Facing Application"),
        ("T1195.002", "Supply Chain Compromise: Compromise Software Supply Chain"),
    ]},
    "Execution": {"tacticId": "TA0002", "techniques": [
        ("T1059.001", "PowerShell"),
        ("T1059.003", "Windows Command Shell"),
        ("T1059.006", "Python"),
        ("T1204.002", "User Execution: Malicious File"),
    ]},
    "Persistence": {"tacticId": "TA0003", "techniques": [
        ("T1547.001", "Boot or Logon Autostart Execution: Registry Run Keys"),
        ("T1053.005", "Scheduled Task/Job: Scheduled Task"),
        ("T1136.001", "Create Account: Local Account"),
    ]},
    "Privilege Escalation": {"tacticId": "TA0004", "techniques": [
        ("T1068", "Exploitation for Privilege Escalation"),
        ("T1548.002", "Abuse Elevation Control Mechanism: Bypass UAC"),
        ("T1134.001", "Access Token Manipulation: Token Impersonation"),
    ]},
    "Defense Evasion": {"tacticId": "TA0005", "techniques": [
        ("T1027.001", "Obfuscated Files or Information: Binary Padding"),
        ("T1070.001", "Indicator Removal: Clear Windows Event Logs"),
        ("T1562.001", "Impair Defenses: Disable or Modify Tools"),
    ]},
    "Credential Access": {"tacticId": "TA0006", "techniques": [
        ("T1003.001", "OS Credential Dumping: LSASS Memory"),
        ("T1110.001", "Brute Force: Password Guessing"),
        ("T1110.003", "Brute Force: Password Spraying"),
        ("T1558.003", "Steal or Forge Kerberos Tickets: Kerberoasting"),
    ]},
    "Discovery": {"tacticId": "TA0007", "techniques": [
        ("T1087.002", "Account Discovery: Domain Account"),
        ("T1046", "Network Service Scanning"),
        ("T1083", "File and Directory Discovery"),
    ]},
    "Lateral Movement": {"tacticId": "TA0008", "techniques": [
        ("T1021.001", "Remote Services: Remote Desktop Protocol"),
        ("T1021.002", "Remote Services: SMB/Windows Admin Shares"),
        ("T1570", "Lateral Tool Transfer"),
    ]},
    "Collection": {"tacticId": "TA0009", "techniques": [
        ("T1560.001", "Archive Collected Data: Archive via Utility"),
        ("T1114.001", "Email Collection: Local Email Collection"),
        ("T1005", "Data from Local System"),
    ]},
    "Command and Control": {"tacticId": "TA0011", "techniques": [
        ("T1071.001", "Application Layer Protocol: Web Protocols"),
        ("T1573.001", "Encrypted Channel: Symmetric Cryptography"),
        ("T1105", "Ingress Tool Transfer"),
    ]},
    "Exfiltration": {"tacticId": "TA0010", "techniques": [
        ("T1048.003", "Exfiltration Over Alternative Protocol: Unencrypted Non-C2"),
        ("T1041", "Exfiltration Over C2 Channel"),
        ("T1567.002", "Exfiltration Over Web Service: Exfiltration to Cloud Storage"),
    ]},
    "Impact": {"tacticId": "TA0040", "techniques": [
        ("T1486", "Data Encrypted for Impact"),
        ("T1489", "Service Stop"),
        ("T1490", "Inhibit System Recovery"),
    ]},
}

# --- Attack Chain Templates ---
ATTACK_CHAINS = {
    "brute-force": {
        "name": "Brute Force Campaign",
        "alerts": [
            {"tactic": "Reconnaissance", "name": "External port scanning from {adversary_ip}",
             "desc": "Automated scanning targeting RDP and SSH ports across the {tenant} subnet range."},
            {"tactic": "Credential Access", "name": "Password spraying against Active Directory",
             "desc": "Multiple authentication failures detected from {adversary_ip} using common password patterns against domain accounts."},
            {"tactic": "Initial Access", "name": "Successful RDP login after brute force",
             "desc": "Account {entity_label} authenticated via RDP following 847 failed attempts from {adversary_ip}."},
            {"tactic": "Persistence", "name": "Scheduled task created for persistence",
             "desc": "A new scheduled task 'WindowsUpdate_Check' was created to execute encoded PowerShell on system startup."},
            {"tactic": "Lateral Movement", "name": "SMB lateral movement to {target_host}",
             "desc": "Admin share (C$) accessed on {target_host} using compromised credentials of {entity_label}."},
            {"tactic": "Impact", "name": "Ransomware encryption behavior on {target_host}",
             "desc": "Mass file rename operations (.encrypted extension) detected across network shares on {target_host}."},
        ]
    },
    "malware-delivery": {
        "name": "Malware Delivery Chain",
        "alerts": [
            {"tactic": "Initial Access", "name": "Malicious attachment opened by {entity_label}",
             "desc": "User {entity_label} opened 'Invoice_Q3_2026.xlsm' containing VBA macro from suspicious sender."},
            {"tactic": "Execution", "name": "Encoded PowerShell spawned from Office macro",
             "desc": "Microsoft Excel spawned powershell.exe with base64-encoded command line argument."},
            {"tactic": "Persistence", "name": "Registry run key modification for backdoor",
             "desc": "New registry value added to HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run pointing to %TEMP%\\svchost_update.exe."},
            {"tactic": "Defense Evasion", "name": "Windows Defender real-time protection disabled",
             "desc": "Set-MpPreference -DisableRealtimeMonitoring executed via PowerShell with elevated privileges."},
            {"tactic": "Command and Control", "name": "C2 beacon to {adversary_ip} on port 443",
             "desc": "Periodic HTTPS callbacks every 60s to {adversary_ip} with jitter pattern consistent with Cobalt Strike."},
        ]
    },
    "phishing": {
        "name": "Phishing + Account Takeover",
        "alerts": [
            {"tactic": "Initial Access", "name": "Phishing link clicked by {entity_label}",
             "desc": "User {entity_label} clicked credential harvesting link impersonating O365 login page from {adversary_ip}."},
            {"tactic": "Credential Access", "name": "Credential harvesting form submission detected",
             "desc": "POST request to {adversary_ip}/auth/login.php with form data containing domain credentials."},
            {"tactic": "Collection", "name": "Mailbox export rule created by compromised account",
             "desc": "New inbox rule forwarding all email to external address created by {entity_label} from unusual IP."},
            {"tactic": "Exfiltration", "name": "Mass email data exfiltration via forwarding",
             "desc": "Over 2,400 emails forwarded to external domain in 3-hour window from {entity_label} mailbox."},
        ]
    },
    "supply-chain": {
        "name": "Supply Chain Compromise",
        "alerts": [
            {"tactic": "Initial Access", "name": "Trojanized package installed via npm",
             "desc": "Package 'event-stream-utils' (known compromised) installed on {target_host} build server."},
            {"tactic": "Execution", "name": "Post-install script executed with elevated privileges",
             "desc": "npm post-install hook spawned /bin/sh executing obfuscated JavaScript payload."},
            {"tactic": "Privilege Escalation", "name": "Container escape via CVE-2024-21626",
             "desc": "Process on {target_host} exploited runc vulnerability to gain host-level access from container."},
        ]
    },
    "insider-threat": {
        "name": "Insider Threat — Data Theft",
        "alerts": [
            {"tactic": "Discovery", "name": "Enumeration of sensitive file shares by {entity_label}",
             "desc": "User {entity_label} accessed 14 restricted SharePoint sites within 20 minutes outside business hours."},
            {"tactic": "Collection", "name": "Mass file download from confidential repository",
             "desc": "Over 340 files downloaded from 'Contracts-2026' and 'HR-Compensation' repositories."},
            {"tactic": "Exfiltration", "name": "Large data transfer to personal cloud storage",
             "desc": "Upload of 2.3GB archive to personal Google Drive detected from {entity_label} workstation."},
            {"tactic": "Impact", "name": "Deletion of audit trail by {entity_label}",
             "desc": "Windows Event Log service stopped and Security.evtx cleared on {target_host}."},
        ]
    },
}

# --- Entity pools (per tenant) ---
ENTITIES = {
    "cwm": {
        "hosts": ["FIN-WKS-044", "DC-PROD-01", "DC-PROD-02", "HR-WKS-017", "ENG-WKS-112",
                  "MAIL-SRV-01", "FILE-SRV-02", "WEB-PROD-01", "BUILD-SRV-03", "VPN-GW-01"],
        "users": ["sarah.chen", "mike.johnson", "priya.desai", "tom.wilson", "lisa.park",
                  "alex.kumar", "jenny.martinez", "dave.brown", "admin.svc", "backup.svc"],
        "ips": ["10.1.5.44", "10.1.5.10", "10.1.5.11", "10.1.6.17", "10.1.7.112",
                "10.1.2.50", "10.1.2.51", "10.1.3.80", "10.1.8.30", "10.1.1.1"],
    },
    "workmates1": {
        "hosts": ["WM1-WKS-001", "WM1-DC-01", "WM1-WKS-023", "WM1-SRV-DB-01", "WM1-WKS-045",
                  "WM1-MAIL-01", "WM1-FILE-01", "WM1-WEB-01", "WM1-CI-01", "WM1-FW-01"],
        "users": ["john.doe", "emma.watson", "raj.patel", "maria.garcia", "kevin.lee",
                  "anna.smith", "bob.jones", "carol.white", "svc.deploy", "svc.monitor"],
        "ips": ["10.2.1.10", "10.2.1.5", "10.2.1.23", "10.2.2.100", "10.2.1.45",
                "10.2.3.50", "10.2.3.51", "10.2.4.80", "10.2.5.30", "10.2.0.1"],
    },
    "workmates2": {
        "hosts": ["WM2-EXEC-001", "WM2-DC-01", "WM2-DEV-019", "WM2-PROD-DB", "WM2-WKS-033",
                  "WM2-MAIL-01", "WM2-NAS-01", "WM2-K8S-01", "WM2-JUMP-01", "WM2-FW-01"],
        "users": ["nina.petrov", "omar.hassan", "yuki.tanaka", "frank.miller", "grace.kim",
                  "dan.wright", "ava.lopez", "chris.nguyen", "svc.k8s", "svc.backup"],
        "ips": ["10.3.1.10", "10.3.1.5", "10.3.1.19", "10.3.2.100", "10.3.1.33",
                "10.3.3.50", "10.3.3.51", "10.3.4.80", "10.3.5.30", "10.3.0.1"],
    },
}

# External IPs (RFC5737 test ranges + realistic threat IPs)
ADVERSARY_IPS = [
    "203.0.113.45", "203.0.113.101", "203.0.113.200", "198.51.100.22",
    "198.51.100.77", "198.51.100.150", "192.0.2.33", "192.0.2.88",
    "192.0.2.199", "192.0.2.244",
]

# Process names
ADVERSARY_PROCESSES = ["powershell.exe", "cmd.exe", "python3", "bash", "certutil.exe",
                       "mshta.exe", "wscript.exe", "regsvr32.exe", "rundll32.exe", "curl"]
TARGET_PROCESSES = ["WINWORD.EXE", "EXCEL.EXE", "svchost.exe", "lsass.exe", "explorer.exe",
                    "httpd", "nginx", "java", "node", "postgres"]

# --- Tags pool ---
TAGS_POOL = ["encoded-script", "lateral-movement", "high-priority", "false-positive-candidate",
             "known-ioc", "persistence", "c2-beacon", "data-theft", "insider-risk",
             "office-macro", "brute-force", "privilege-escalation", "exfiltration",
             "credential-access", "supply-chain", "ransomware"]

# --- Threat Intel Sources ---
THREAT_INTEL_SOURCES = ["AlienVault OTX", "MISP", "VirusTotal", "Recorded Future"]
THREAT_INTEL_TYPES = ["ip", "domain", "hash"]

# --- Risk Factor Templates ---
RISK_FACTOR_TEMPLATES = [
    {"name": "Asset criticality", "desc_tpl": "{entity_type} with {access_type} access"},
    {"name": "Technique severity", "desc_tpl": "{technique} is high-confidence malicious"},
    {"name": "Threat intel match", "desc_tpl": "Indicator matches known {threat_group} toolkit"},
    {"name": "User behavior baseline", "desc_tpl": "First {action} for this user in {days} days"},
    {"name": "Time anomaly", "desc_tpl": "Activity outside normal business hours"},
    {"name": "Frequency anomaly", "desc_tpl": "{count} occurrences in {window} minutes"},
    {"name": "Geographic anomaly", "desc_tpl": "Connection from unusual {location}"},
    {"name": "Privilege level", "desc_tpl": "Action performed with {priv_level} privileges"},
    {"name": "Network exposure", "desc_tpl": "Asset directly exposed to {exposure_type}"},
    {"name": "Historical correlation", "desc_tpl": "Similar pattern seen in {prev_incident}"},
]

ACCESS_TYPES = ["PII", "financial", "executive", "engineering", "admin", "production database"]
THREAT_GROUPS = ["APT29", "Lazarus", "FIN7", "Sandworm", "APT41", "DarkSide"]
LOCATIONS = ["Eastern Europe", "Southeast Asia", "South America", "unknown VPN exit node"]
PREV_INCIDENTS = ["INC-2026-041", "INC-2026-033", "INC-2025-187", "INC-2026-012"]

# --- Standalone alert name templates ---
STANDALONE_ALERTS = [
    ("Suspicious DNS query to {domain}", "DNS", "Discovery"),
    ("Failed SSH login from {adversary_ip}", "Authentication", "Credential Access"),
    ("Unusual outbound data volume from {entity_label}", "Network", "Exfiltration"),
    ("New local admin account created on {target_host}", "Account", "Persistence"),
    ("Process injection detected in {process}", "Endpoint", "Defense Evasion"),
    ("Unauthorized USB device connected to {target_host}", "Endpoint", "Collection"),
    ("TLS certificate mismatch on connection to {domain}", "Network", "Command and Control"),
    ("Kerberoasting attempt by {entity_label}", "Authentication", "Credential Access"),
    ("Base64-encoded command execution on {target_host}", "Endpoint", "Execution"),
    ("Anomalous login time for {entity_label}", "Authentication", "Initial Access"),
    ("Firewall rule modification by {entity_label}", "Network", "Defense Evasion"),
    ("Suspicious cron job installed on {target_host}", "Endpoint", "Persistence"),
    ("Data staging in temp directory on {target_host}", "Endpoint", "Collection"),
    ("Reverse shell connection to {adversary_ip}", "Network", "Command and Control"),
    ("Privilege escalation via sudo misconfiguration", "Endpoint", "Privilege Escalation"),
    ("Cleartext credential in process memory", "Endpoint", "Credential Access"),
    ("Tor exit node connection from {entity_label}", "Network", "Command and Control"),
    ("Suspicious Python script execution on {target_host}", "Endpoint", "Execution"),
    ("Mass file deletion on {target_host}", "Endpoint", "Impact"),
    ("Cloud API key exposed in public repository", "Cloud", "Initial Access"),
]

SUSPICIOUS_DOMAINS = ["evil-update.com", "c2.darknet.ru", "api.malware-cdn.xyz",
                      "login-verify.phish.io", "dl.trojan-host.net", "sync.exfil-data.cc"]

# --- Severity distribution (total=200) ---
# Critical(9-10): 25, High(7-8): 40, Medium(4-6): 60, Low(1-3): 50, Info(0): 25
SEVERITY_POOL = (
    [10]*12 + [9]*13 +          # Critical: 25
    [8]*20 + [7]*20 +           # High: 40
    [6]*20 + [5]*20 + [4]*20 +  # Medium: 60
    [3]*17 + [2]*17 + [1]*16 +  # Low: 50
    [0]*25                       # Info: 25
)
random.shuffle(SEVERITY_POOL)

# --- Helper functions ---
NOW = datetime.now(timezone.utc)

def random_timestamp(hours_back_max=48):
    """Generate a timestamp within the last N hours, weighted toward recent."""
    # Bias toward recent (exponential distribution)
    hours_ago = random.expovariate(0.08)
    hours_ago = min(hours_ago, hours_back_max)
    ts = NOW - timedelta(hours=hours_ago)
    return ts

def fmt_ts(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z"

def pick_mitre(tactic_name):
    """Get MITRE tactic ID and a random technique for the given tactic."""
    tactic = MITRE[tactic_name]
    tech = random.choice(tactic["techniques"])
    return {
        "mitreTacticId": tactic["tacticId"],
        "mitreTacticName": tactic_name,
        "mitreTechniqueId": tech[0],
        "mitreTechniqueName": tech[1],
    }

def gen_risk_factors(severity):
    """Generate 3-5 risk factors with weights summing ~1.0."""
    count = random.randint(3, 5)
    factors = random.sample(RISK_FACTOR_TEMPLATES, count)
    # Generate weights that sum to ~1.0
    raw_weights = [random.random() for _ in range(count)]
    total_w = sum(raw_weights)
    weights = [w / total_w for w in raw_weights]
    
    result = []
    for i, f in enumerate(factors):
        contribution = int(weights[i] * severity * 10)
        contribution = max(5, min(contribution, 35))
        desc = f["desc_tpl"].format(
            entity_type=random.choice(["Finance workstation", "Domain controller", "Build server", "Executive laptop"]),
            access_type=random.choice(ACCESS_TYPES),
            technique=random.choice(["PowerShell execution", "Credential dumping", "Lateral tool transfer"]),
            threat_group=random.choice(THREAT_GROUPS),
            action=random.choice(["PowerShell execution", "RDP connection", "admin login"]),
            days=random.randint(30, 180),
            count=random.randint(5, 500),
            window=random.randint(5, 60),
            location=random.choice(LOCATIONS),
            priv_level=random.choice(["SYSTEM", "root", "Domain Admin"]),
            exposure_type=random.choice(["internet", "DMZ", "untrusted network"]),
            prev_incident=random.choice(PREV_INCIDENTS),
        )
        result.append({
            "name": f["name"],
            "weight": round(weights[i], 2),
            "contribution": contribution,
            "description": desc,
        })
    return result

def gen_status_history(created_at, status):
    """Generate creation event + 0-3 status transitions."""
    history = [{"from": 0, "to": 1, "at": fmt_ts(created_at), "actor": "system", "note": "Alert created by correlation engine"}]
    
    transitions = random.randint(0, 3)
    current_status = 1
    current_time = created_at
    
    status_actors = ["maya.chen", "james.walker", "priya.patel", "carlos.reyes", "sarah.kim", "system"]
    status_notes = [
        "Acknowledged for investigation",
        "Escalated to Tier 2",
        "Assigned for triage",
        "Confirmed true positive",
        "Marked as false positive after review",
        "Auto-closed by SLA policy",
        "Re-opened due to new evidence",
    ]
    
    for _ in range(transitions):
        current_time = current_time + timedelta(minutes=random.randint(5, 120))
        if current_time > NOW:
            break
        next_status = min(current_status + random.randint(1, 2), 7)
        if next_status == current_status:
            continue
        history.append({
            "from": current_status,
            "to": next_status,
            "at": fmt_ts(current_time),
            "actor": random.choice(status_actors),
            "note": random.choice(status_notes),
        })
        current_status = next_status
    
    return history

def gen_notes(created_at):
    """Generate 1-3 analyst notes (for 20% of alerts)."""
    note_bodies = [
        "Confirmed macro execution from phishing email. Checking lateral movement.",
        "False positive — scheduled admin maintenance window. Closing.",
        "Correlates with INC-2026-041. Adding to existing investigation.",
        "Endpoint isolated pending forensic image capture.",
        "Threat intel match confirmed. Hash seen in Lazarus campaign Q2 2026.",
        "User confirmed they did not initiate this action. Credentials compromised.",
        "Escalating to incident response team — potential data breach.",
        "Network traffic analysis shows no actual exfiltration. Benign scan.",
        "Updating IOC blocklist with adversary IP. Monitoring for reoccurrence.",
    ]
    note_authors = ["maya.chen", "james.walker", "priya.patel", "carlos.reyes", "sarah.kim"]
    visibilities = ["soc", "soc", "soc", "tenant", "public"]
    
    count = random.randint(1, 3)
    notes = []
    note_time = created_at + timedelta(minutes=random.randint(10, 60))
    
    for i in range(count):
        notes.append({
            "id": f"note-{uuid.uuid4().hex[:8]}",
            "body": random.choice(note_bodies),
            "author": random.choice(note_authors),
            "visibility": random.choice(visibilities),
            "at": fmt_ts(note_time),
        })
        note_time = note_time + timedelta(minutes=random.randint(5, 45))
    
    return notes

def gen_threat_intel():
    """Generate threat intel data (for 30% of alerts)."""
    return {
        "threatIntelMatched": True,
        "threatIntelSource": random.choice(THREAT_INTEL_SOURCES),
        "threatIntelType": random.choice(THREAT_INTEL_TYPES),
        "threatIntelConfidence": random.randint(70, 95),
    }

def gen_sla(severity, created_at):
    """Generate SLA status: 70% on_track, 15% at_risk, 10% breached, 5% none."""
    r = random.random()
    if r < 0.70:
        sla_status = "on_track"
    elif r < 0.85:
        sla_status = "at_risk"
    elif r < 0.95:
        sla_status = "breached"
    else:
        sla_status = "none"
    
    # SLA due time based on severity
    if severity >= 9:
        hours = 1
    elif severity >= 7:
        hours = 4
    elif severity >= 4:
        hours = 24
    else:
        hours = 72
    
    sla_due = created_at + timedelta(hours=hours)
    return {"slaStatus": sla_status, "slaDueAt": fmt_ts(sla_due)}

def gen_assignee():
    """60% assigned to an analyst, 40% unassigned."""
    if random.random() < 0.60:
        analyst = random.choice(ANALYSTS)
        return {"assigneeId": analyst["id"], "assigneeName": analyst["name"]}
    return {"assigneeId": None, "assigneeName": None}

def gen_tags(is_chain=False, chain_type=None):
    """Generate 2-4 tags from realistic set."""
    count = random.randint(2, 4)
    tags = random.sample(TAGS_POOL, count)
    if is_chain and chain_type:
        # Add chain-relevant tag
        chain_tags = {
            "brute-force": "brute-force",
            "malware-delivery": "office-macro",
            "phishing": "credential-access",
            "supply-chain": "supply-chain",
            "insider-threat": "insider-risk",
        }
        if chain_tags.get(chain_type) and chain_tags[chain_type] not in tags:
            tags[0] = chain_tags[chain_type]
    return tags

def build_alert(severity, tenant, entity_idx, is_chain, chain_type, alert_template, chain_id=None):
    """Build a complete alert document."""
    prefix = tenant["prefix"]
    tenant_entities = ENTITIES[prefix]
    
    # Pick entity
    host = tenant_entities["hosts"][entity_idx % len(tenant_entities["hosts"])]
    user = tenant_entities["users"][entity_idx % len(tenant_entities["users"])]
    ip = tenant_entities["ips"][entity_idx % len(tenant_entities["ips"])]
    
    # Primary entity type
    entity_type = random.choice(["host", "user", "ip"])
    if entity_type == "host":
        entity_id = f"host-{host.lower()}"
        entity_label = host
    elif entity_type == "user":
        entity_id = f"user-{user}"
        entity_label = f"USR-{user}"
    else:
        entity_id = f"ip-{ip}"
        entity_label = ip
    
    # Adversary
    adversary_ip = random.choice(ADVERSARY_IPS)
    target_host = random.choice(tenant_entities["hosts"])
    domain = random.choice(SUSPICIOUS_DOMAINS)
    process = random.choice(ADVERSARY_PROCESSES)
    
    # Determine alert name and description
    if alert_template:
        name = alert_template["name"].format(
            adversary_ip=adversary_ip, entity_label=entity_label,
            target_host=target_host, tenant=tenant["name"],
            domain=domain, process=process,
        )
        desc = alert_template["desc"].format(
            adversary_ip=adversary_ip, entity_label=entity_label,
            target_host=target_host, tenant=tenant["name"],
        )
        tactic_name = alert_template["tactic"]
    else:
        # Standalone alert
        template = random.choice(STANDALONE_ALERTS)
        name = template[0].format(
            adversary_ip=adversary_ip, entity_label=entity_label,
            target_host=target_host, domain=domain, process=process,
        )
        desc = f"Automated detection triggered on {target_host} in {tenant['name']} environment."
        tactic_name = template[2]
    
    # MITRE mapping
    mitre = pick_mitre(tactic_name)
    category = tactic_name
    
    # Timestamp
    created_at = random_timestamp(48)
    
    # Risk score (correlated with severity)
    risk_score = min(100.0, max(0.0, severity * 10 + random.uniform(-8, 8)))
    confidence = random.randint(60, 99)
    occurrence_count = random.randint(1, 50)
    version = random.randint(1, 10)
    status = random.randint(1, 7)
    
    # Related alerts for chain alerts
    related_count = random.randint(2, 5) if is_chain else random.randint(0, 1)

    # Build the document
    doc = {
        "@timestamp": fmt_ts(created_at),
        "name": name,
        "description": desc,
        "severity": severity,
        "status": status,
        "category": category,
        "riskScore": round(risk_score, 1),
        "confidence": confidence,
        "occurrenceCount": occurrence_count,
        "version": version,
        "visibleBy": prefix,
        # MITRE
        "mitreTacticId": mitre["mitreTacticId"],
        "mitreTacticName": mitre["mitreTacticName"],
        "mitreTechniqueId": mitre["mitreTechniqueId"],
        "mitreTechniqueName": mitre["mitreTechniqueName"],
        # Entity
        "primaryEntityId": entity_id,
        "primaryEntityType": entity_type,
        "primaryEntityLabel": entity_label,
        "primaryEntityRiskScore": int(risk_score),
        # Tenant
        "tenantId": tenant["id"],
        "tenantName": tenant["name"],
        # Related
        "relatedAlertCount": related_count,
    }
    
    # Assignee
    assignee = gen_assignee()
    doc["assigneeId"] = assignee["assigneeId"]
    doc["assigneeName"] = assignee["assigneeName"]
    
    # SLA
    sla = gen_sla(severity, created_at)
    doc["slaStatus"] = sla["slaStatus"]
    doc["slaDueAt"] = sla["slaDueAt"]
    
    # Risk factors
    doc["riskFactors"] = gen_risk_factors(severity)
    
    # Status history
    doc["statusHistory"] = gen_status_history(created_at, status)
    
    # Tags
    doc["tags"] = gen_tags(is_chain, chain_type)
    
    # Adversary / Target
    doc["adversary"] = {
        "ip": adversary_ip,
        "hostname": None,
        "processName": random.choice(ADVERSARY_PROCESSES),
        "username": f"NORTHSTAR\\{user}" if random.random() < 0.5 else None,
    }
    doc["target"] = {
        "ip": ip,
        "hostname": host,
        "processName": random.choice(TARGET_PROCESSES),
        "username": None,
    }
    
    # Threat intel (30% of alerts)
    if random.random() < 0.30:
        intel = gen_threat_intel()
        doc.update(intel)
    else:
        doc["threatIntelMatched"] = False
    
    # Notes (20% of alerts)
    if random.random() < 0.20:
        doc["notes"] = gen_notes(created_at)
    
    # Chain metadata
    if chain_id:
        doc["chainId"] = chain_id
    
    return doc

def es_request(method, path, body=None, content_type="application/json"):
    """Make a request to OpenSearch."""
    auth = base64.b64encode(f"{ES_USER}:{ES_PASS}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}
    if content_type:
        headers["Content-Type"] = content_type
    
    data = body.encode("utf-8") if body else None
    req = urllib.request.Request(f"{ES_URL}{path}", data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        body_text = e.read().decode() if e.fp else ""
        print(f"  HTTP {e.code}: {body_text[:200]}")
        return None
    except urllib.error.URLError as e:
        print(f"  ERROR: {e}")
        return None

def es_bulk(body):
    """Send bulk indexing request."""
    auth = base64.b64encode(f"{ES_USER}:{ES_PASS}".encode()).decode()
    req = urllib.request.Request(
        f"{ES_URL}/_bulk",
        data=body.encode("utf-8"),
        headers={"Content-Type": "application/x-ndjson", "Authorization": f"Basic {auth}"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            result = json.loads(resp.read())
            if result.get("errors"):
                errs = [i for i in result["items"] if "error" in i.get("index", {})]
                if errs:
                    print(f"  WARNING: {len(errs)} indexing errors")
                    for e in errs[:3]:
                        print(f"    {e.get('index', {}).get('error', {}).get('reason', 'unknown')}")
            return result
    except urllib.error.URLError as e:
        print(f"  BULK ERROR: {e}")
        return None

def create_index(prefix):
    """Create the alert index with proper mappings."""
    today = NOW.strftime("%Y.%m.%d")
    index_name = f"v3-hive-alert-{prefix}-{today}"
    
    mapping = {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {"properties": {
            "@timestamp": {"type": "date"},
            "name": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "description": {"type": "text"},
            "severity": {"type": "integer"},
            "status": {"type": "integer"},
            "category": {"type": "keyword"},
            "riskScore": {"type": "float"},
            "confidence": {"type": "integer"},
            "occurrenceCount": {"type": "integer"},
            "version": {"type": "integer"},
            "visibleBy": {"type": "keyword"},
            "mitreTacticId": {"type": "keyword"},
            "mitreTacticName": {"type": "keyword"},
            "mitreTechniqueId": {"type": "keyword"},
            "mitreTechniqueName": {"type": "keyword"},
            "primaryEntityId": {"type": "keyword"},
            "primaryEntityType": {"type": "keyword"},
            "primaryEntityLabel": {"type": "keyword"},
            "primaryEntityRiskScore": {"type": "integer"},
            "assigneeId": {"type": "keyword"},
            "assigneeName": {"type": "keyword"},
            "tenantId": {"type": "keyword"},
            "tenantName": {"type": "keyword"},
            "slaStatus": {"type": "keyword"},
            "slaDueAt": {"type": "date"},
            "threatIntelMatched": {"type": "boolean"},
            "threatIntelSource": {"type": "keyword"},
            "threatIntelType": {"type": "keyword"},
            "threatIntelConfidence": {"type": "integer"},
            "relatedAlertCount": {"type": "integer"},
            "tags": {"type": "keyword"},
            "chainId": {"type": "keyword"},
        }}
    }
    
    es_request("PUT", f"/{index_name}", json.dumps(mapping))
    return index_name

def generate_alerts():
    """Main generator: produces 200 alerts across 3 tenants."""
    all_alerts = []  # list of (prefix, doc) tuples
    severity_idx = 0
    
    for tenant in TENANTS:
        prefix = tenant["prefix"]
        target_count = tenant["count"]
        chain_names = tenant["chains"]
        
        chain_alert_count = 0
        
        # Generate chain alerts
        for chain_name in chain_names:
            chain = ATTACK_CHAINS[chain_name]
            chain_id = f"chain-{prefix}-{chain_name}-{uuid.uuid4().hex[:6]}"
            
            for i, alert_tpl in enumerate(chain["alerts"]):
                if severity_idx >= len(SEVERITY_POOL):
                    severity_idx = 0
                sev = SEVERITY_POOL[severity_idx]
                severity_idx += 1
                
                # Chain alerts tend to be higher severity
                if chain_name in ["brute-force", "malware-delivery"]:
                    sev = max(sev, random.randint(5, 9))
                
                doc = build_alert(
                    severity=sev,
                    tenant=tenant,
                    entity_idx=i,
                    is_chain=True,
                    chain_type=chain_name,
                    alert_template=alert_tpl,
                    chain_id=chain_id,
                )
                all_alerts.append((prefix, doc))
                chain_alert_count += 1
        
        # Fill remaining with standalone alerts
        standalone_count = target_count - chain_alert_count
        for i in range(standalone_count):
            if severity_idx >= len(SEVERITY_POOL):
                severity_idx = 0
            sev = SEVERITY_POOL[severity_idx]
            severity_idx += 1
            
            doc = build_alert(
                severity=sev,
                tenant=tenant,
                entity_idx=i,
                is_chain=False,
                chain_type=None,
                alert_template=None,
            )
            all_alerts.append((prefix, doc))
    
    return all_alerts

def main():
    print("=== HiveArmor Realistic Alert Seeder (Sprint 38) ===\n")
    
    # Create indices
    print("Creating alert indices...")
    indices = {}
    for tenant in TENANTS:
        idx = create_index(tenant["prefix"])
        indices[tenant["prefix"]] = idx
        print(f"  Created: {idx}")
    
    # Generate all alerts
    print("\nGenerating 200 alerts...")
    all_alerts = generate_alerts()
    print(f"  Generated: {len(all_alerts)} alerts")
    
    # Verify severity distribution
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for _, doc in all_alerts:
        s = doc["severity"]
        if s >= 9: sev_counts["critical"] += 1
        elif s >= 7: sev_counts["high"] += 1
        elif s >= 4: sev_counts["medium"] += 1
        elif s >= 1: sev_counts["low"] += 1
        else: sev_counts["info"] += 1
    print(f"  Severity distribution: {sev_counts}")
    
    # Index in bulk (batch by tenant)
    print("\nIndexing alerts...")
    for prefix, idx_name in indices.items():
        tenant_alerts = [(p, doc) for p, doc in all_alerts if p == prefix]
        bulk_body = ""
        for _, doc in tenant_alerts:
            bulk_body += json.dumps({"index": {"_index": idx_name}}) + "\n"
            bulk_body += json.dumps(doc) + "\n"
        
        result = es_bulk(bulk_body)
        if result:
            indexed = len(result.get("items", []))
            print(f"  {prefix}: {indexed} alerts indexed to {idx_name}")
    
    # Refresh
    es_request("POST", "/v3-hive-alert-*/_refresh")
    
    # Verify counts
    print("\nVerification:")
    result = es_request("GET", "/v3-hive-alert-*/_count")
    if result:
        print(f"  Total documents: {result['count']}")
    
    for tenant in TENANTS:
        result = es_request("GET", f"/v3-hive-alert-{tenant['prefix']}-*/_count")
        if result:
            print(f"  {tenant['name']} ({tenant['prefix']}): {result['count']}")
    
    print("\nDone!")

if __name__ == "__main__":
    main()
