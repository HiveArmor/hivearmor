---
name: siem-detection
description: SIEM detection engineering — log coverage audits, Sigma rule authoring, detection-as-code, ATT&CK tagging, tuning lifecycle, FP reduction. Triggered by "write a detection rule", "SIEM detection", "create a Sigma rule", "detection engineering", "tune this alert".
---

# SIEM Detection Engineering

## Core Methodology

### 1. Log Source Audit First
Before writing rules, map what you can actually observe. Common blind spots:
- Endpoint logs missing command-line arguments
- Cloud audit logs with "ReadOnly: true events filtered" — pre-attack recon invisible
- No SaaS audit log collection

### 2. Match Detection Model to Threat

| Threat Type | Approach |
|---|---|
| Known IOC | Threat-intel lookup |
| Known pattern | Signature rule |
| Behavioral anomaly | Statistical detection |
| Event sequence | Correlation rule |

### 3. Sigma Rule Authoring

Sigma is the cross-SIEM source of truth — write once, convert to KQL/SPL/ES|QL:

```yaml
title: Lateral Movement via PsExec
status: experimental
description: Detects PsExec remote service creation indicating lateral movement
author: HiveArmor Detection Team
date: 2024/01/01
references:
    - https://attack.mitre.org/techniques/T1021/002/
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
    - Legitimate administrative PsExec usage by IT staff
level: high
```

Every rule requires:
- ATT&CK technique tags
- Description, references, and false-positive notes (these fields ARE the runbook)
- `falsepositives:` entry with at least one realistic scenario

### 4. Tuning Lifecycle

1. Deploy as `experimental` status
2. Review every alert for ~2 weeks
3. Key signal: "if FPs > 80% after tuning, the detection model is wrong"
4. Promote to `test` then `stable` after validation

### 5. Detection-as-Code

Rules live in Git with CI validation:
- Syntax checks
- ATT&CK tag verification
- Backend translation tests
- Deployment via SIEM API
- Rollback via Git revert

## HiveArmor OpenSearch Detection Patterns

```python
# Correlation rule targeting OpenSearch _v3_hive_ indexes
GET _v3_hive_alerts-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "rule.technique.id": "T1021.002" } },
        { "range": { "@timestamp": { "gte": "now-1h" } } }
      ]
    }
  },
  "aggs": {
    "by_host": {
      "terms": { "field": "host.name.keyword" }
    }
  }
}
```

## ATT&CK Coverage Tracking

Maintain coverage matrix per data source:
- Windows Security Events → Credential Access, Lateral Movement
- Sysmon → Execution, Defense Evasion, Persistence
- Network flow → Exfiltration, C2, Discovery
- Cloud audit → Privilege Escalation, Collection

## Boundaries

- Only write detections for authorized environments
- Rules must include analyst context to avoid alert fatigue
- Employee surveillance beyond HR/legal approval is out of scope
