---
name: incident-response-playbook
description: Build production IR playbooks — NIST SP 800-61 / PICERL lifecycle, SOAR integration, RACI matrix, decision trees, communication templates. Triggered by "build IR playbook", "incident response playbook", "PICERL", "create playbook for ransomware", "IR procedure".
---

# Incident Response Playbook Builder

NIST SP 800-61r3 and SANS PICERL lifecycle: Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned.

## Essential Playbook Components

| Section | Purpose |
|---|---|
| Metadata | Version, owner, trigger conditions, last tested date |
| RACI Matrix | Clarifies accountability across roles |
| Detection & Triage | Classification and severity scoring criteria |
| Containment | Network/host isolation steps (with commands) |
| Eradication | Malware removal, backdoor elimination |
| Recovery | Restoration with validation criteria |
| Communication | Internal and external notification paths |

## Priority IR Playbooks (Build First)

1. Ransomware
2. Phishing / Credential compromise
3. Business Email Compromise (BEC)
4. Data breach / Exfiltration
5. Cloud infrastructure compromise

## Ransomware Playbook

```markdown
# Ransomware Incident Response Playbook
**Version:** 2.0 | **Owner:** IR Team | **Last Tested:** [date]
**Triggers:** Multiple encrypted files discovered, EDR alert for mass file modification

## RACI
| Role | Responsible | Accountable | Consulted | Informed |
|------|-------------|-------------|-----------|---------|
| IR Lead | X | X | | |
| CISO | | X | X | |
| Legal | | | X | X |

## Severity Tiers
- S1 (Critical): DC or production database affected, >100 hosts, active spread
- S2 (High): <100 hosts, no DC, contained
- S3 (Medium): Isolated workstation, no spread

## Phase 1: Identification (0–30 min)
- [ ] Confirm ransomware indicators (file extension, ransom note, wallpaper)
- [ ] Identify patient zero via endpoint logs
- [ ] Assess blast radius — how many systems affected?
- [ ] Do NOT power off systems (destroys forensic evidence)

## Phase 2: Containment (30–60 min)
- [ ] `edr_isolate_host <hostname>` — isolate via EDR (requires analyst approval)
- [ ] Block affected VLANs at network layer if spreading
- [ ] Disable compromised accounts
- [ ] Snapshot all affected systems before changes

## Phase 3: Eradication
- [ ] Identify ransomware family (ransom note, extension, ID Ransomware)
- [ ] Check for decryptor availability (NoMoreRansom.org)
- [ ] Remove malware from isolated systems
- [ ] Identify and close initial access vector

## Phase 4: Recovery
- [ ] Restore from last-known-good backup
- [ ] Verify backup integrity before restore
- [ ] Patch initial access vector before reconnecting
- [ ] Monitor for re-infection for 72 hours

## Communication
- T+15min: Notify CISO (S1/S2)
- T+30min: Notify Legal (S1)
- T+72h: GDPR notification if personal data affected
```

## SOAR Integration

Manual steps convert to automated workflows with approval gates:

```yaml
# Approval gate — never automate irreversible actions
- id: isolate-host
  type: human_approval
  prompt: "Isolate {{hostname}} from network?"
  required_approver: ir-lead
  timeout: 10m
```

## Key Metrics to Track

| Metric | Definition | Target |
|--------|-----------|--------|
| MTTA | Mean Time to Acknowledge | < 15 min (P1) |
| MTTC | Mean Time to Contain | < 1 hour (P1) |
| MTTR | Mean Time to Resolve | < 4 hours (P1) |

## Common Pitfall

Avoid procedures that reference "specific tool interfaces or commands" only generically — each containment step must specify the exact command, tool, or portal action. Generic guidance fails during active incidents.
