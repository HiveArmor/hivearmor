---
name: masriyan-incident-response
description: Advanced incident response — PICERL lifecycle (Preparation/Identification/Containment/Eradication/Recovery/Lessons Learned), ransomware/phishing playbooks, Volatility 3 memory forensics commands, cloud IR for AWS/Azure/GCP. Triggered by "memory forensics", "Volatility analysis", "cloud incident response", "ransomware IR", "PICERL lifecycle".
---

# Advanced Incident Response — PICERL Framework

PICERL: Preparation → Identification → Containment → Eradication → Recovery → Lessons Learned.

## Phase 1 — Preparation

Key deliverables that must exist before an incident:
- Asset inventory with criticality ratings
- IR team roster with 24/7 contact information
- Pre-approved containment authorities (who can isolate what)
- Jump bag: forensics toolkit, credentials for OOB comms
- Tabletop exercises at least twice yearly

## Phase 2 — Identification

```bash
# Initial triage — Windows host
wmic process list brief        # Running processes
netstat -anob                  # Network connections with PIDs
net user                       # Local accounts
net localgroup administrators  # Admin group members
schtasks /query /fo LIST       # Scheduled tasks
reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run  # Persistence

# Linux host
ps aux --forest                # Process tree
ss -tlnp                       # Listening services
lastlog                        # Recent logins
cat /etc/crontab && ls /etc/cron.*  # Cron jobs
find /tmp /var/tmp -perm -a+x -newer /tmp 2>/dev/null  # New executables
```

## Phase 3 — Containment

**DO NOT power off the system** — destroys volatile memory evidence (running processes, network connections, encryption keys in memory).

Instead:
1. Isolate via EDR (preferred — maintains logging)
2. Network segmentation at switch/firewall level
3. Capture memory image BEFORE any other action
4. Disable compromised accounts in AD/IdP

## Volatility 3 — Memory Forensics

```bash
# Get OS profile information
python3 vol.py -f memory.dmp windows.info

# List running processes (detect hidden processes)
python3 vol.py -f memory.dmp windows.pslist
python3 vol.py -f memory.dmp windows.pstree  # parent-child view

# Detect process injection (unusual memory permissions)
python3 vol.py -f memory.dmp windows.malfind  # finds injected shellcode

# Network connections at time of capture
python3 vol.py -f memory.dmp windows.netstat

# Extract command line history
python3 vol.py -f memory.dmp windows.cmdline

# Dump suspicious process
python3 vol.py -f memory.dmp windows.dumpfiles --pid <PID>

# Registry hives in memory
python3 vol.py -f memory.dmp windows.registry.hivelist
python3 vol.py -f memory.dmp windows.registry.printkey --key "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

# Linux memory
python3 vol.py -f memory.dmp linux.pslist
python3 vol.py -f memory.dmp linux.bash    # bash history from memory
```

## Ransomware Playbook

```
T+0:   Alert fires — analyst confirms file encryption
T+5:   Identify patient zero via endpoint/SIEM query
T+10:  CISO notification (P1 — active ransomware)
T+15:  Isolate affected systems via EDR
T+20:  Capture memory images (volatile evidence)
T+30:  Block C2 indicators at firewall
T+45:  Identify initial access vector
T+60:  Legal notification (if PII scope confirmed)
T+4h:  Begin backup restore assessment
T+72h: GDPR notification if personal data affected
```

## Cloud Incident Response

### AWS

```bash
# Identify potentially compromised IAM credentials
aws iam list-access-keys --user-name <user>
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=<user>

# Disable compromised IAM key (immediate containment)
aws iam update-access-key --access-key-id <key> --status Inactive

# Check for newly created resources (blast radius)
aws resourcegroupstaggingapi get-resources --tag-filters Key=CreatedBy,Values=<compromised-user>
```

### Azure

```bash
# Audit sign-in logs for compromised account
az monitor activity-log list --caller <UPN>

# Revoke sessions
az ad user revoke-signed-in-sessions --id <user-object-id>

# Check for new role assignments
az role assignment list --assignee <user-object-id>
```

### GCP

```bash
# Audit activity
gcloud logging read "protoPayload.authenticationInfo.principalEmail=<email>" --limit=50

# Disable service account
gcloud iam service-accounts disable <sa-email>
```

## Phase 6 — Lessons Learned

Within 2 weeks of incident closure:
1. Timeline reconstruction (when was intrusion? how long did it last?)
2. Root cause (what was the initial access vector?)
3. Detection gap (why wasn't it caught sooner?)
4. Response gap (what slowed containment?)
5. Control improvements (what would prevent recurrence?)

Blameless postmortem — focus on systemic improvement, not individual fault.
