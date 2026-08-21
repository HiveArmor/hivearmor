---
name: csf-mapping
description: NIST CSF 2.0 posture assessment — Govern/Identify/Protect/Detect/Respond/Recover functions, implementation tiers, gap analysis, board-level translation. Triggered by "NIST CSF", "security framework mapping", "CSF assessment", "compliance posture", "security program maturity".
---

# CSF Mapping — NIST Cybersecurity Framework 2.0 Posture Assessment

Translates security posture into governance language for CISOs, boards, and auditors.

## Core Framework

CSF 2.0 added **Govern** as a sixth function (new in v2.0):

| Function | Focus Area |
|---|---|
| **Govern (GV)** | Strategy, policies, supply chain oversight |
| **Identify (ID)** | Asset inventory, risk assessment |
| **Protect (PR)** | Access control, data security, configurations |
| **Detect (DE)** | Monitoring, anomaly detection |
| **Respond (RS)** | Incident management, communications |
| **Recover (RC)** | Recovery planning, improvements |

## Implementation Tiers

| Tier | Name | Description |
|------|------|-------------|
| 1 | Partial | Ad-hoc, reactive, undocumented |
| 2 | Risk-Informed | Approved but inconsistently applied |
| 3 | Repeatable | Documented org-wide policies; consistent processes; risk-informed budgeting |
| 4 | Adaptive | Continuous improvement, quantitative risk culture |

Most mature organizations target Tier 3. Tier 4 is rare and resource-intensive.

## Methodology

1. **Define scope** — whole org, single product, regulated boundary, etc.
2. **Choose a profile** — Current vs. Target, potentially using a sector-specific Community Profile
3. **Assess each Subcategory** — evidence-based; record tier, gap, owner, and timeline
4. **Prioritize gaps** — weigh impact, likelihood, and cost-to-close together
5. **Build a roadmap** — 30-day, 90-day, and 12-month horizons with named owners and success metrics

## Common High-Impact Gaps

| Subcategory | Typical Gap |
|-------------|------------|
| GV.OC-04 | Crown-jewel systems not consistently identified across teams |
| ID.IM-04 | Incident response plans exist but never tested |
| PR.AA-05 | Least-privilege reviews exist in policy, absent in practice |
| DE.AE-08 | Incident declaration criteria informal — "we'll know when we see it" |
| RC.RP-01 | Recovery plan "documented, never tested" |

## Skill-to-CSF Mapping

| CSF Area | Supporting Skill | Evidence Type |
|---|---|---|
| `PR.AA` | `iam-audit` | Role inventory, access reports |
| `DE.CM` | `siem-detection` | ATT&CK coverage, detection rules |
| `RS.MA` | `incident-triage` | IR plan, runbooks |
| `ID.RA` | `threat-modeling` | Threat models |
| `PR.DS` | `crypto-audit` | Encryption and key management posture |

## HiveArmor CSF Mapping

| CSF Function | HiveArmor Capability |
|---|---|
| GV | Security rules in AGENTS.md, SEC-FIXES.md, MASTER_PLAN.md |
| ID | Asset tracking via agent registry (hivearmor_agents DB) |
| PR | JWT auth, @PreAuthorize on endpoints, Liquibase schema controls |
| DE | OpenSearch correlation rules, 17 plugins, alert tagging workers |
| RS | SOAR playbooks, incident management, audit trail (required) |
| RC | Backup procedures, DR runbooks (gap: not yet documented) |

## Board-Level Translation

Boards need three answers, not Subcategory IDs:

1. **Where are we exposed?**
2. **What are we doing about it?**
3. **How will we know we're better?**

The full CSF assessment serves as backing detail; board-facing output is a one-page heatmap plus prioritized slides.

## Assessment Template

```markdown
# NIST CSF 2.0 Assessment
**Date:** [ISO date]
**Scope:** [boundary]
**Current Profile Tier Target:** [2/3/4]

## Function Assessment
| Subcategory | Current Tier | Target Tier | Gap | Owner | Timeline |

## Top 5 Priority Gaps
1. [Subcategory] — [gap description] — [owner] — [date]

## 12-Month Roadmap
| Quarter | Initiative | Subcategories Addressed |
```

## Boundaries

This skill produces governance artifacts — not regulatory certifications. CSF mapping informs SOC 2, FedRAMP, and ISO 27001 processes but does not substitute for them. Tier ratings require actual evidence; inflation without documentation is refused.
