---
name: csoc-automation
description: SOC operations automation — alert triage matrix, SOAR playbook generation (Splunk SOAR/XSOAR/TheHive YAML), escalation workflows (P1-P4), shift handover reports, SOC metrics (MTTD/MTTR/FPR). Triggered by "SOC automation", "SOAR playbook", "alert triage automation", "shift handover", "SOC metrics dashboard".
---

# CSOC Operations & Playbook Automation

## Alert Triage Matrix

Four-step process: parse → asset criticality → threat enrichment → matrix decision

| Confidence | Critical Asset | High Asset | Medium Asset | Low Asset |
|-----------|---------------|-----------|--------------|-----------|
| High | P1 (15 min) | P1 (15 min) | P2 (1 hour) | P3 (4 hours) |
| Medium | P1 (15 min) | P2 (1 hour) | P3 (4 hours) | P4 (24 hours) |
| Low | P2 (1 hour) | P3 (4 hours) | P4 (24 hours) | P4 (24 hours) |

## SOAR Playbook Templates

### Phishing Response Playbook (SOAR YAML)

```yaml
name: phishing-response
version: "3.0"
trigger:
  type: alert
  conditions:
    - field: rule.category
      value: phishing

steps:
  - id: extract-iocs
    type: automation
    action: extract_email_artifacts
    inputs:
      email_id: "{{alert.email_id}}"

  - id: check-threat-intel
    type: automation
    action: query_threat_intel
    inputs:
      iocs: "{{extract-iocs.urls}}"

  - id: block-decision
    type: human_approval  # irreversible actions require explicit human approval
    prompt: "Block sender domain {{extract-iocs.domain}}?"
    timeout: 15m

  - id: block-sender
    type: automation
    condition: "{{block-decision.approved}}"
    action: block_email_sender
    inputs:
      domain: "{{extract-iocs.domain}}"

  - id: notify-user
    type: automation
    action: send_notification
    inputs:
      recipient: "{{alert.recipient_email}}"
      template: phishing_user_notification
```

### Ransomware Response Playbook

```yaml
name: ransomware-response
version: "3.0"
severity: critical

steps:
  - id: isolate-host
    type: human_approval
    prompt: "Isolate host {{alert.hostname}} from network?"

  - id: network-isolation
    type: automation
    condition: "{{isolate-host.approved}}"
    action: edr_isolate_host
    inputs:
      hostname: "{{alert.hostname}}"

  - id: snapshot-forensics
    type: automation
    action: create_forensic_snapshot
    inputs:
      hostname: "{{alert.hostname}}"

  - id: notify-ir-team
    type: automation
    action: page_incident_response
    inputs:
      severity: P1
      message: "Ransomware detected on {{alert.hostname}}"
```

## Escalation Workflows

| Priority | SLA | Notification |
|---------|-----|-------------|
| P1 | 15 min | Phone + Slack + Email to IR team |
| P2 | 1 hour | Slack + Email to analyst |
| P3 | 4 hours | Slack to queue |
| P4 | 24 hours | Ticket only |

### Slack Template

```
🚨 *P{{priority}} Security Alert*
*Rule:* {{rule.name}}
*Host:* {{alert.hostname}} ({{asset.criticality}})
*Time:* {{alert.timestamp}}
*Analyst:* {{assigned_analyst}}
*Ticket:* <{{ticket.url}}|{{ticket.id}}>
```

## Shift Handover Report

```markdown
# SOC Shift Handover — {{shift_date}} {{shift_time}}
**Outgoing Analyst:** [name] | **Incoming Analyst:** [name]

## Alert Volume (This Shift)
- Total alerts: [N]
- True positives: [N]
- False positives: [N]
- FP Rate: [N]%

## Open Incidents
| ID | Severity | Status | Summary | Owner |

## Ongoing Watches
[List items being actively monitored]

## Tool Issues
[Any SIEM/EDR/firewall issues affecting coverage]

## Actions Required by Incoming Analyst
- [ ] [Specific pending task]
```

## SOC Metrics Targets

| Metric | Target |
|--------|--------|
| MTTD (Mean Time to Detect) | < 1 hour |
| MTTR (Mean Time to Respond) | < 15 min (P1) |
| False Positive Rate | < 20% |
| SLA Compliance | > 95% |

## Critical Safeguard

**Irreversible actions require explicit human approval.** This includes host isolation, account disablement, firewall blocks, and email quarantine. AI-assisted automation is analyst-gated.
