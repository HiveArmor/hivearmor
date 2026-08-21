---
name: log-analysis
description: Security log analysis and SIEM query development — Windows Event IDs, Splunk SPL, Sentinel KQL, Elastic EQL, QRadar AQL, Sigma rules, anomaly detection, correlation rules. Triggered by "analyze these logs", "write SIEM query", "Windows Event ID", "detect brute force in logs", "log correlation".
---

# Log Analysis & SIEM Integration

## Windows Key Event IDs

| Event ID | Event | Detection Use |
|----------|-------|--------------|
| 4624 | Logon success | Lateral movement, impossible travel |
| 4625 | Logon failure | Brute force, credential stuffing |
| 4688 | Process creation | Execution, LOLBin abuse |
| 4698 | Scheduled task created | Persistence |
| 4720 | User account created | Privilege escalation |
| 4728 | Added to privileged group | Privilege escalation |
| 7045 | Service installed | PsExec, lateral movement |
| 4663 | File access | Data access, exfiltration |

## Splunk SPL — Common Detection Queries

```spl
# Brute Force Detection
index=security EventCode=4625
| bucket _time span=5m
| stats count by _time, src_ip, dest_user
| where count > 10
| sort -count

# Pass-the-Hash (PtH)
index=security EventCode=4624 Logon_Type=3 Authentication_Package=NTLM
| stats count by src_ip, dest_user, Logon_Type
| where count > 5

# DCSync Attack
index=security EventCode=4662
| where (Properties LIKE "%1131f6aa-9c07-11d1-f79f-00c04fc2dcd2%" 
       OR Properties LIKE "%1131f6ad-9c07-11d1-f79f-00c04fc2dcd2%")
| stats count by src_user, src_ip
```

## Elastic EQL — Sequence Detection

```eql
# Fileless Malware Chain
sequence by process.entity_id [
  process where process.parent.name == "winword.exe" and
    process.name in ("cmd.exe", "powershell.exe", "wscript.exe")
] [
  process where process.name == "powershell.exe" and
    process.command_line : "*-EncodedCommand*"
] [
  network where destination.port in (80, 443, 8080, 8443)
]

# Ransomware File Modification Chain
sequence by host.name [
  file where event.action == "creation" and
    file.extension in ("exe", "dll")
] [
  file where event.action == "deletion" and
    not file.extension in ("tmp", "log")
    [count] >= 100 within 1m
]
```

## Sentinel KQL — Azure/Entra Detection

```kql
// Impossible Travel
SigninLogs
| where ResultType == "0"
| extend City = tostring(LocationDetails.city)
| summarize by bin(TimeGenerated, 1h), UserPrincipalName, City, IPAddress
| join kind=inner (
    SigninLogs
    | extend City = tostring(LocationDetails.city)
    | summarize by bin(TimeGenerated, 1h), UserPrincipalName, City, IPAddress
) on UserPrincipalName
| where City != City1 and abs(datetime_diff('hour', TimeGenerated, TimeGenerated1)) < 2

// Azure AD Privilege Escalation
AuditLogs
| where OperationName has_any ("Add member to role", "Activate role")
| where TargetResources has_any ("Global Administrator", "Privileged Role Administrator")
| project TimeGenerated, InitiatedBy, TargetResources, Result
```

## Sigma Rules for Common Patterns

```yaml
title: Lateral Movement via Remote Service
tags:
    - attack.lateral_movement
    - attack.t1021.002
logsource:
    category: system
    product: windows
detection:
    selection:
        EventID: 7045
        ServiceName|contains: 'PSEXESVC'
    condition: selection
falsepositives:
    - Legitimate IT admin usage
level: high
```

## Anomaly Detection Patterns

Flag deviations across these categories:
1. **Volume spikes** — >3σ from 30-day baseline
2. **Off-hours activity** — events outside 06:00–22:00 local time
3. **New geographies** — authentication from country not seen in 90 days
4. **Novel processes** — process names not in approved baseline
5. **Large transfers** — >100MB data movement to external destinations
6. **Silent sources** — log sources that stopped reporting
7. **Unusual authentication** — service accounts logging in interactively

## Correlation Rule Template

```yaml
# Multi-event correlation: brute force → success → lateral movement
name: "BruteForce-Then-Lateral-Movement"
window: 30m
events:
  - type: authentication_failure
    count: ">= 10"
    group_by: [src_ip, dest_user]
  - type: authentication_success
    same: [src_ip, dest_user]
  - type: lateral_movement
    same: [dest_user]
    within: 10m after event[2]
severity: HIGH
```

## OpenSearch (HiveArmor) PPL Queries

```
# Top sources by alert count (last 24h)
source=_v3_hive_alerts-* 
| where @timestamp > 'now-24h'
| stats count() by rule.name
| sort -count()
| head 20

# Authentication failures by source IP
source=_v3_hive_logs-*
| where event.category = 'authentication' and event.outcome = 'failure'
| stats count() by source.ip
| where count() > 50
```
