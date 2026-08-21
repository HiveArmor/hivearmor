---
name: threat-hunting
description: Proactive threat hunting — PEAK framework (Prepare/Execute/Act/Knowledge), hypothesis formation, hunt playbooks, pivot patterns, high-yield hunt areas (persistence, credential access, lateral movement, exfil). Triggered by "threat hunt", "proactive detection", "hunt for adversary", "PEAK framework".
---

# Threat Hunting — Proactive Adversary Detection

## Core Concept

Threat hunting is **hypothesis-driven**, not exploratory browsing. The goal is finding adversaries already inside who haven't triggered alerts.

## PEAK Framework (Splunk SURGe)

### Prepare

Strong hypothesis properties:
- **Specific** — names a technique, log source, and expected artifact
- **Testable** — defines confirming/denying evidence
- **Bounded** — scoped to a defined time window

Top hypothesis sources by yield:

| Source | Yield |
|--------|-------|
| Recent incident (yours or peer's) | High |
| ATT&CK technique without existing detection | Medium |
| Threat intel reports | Medium |
| Anomaly investigation | Low |

### Execute

Three patterns:
1. **Pivot from indicator** — start with an IOC, find who touched it
2. **Pivot from technique** — start with ATT&CK technique, find hosts doing it
3. **Anomaly hunt** — baseline first, then surface outliers

### Act

Every hit resolves to one of three outcomes:

| Outcome | Action |
|---------|--------|
| Confirmed malicious | Escalate to incident triage immediately |
| Confirmed benign | Document and move on |
| Unknown | Deepen investigation |

### Knowledge

"Hunts that don't produce artifacts are work without compounding return."

Every hunt yields either:
- A detection rule
- A documented negative result
- A coverage gap backlog item

## High-Yield Hunt Areas

### Persistence
- Scheduled tasks created outside business hours
- Registry Run key writes
- WMI `__EventFilter` / `CommandLineEventConsumer` subscriptions

### Defense Evasion
- PowerShell with `-EncodedCommand` (base64-encoded scripts)
- Process execution from `%TEMP%`, `%APPDATA%`, `\Users\Public`
- `certutil.exe -decode` (LOLBin payload decoding)

### Credential Access
- LSASS access from unexpected processes (Sysmon EventCode 10)
- NTDS.dit access outside backup windows

### Lateral Movement
- WMI execution to remote hosts
- PsExec / remote service creation (EventCode 7045)
- SSH key reuse across many hosts in a short window

### Collection / Exfil
- Regular-interval outbound connections — beaconing patterns
- Archive creation outside user home directories
- DNS queries to recently-registered domains

### Cloud
- IMDS access (`169.254.169.254`) from unexpected processes
- CloudTrail `StopLogging` / `DeleteTrail` attempts
- Cross-region resource creation in a short window by one principal

## Key Tools

- **SIEM:** Splunk, Sentinel, Elastic, Chronicle / HiveArmor OpenSearch
- **EDR:** CrowdStrike, SentinelOne, Defender for Endpoint
- **Endpoint:** Sysmon, osquery, Velociraptor
- **Network:** Zeek
- **Coverage:** MITRE ATT&CK Navigator

## Hunt Report Template

```markdown
# Threat Hunt Report
## Hunt name: [descriptive label]
## Hypothesis: [specific, testable, bounded]
## Date range: [from - to]
## Hunter: [name]

### Methodology
- ATT&CK technique(s): [TXXXX.NNN]
- Data sources queried: [list]
- Query: [actual SIEM query]

### Findings
| Hit ID | Host / User / Resource | Outcome | Notes |

### Conclusion
- [Confirmed malicious / All benign / Inconclusive]
- [Confidence: Low / Medium / High]

### Artifacts produced
- [ ] Detection rule added
- [ ] Coverage gap documented
- [ ] Negative-result documentation filed
```

## HiveArmor OpenSearch Hunt Queries

```json
// Beaconing pattern: same destination, regular intervals
{
  "aggs": {
    "by_dest": {
      "terms": { "field": "destination.ip" },
      "aggs": {
        "intervals": {
          "date_histogram": {
            "field": "@timestamp",
            "fixed_interval": "5m"
          }
        }
      }
    }
  }
}
```

## Boundaries

- Hunt only within authorized environments
- Confirmed-malicious findings → escalate immediately; don't continue hunting
- Live response actions (isolation, account disablement) belong to incident response
- Negative results are valid, documentable outcomes — not failure
