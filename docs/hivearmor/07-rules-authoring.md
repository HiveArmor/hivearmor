# HiveArmor — Correlation Rules Authoring Guide

**Audience:** Security Engineers, Threat Detection Authors  
**Version:** v1.x

---

## Table of Contents

1. [Overview](#1-overview)
2. [How Rules Work](#2-how-rules-work)
3. [Rule Schema Reference](#3-rule-schema-reference)
4. [CEL Expression Reference](#4-cel-expression-reference)
5. [Correlation Operators](#5-correlation-operators)
6. [Tutorial: Writing Your First Rule](#6-tutorial-writing-your-first-rule)
7. [Rule Testing Workflow](#7-rule-testing-workflow)
8. [Deploying Rules](#8-deploying-rules)
9. [MITRE ATT&CK Reference](#9-mitre-attck-reference)
10. [Rule Cookbook (Common Patterns)](#10-rule-cookbook-common-patterns)

---

## 1. Overview

Correlation rules define the conditions under which the event processor generates an alert. Rules are YAML files in the `rules/` directory:

```
rules/
├── linux/          Linux-specific rules
├── windows/        Windows-specific rules  
├── macos/          macOS-specific rules
├── cloud/          AWS, Azure, GCP rules
├── cisco/          Cisco device rules
├── crowdstrike/    CrowdStrike rules
├── fortinet/       FortiGate rules
├── generic/        Cross-source generic rules
├── ibm/            IBM QRadar / AS400 rules
├── json/           JSON source rules
├── macos/          macOS rules
├── mikrotik/       MikroTik rules
├── netflow/        NetFlow anomaly rules
├── nids/           NIDS (Suricata) rules
├── office365/      Office 365 rules
├── paloalto/       Palo Alto rules
├── pfsense/        pfSense rules
├── sonicwall/      SonicWall rules
├── sophos/         Sophos rules
└── linux-brute-force.yaml   (example top-level rule)
```

---

## 2. How Rules Work

1. The event processor continuously evaluates incoming (and historical) events against all active rules
2. When a `where` clause matches an event, the correlation check begins
3. The `correlation` block specifies the evidence required (how many matching events within a time window)
4. When the correlation threshold is met, an alert is generated and indexed into OpenSearch
5. Duplicate suppression is applied via `deduplicateBy` to avoid alert storms
6. The alert severity is computed from the `impact` scores (confidentiality + integrity + availability)

### Alert severity mapping

| Total impact score | Severity |
|---|---|
| 1–3 | Low |
| 4–6 | Medium |
| 7–9 | High |
| 10–12 | Critical |

---

## 3. Rule Schema Reference

```yaml
# Minimal required fields
- id: 2001                      # Unique integer ID (never reuse)
  name: "Linux: SSH Brute Force" # Human-readable rule name
  dataTypes:                    # Log sources this rule applies to
    - linux
  category: "Credential Access" # MITRE tactic name
  technique: "T1110"            # MITRE technique ID
  adversary: "origin"           # Who is attacking: "origin" or "destination"
  description: "..."            # What this rule detects
  where: |                      # CEL filter: which events can trigger this rule
    contains("log.message", "Failed password")
  impact:                       # Severity scoring (1-4 each; sum = severity)
    confidentiality: 2
    integrity: 1
    availability: 1
```

### Full schema with all optional fields

```yaml
- id: 2001
  name: "Linux: SSH Brute Force Attack"
  dataTypes:
    - linux
  category: "Credential Access"
  technique: "T1110"
  adversary: "origin"            # "origin" | "destination" — which entity is the attacker
  description: "Multiple failed SSH login attempts from the same source IP within 5 minutes."
  references:                    # Optional: MITRE URLs, CVEs, blog posts
    - "https://attack.mitre.org/techniques/T1110/"
  where: |
    contains("log.message", "Failed password") && safe("origin.ip", "") != ""
  correlation:                   # Optional: require N events to fire
    - indexPattern: "v11-log-linux-*"    # OpenSearch index pattern to search
      with:
        - field: "origin.ip"             # Group events by this field
          operator: filter_match         # See correlation operators below
          value: "{{.origin.ip}}"        # Template using trigger event's field value
        - field: "log.action"
          operator: filter_match
          value: "failed"
      within: "5m"               # Time window (5m, 1h, 24h, etc.)
      count: 5                   # Minimum event count to fire the alert
  deduplicateBy:                 # Prevent duplicate alerts for the same attacker
    - "adversary.ip"
  groupBy:                       # Group correlated events by these fields
    - "adversary.ip"
    - "origin.user"
  impact:
    confidentiality: 2           # 1 (low) to 4 (critical)
    integrity: 1
    availability: 1
```

---

## 4. CEL Expression Reference

The `where` clause uses CEL (Common Expression Language). See [Parser Authoring Guide §5](06-parser-authoring.md#5-cel-where-clause-syntax) for the full reference.

### Common where patterns for rules

```yaml
# Match a specific log message substring
where: 'contains("log.message", "Failed password")'

# Match a Windows Event ID
where: 'log.eventId == "4625"'

# Match multiple event IDs
where: 'log.eventId == "4625" || log.eventId == "4771"'

# Match and require a field to exist
where: 'exists("origin.ip") && contains("log.message", "sudo")'

# Regex match
where: 'regexMatch("log.message", "COMMAND=(/bin/bash|/bin/sh)")'

# Field comparison with safe fallback
where: 'safe("log.action", "") == "denied" && safe("destination.port", "0") == "22"'

# Check for failed action (case-insensitive via lowercase)
where: 'contains("log.action", "fail") || contains("log.message", "authentication failure")'
```

---

## 5. Correlation Operators

Used in `correlation[*].with[*].operator`:

| Operator | Description |
|---|---|
| `filter_match` | The field value exactly matches the given value (or template) |
| `filter_not_match` | The field value does NOT match the given value |
| `filter_contains` | The field value contains the given string |
| `filter_range` | The field value falls within a numeric range (use with min/max) |

### Template syntax

Values can reference fields from the **triggering event** using Go template syntax:

```yaml
value: "{{.origin.ip}}"        # Use the origin.ip from the event that triggered the where clause
value: "{{.log.eventId}}"      # Use a specific event ID
value: "{{.origin.user}}"      # Use the username
```

This allows correlation rules to group events by the same attacker IP, user, etc.

---

## 6. Tutorial: Writing Your First Rule

**Goal:** Detect when a Windows user account is added to the Administrators group (Event ID 4732).

### Step 1: Identify the relevant log

Look at the field schema for Windows events. Event ID 4732 = "A member was added to a security-enabled local group". The key fields are:
- `log.eventId`: `"4732"`
- `log.eventDataSubjectUserName`: the admin who performed the action
- `log.eventDataMemberName`: the account added to the group
- `log.eventDataGroupName`: the group name

### Step 2: Write the rule

```yaml
# rules/windows/privilege_escalation.yml

- id: 3001
  name: "Windows: User Added to Administrators Group"
  dataTypes:
    - wineventlog
  category: "Privilege Escalation"
  technique: "T1078.003"
  adversary: "origin"
  description: "A user account was added to a local Administrators group. This may indicate privilege escalation or unauthorized administrative access."
  references:
    - "https://attack.mitre.org/techniques/T1078/003/"
    - "https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/event-4732"
  where: |
    log.eventId == "4732" && safe("log.eventDataGroupName", "") != ""
  impact:
    confidentiality: 3
    integrity: 4
    availability: 2
```

This is a **stateless rule** — it fires on every single matching event (no correlation window needed, because any single occurrence is notable).

### Step 3: Add correlation (optional)

If you only want to alert when it happens repeatedly (to reduce noise), add a correlation block:

```yaml
  correlation:
    - indexPattern: "_v3_hive_log-wineventlog-*"
      with:
        - field: "log.eventDataSubjectUserName"
          operator: filter_match
          value: "{{.log.eventDataSubjectUserName}}"
        - field: "log.eventId"
          operator: filter_match
          value: "4732"
      within: "10m"
      count: 3
  deduplicateBy:
    - "origin.user"
```

### Step 4: Test and deploy (see Sections 7 and 8)

---

## 7. Rule Testing Workflow

### Step 1: Validate YAML syntax

```bash
python3 -c "
import yaml, sys
with open('rules/windows/privilege_escalation.yml') as f:
    rules = yaml.safe_load(f)
print(f'OK: {len(rules)} rule(s) loaded')
for r in rules:
    assert 'id' in r, 'missing id'
    assert 'name' in r, 'missing name'
    assert 'where' in r, 'missing where clause'
    print(f'  Rule {r[\"id\"]}: {r[\"name\"]}')
"
```

### Step 2: Inject test events

Use the event processor inject endpoint to send a synthetic event that should trigger the rule:

```bash
INJECT_KEY="<your EVENTPROCESSOR_INJECT_KEY value>"

# Inject a Windows 4732 event
curl -X POST http://localhost:8090/v1/inject \
  -H "X-Inject-Key: $INJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "wineventlog",
    "raw": "{\"winlog\":{\"event_id\":4732,\"record_id\":12345},\"message\":\"A member was added to a security-enabled local group. Subject: Security ID: S-1-5-21-... Account Name: jdoe Group Name: Administrators\"}"
  }'
```

### Step 3: Check for the generated alert

```bash
# Wait 30 seconds for correlation to run, then check OpenSearch
curl -sk "https://localhost:9200/_v3_hive_alert-*/_search" \
  -u "admin:<PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"size":5,"sort":[{"@timestamp":"desc"}],"query":{"match":{"name":"Windows: User Added"}}}' \
  | python3 -m json.tool
```

### Step 4: Check for false positives

Inject events that should NOT trigger the rule and confirm no alert is generated:

```bash
# This should not trigger (event ID 4724, not 4732)
curl -X POST http://localhost:8090/v1/inject \
  -H "X-Inject-Key: $INJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dataType": "wineventlog", "raw": "{\"winlog\":{\"event_id\":4724}}"}'
```

---

## 8. Deploying Rules

Rules in `rules/` are automatically synced to the event processor by the backend pipeline sync worker (every 20 seconds).

```bash
# Add your rule file
cp my_new_rules.yml rules/windows/

# The backend picks it up and pushes to the event processor automatically
# Confirm in logs
docker compose logs backend --tail=20 | grep -i "pipeline\|sync\|rule"
docker compose logs eventprocessor --tail=20 | grep -i "rule\|reload"
```

### Manual force-push

```bash
# Via backend API (requires admin token)
curl -X POST http://localhost:8088/api/ha-event-processor/sync-rules \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. MITRE ATT&CK Reference

Common tactics and techniques used in rules:

| Tactic | Category Value | Example Techniques |
|---|---|---|
| Initial Access | `Initial Access` | T1078 (Valid Accounts), T1190 (Exploit Public App) |
| Execution | `Execution` | T1059 (Command Interpreter), T1053 (Scheduled Task) |
| Persistence | `Persistence` | T1098 (Account Manipulation), T1547 (Boot Autostart) |
| Privilege Escalation | `Privilege Escalation` | T1548 (Abuse Elevation), T1078.003 (Local Accounts) |
| Defense Evasion | `Defense Evasion` | T1562 (Impair Defenses), T1027 (Obfuscated Files) |
| Credential Access | `Credential Access` | T1110 (Brute Force), T1003 (Credential Dumping) |
| Discovery | `Discovery` | T1046 (Network Scan), T1082 (System Info Discovery) |
| Lateral Movement | `Lateral Movement` | T1021 (Remote Services), T1550 (Pass the Hash) |
| Collection | `Collection` | T1005 (Local Data), T1114 (Email Collection) |
| Exfiltration | `Exfiltration` | T1041 (Exfil over C2), T1048 (Exfil over Protocol) |
| Command and Control | `Command and Control` | T1071 (App Layer Protocol), T1105 (Ingress Tool Transfer) |
| Impact | `Impact` | T1486 (Data Encrypted), T1498 (DoS) |

---

## 10. Rule Cookbook (Common Patterns)

### Brute force (threshold over time window)

```yaml
- id: 4001
  name: "SSH Brute Force"
  dataTypes: [linux]
  category: "Credential Access"
  technique: "T1110"
  adversary: "origin"
  description: "5+ failed SSH logins from the same IP within 5 minutes"
  where: 'contains("log.message", "Failed password") && safe("origin.ip","") != ""'
  correlation:
    - indexPattern: "_v3_hive_log-linux-*"
      with:
        - field: "origin.ip"
          operator: filter_match
          value: "{{.origin.ip}}"
        - field: "log.action"
          operator: filter_match
          value: "failed"
      within: "5m"
      count: 5
  deduplicateBy: ["origin.ip"]
  impact: {confidentiality: 2, integrity: 1, availability: 1}
```

### Success after failure (compromise indicator)

```yaml
- id: 4002
  name: "Successful Login After Multiple Failures"
  dataTypes: [linux]
  category: "Credential Access"
  technique: "T1110.001"
  adversary: "origin"
  description: "Successful SSH login after repeated failures — possible successful brute force"
  where: 'contains("log.message", "Accepted password") || contains("log.message", "Accepted publickey")'
  correlation:
    - indexPattern: "_v3_hive_log-linux-*"
      with:
        - field: "origin.ip"
          operator: filter_match
          value: "{{.origin.ip}}"
        - field: "log.message"
          operator: filter_contains
          value: "Failed password"
      within: "15m"
      count: 3
  impact: {confidentiality: 3, integrity: 2, availability: 1}
```

### Single event, always alert (no correlation)

```yaml
- id: 4003
  name: "Ransomware File Extension Detected"
  dataTypes: [wineventlog]
  category: "Impact"
  technique: "T1486"
  adversary: "origin"
  description: "A file with a common ransomware extension was created or accessed"
  where: 'regexMatch("log.message", "\\.(locky|ryuk|cerber|wannacry|crypt)$")'
  impact: {confidentiality: 4, integrity: 4, availability: 4}
```

### Geographic anomaly

```yaml
- id: 4004
  name: "Login from High-Risk Country"
  dataTypes: [wineventlog, linux]
  category: "Initial Access"
  technique: "T1078"
  adversary: "origin"
  description: "Successful login from a high-risk geographic region"
  where: |
    (contains("log.message", "Accepted") || log.eventId == "4624") &&
    (safe("origin.geo.country", "") == "North Korea" ||
     safe("origin.geo.country", "") == "Iran")
  impact: {confidentiality: 3, integrity: 2, availability: 1}
```

### Privilege escalation via sudo

```yaml
- id: 4005
  name: "Linux: Privilege Escalation via sudo"
  dataTypes: [linux]
  category: "Privilege Escalation"
  technique: "T1548.003"
  adversary: "origin"
  description: "A user executed a privileged command via sudo"
  where: 'contains("log.message", "sudo:") && contains("log.message", "COMMAND=")'
  groupBy: ["origin.user", "origin.ip"]
  impact: {confidentiality: 2, integrity: 3, availability: 1}
```
