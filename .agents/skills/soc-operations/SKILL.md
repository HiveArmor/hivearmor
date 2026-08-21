---
name: soc-operations
description: SOC operations — staffing models, alert priority triage, shift handoffs, runbook management, key metrics (MTTR, TP rate, alert fatigue thresholds). Triggered by "SOC operations", "alert fatigue", "SOC metrics", "shift handoff", "analyst workflow".
---

# SOC Operations

## Three Operational Modes: Build, Run, Improve

### Build

Staffing requirements for true 24/7 coverage:
- **Minimum 6–7 analysts** to absorb PTO and prevent burnout
- Three models: fully in-house, fully outsourced (MSSP), or hybrid (most common for growth-stage)
- Tier structure: T1 triages, T2 investigates, T3 engineers and leads response
- "For small SOCs (≤ 4 analysts), tiers collapse" — don't simulate tiers that don't exist

### Run

Alert priority flow:
1. Confirmed compromise
2. Credential access indicators
3. Persistence mechanisms
4. Anomalous behavior
5. Informational

Every alert firing more than a few times warrants a dedicated runbook covering:
- Triage steps
- FP/TP handling
- Escalation paths

Shift handoffs must be **written**, covering:
- Open cases
- Watch items
- Tuning status
- Anything deliberately deprioritized

### Improve

Key metrics:

| Metric | Target |
|--------|--------|
| MTTR (Critical) | < 15 min |
| TP rate per rule | > 30% |
| Alerts per analyst/shift | < 25 |
| Runbook coverage | > 80% of alert volume |

Core tuning loop:
1. Weekly review of high-volume rules
2. Assess TP rate
3. Tune or retire
4. Document every retirement

## Alert Fatigue Warning Signs

- Analysts closing tickets in under 30 seconds
- Repeated ignored alerts without documented suppression
- Analyst turnover exceeding 25% annually

## HiveArmor-Specific SOC Workflow

```
Alert fires in OpenSearch → Backend tags alert (30s worker) 
→ SOC analyst sees alert in HiveArmor UI 
→ Triage via incident panel 
→ SOAR playbook auto-response (if configured) 
→ Incident creation / closure 
→ Audit trail logged (required)
```

## Runbook Template

```markdown
# Alert: [Rule Name]
## Description: [What triggers this alert]
## Data Source: [Log source, OpenSearch index]
## ATT&CK: [Txxxx.NNN]

### Triage Steps
1. Check [field] for [expected value]
2. Pivot to [related log source] via [join field]
3. Determine if [FP scenario A] or [FP scenario B]

### FP Handling
- [FP condition]: Close with comment "[reason]"

### TP Escalation
- Severity [HIGH/CRITICAL]: Create incident, notify T3 immediately
- Severity [MEDIUM]: Create incident, follow standard workflow

### Tuning Notes
- [Date]: [What was tuned and why]
```
