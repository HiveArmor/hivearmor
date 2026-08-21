---
name: alert-triage-elastic
description: Alert triage workflow for Elastic SIEM — 5-stage process (assessment/context/enrichment/classification/documentation), ES|QL queries, TP/FP/BTP classification, AI Attack Discovery. Triggered by "triage Elastic alert", "Elastic SIEM triage", "ES|QL triage query", "Elastic Security alert".
---

# Alert Triage with Elastic SIEM

Systematic alert review structured triage workflow: ~5–10 minutes per alert cluster.

## Five-Stage Triage Workflow

| Stage | Time | Focus |
|---|---|---|
| Initial Assessment | 2 min | Severity, risk score, MITRE mapping |
| Context Gathering | 3 min | ES|QL queries for related events |
| Threat Intel Enrichment | 2 min | IOC matching via `logs-ti_*` |
| Classification | 2 min | TP / FP / Needs Investigation |
| Documentation | 1 min | Rationale, artifacts, next steps |

## Stage 1 — Initial Assessment

```esql
// Get alert context
FROM .alerts-security.alerts-default
| WHERE kibana.alert.uuid == "<alert-uuid>"
| KEEP kibana.alert.rule.name, kibana.alert.severity, kibana.alert.risk_score,
       kibana.alert.workflow_status, event.action, host.name, user.name
```

## Stage 2 — Context Gathering (ES|QL)

```esql
// Find related events for same host in last 1 hour
FROM logs-*
| WHERE host.name == "<hostname>"
  AND @timestamp >= NOW() - 1 HOUR
| STATS count = COUNT() BY event.category, event.action, process.name
| SORT count DESC

// Authentication history for user
FROM logs-*
| WHERE user.name == "<username>"
  AND event.category == "authentication"
  AND @timestamp >= NOW() - 24 HOURS
| KEEP @timestamp, event.outcome, source.ip, source.geo.country_name
| SORT @timestamp DESC
```

## Stage 3 — Threat Intel Enrichment

```esql
// Match alert IOCs against threat intel
FROM logs-ti_*
| WHERE threat.indicator.type == "ip-addr"
  AND threat.indicator.ip == "<suspicious-ip>"
| KEEP threat.feed.name, threat.indicator.confidence, threat.indicator.description
```

## Classification Categories

| Classification | Action | Notes |
|---------------|--------|-------|
| True Positive (TP) | Escalate → create incident → contain | Document IOCs and timeline |
| Benign True Positive (BTP) | Acknowledge, document | Alert is correct but activity is authorized |
| False Positive (FP) | Mark FP → create tuning task | Specify exact suppression criteria |
| Needs Investigation | Assign to senior analyst | Cannot determine in triage timeframe |

## Stage 5 — Documentation Template

```markdown
**Alert ID:** [UUID]
**Rule:** [rule name]
**Classification:** [TP/FP/BTP/Needs Investigation]
**Analyst:** [name] | **Time:** [ISO timestamp]

**Verdict rationale:**
[2-3 sentences explaining classification decision]

**Key evidence:**
- [field=value that confirmed verdict]

**IOCs (if TP):**
- IP: [value] | Domain: [value] | Hash: [value]

**Next steps:**
- [ ] [action required]
```

## AI Attack Discovery (Elastic 8.x+)

Attack Discovery automatically groups alerts into attack chains and provides narrative summary of the attack, reducing analyst workload:

- Navigate to: Security → Attack Discovery
- Review AI-generated attack narrative
- Validate chain logic before acting
- One-click incident creation from confirmed chains

## Key Triage Metrics

| Metric | Target |
|--------|--------|
| MTTT (Mean Time to Triage) | < 10 minutes |
| False Positive Rate | < 30% |
| Escalation Rate (P1) | < 5% of total alerts |
