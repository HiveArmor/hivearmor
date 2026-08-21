---
name: detection-engineering
description: SIEM detection rule authoring — CEL rules for HiveArmor event-processor, Sigma format, MITRE ATT&CK mapping, false-positive tuning, OCSF detection-as-code. Use when writing or reviewing detection rules.
metadata:
  type: skill
  source: Masriyan/Codex-CyberSecurity-Skill + briiirussell/cybersecurity-skills (adapted)
---

# Detection Engineering — HiveArmor

## When This Skill Applies
- Writing rules in `event-processor/rules/` or `event-processor/pipeline/`
- Authoring new correlation logic in any plugin under `plugins/`
- Reviewing existing detection coverage vs MITRE ATT&CK
- False-positive investigation and tuning

## CEL Rule Structure (HiveArmor Engine)
```yaml
# File: event-processor/rules/<id>_<name>.yaml
id: HA-DET-001
name: "Brute Force Authentication"
description: "Detects repeated authentication failures from same source"
mitre:
  tactic: "Credential Access"
  technique: "T1110"
  subtechnique: "T1110.001"
severity: high
enabled: true

# CEL where clause — evaluated against each event
# Available fields: event.type, event.source, event.message, event.timestamp,
#                   event.user, event.host, event.ip, event.count, event.tags
where: >
  event.type == "auth_failure" &&
  event.count > 5 &&
  event.time_window_seconds <= 300

# Correlation window
correlation:
  window: 300s
  group_by: [event.source_ip, event.user]
  threshold: 5

# Output alert fields
alert:
  name: "Brute Force Detected - {event.user}@{event.host}"
  severity: high
  category: "authentication"
  reference: "https://attack.mitre.org/techniques/T1110/"
```

## CEL Operators Available (HiveArmor custom operators)
Read `event-processor/rules/cel_where.go` and `operators/` to verify current list:
- String: `contains`, `startsWith`, `endsWith`, `matches` (regex)
- List: `in`, `hasAny`, `hasAll`
- Numeric: `>`, `<`, `>=`, `<=`, `==`, `!=`
- Time: `within`, `before`, `after`
- IP: `inCIDR`, `isPrivate`, `isPublic`
- Logical: `&&`, `||`, `!`

## MITRE ATT&CK Coverage Mapping
Map every new rule to ATT&CK before writing it:

| Tactic | Key Techniques to Cover |
|---|---|
| Initial Access | T1190 (exploit public app), T1133 (VPN), T1566 (phishing) |
| Execution | T1059 (command/scripting), T1204 (user execution) |
| Persistence | T1053 (scheduled task), T1098 (account manipulation) |
| Credential Access | T1110 (brute force), T1003 (credential dump), T1555 |
| Lateral Movement | T1021 (remote services: RDP, SSH, SMB) |
| Exfiltration | T1041 (C2 channel), T1048 (alt protocol) |
| Collection | T1005 (local data), T1114 (email collection) |

## False Positive Tuning Framework
Before shipping a rule, evaluate:
1. **Baseline**: What's the normal rate of this event type? Query last 30 days.
2. **Exclusions**: Scheduled tasks, known admin tools, authorized scanners
3. **Threshold calibration**: Set initial threshold at P95 of baseline + 20%
4. **Suppression**: Group by `[source_ip, user]` — suppress duplicate alerts within 1h

```yaml
# Exclusion pattern
where: >
  event.type == "auth_failure" &&
  event.count > 5 &&
  !(event.source_ip in ["10.10.1.50", "10.10.1.51"]) &&  # authorized scanners
  !(event.user in ["svc_backup", "svc_monitoring"])        # service accounts
```

## Detection Quality Checklist
- [ ] MITRE tactic + technique assigned
- [ ] Severity matches technique impact (credential dump = critical, not medium)
- [ ] Correlation window specified (not point-in-time)
- [ ] Group-by fields prevent alert flood from single source
- [ ] Reference URL to ATT&CK or CVE included
- [ ] Tested against sample events before enabling
- [ ] False positive threshold validated against 7-day baseline

## Sigma Rule Format (for portability)
When writing rules that should also work in other SIEMs:
```yaml
title: Brute Force Authentication
status: stable
description: Detects repeated auth failures
logsource:
  category: authentication
detection:
  selection:
    EventID: 4625
  timeframe: 5m
  condition: selection | count() by TargetUserName > 10
falsepositives:
  - Authorized pen tests
  - Password sync tools
level: high
tags:
  - attack.credential_access
  - attack.t1110
```
Convert Sigma → HiveArmor CEL using the operators mapping above.
