---
name: security-comms
description: Security communications — translate technical security findings for boards, executives, engineers, customers, legal. Templates for breach disclosure, incident updates, post-mortems, executive memos. Triggered by "write a security memo", "board presentation", "customer breach notification", "incident communication", "post-mortem".
---

# Security Comms: Translating Technical Security for Non-Technical Audiences

## Seven Distinct Audiences

| Audience | Core Need | Format |
|----------|-----------|--------|
| Board | Material exposure? Investment needed? | One page, three sections |
| Executives | What decision? What's the tradeoff? | 1–3 page memo |
| Engineering leadership | What's broken, how to fix, priority | Ticket/design doc |
| Individual engineers | Exact file, line, fix, verification | Detailed ticket |
| Customer success/sales | What to tell customers | Internal FAQ |
| Customers | Did my data get accessed? What now? | Short letter |
| Procurement/legal | Compliance, evidence, contractual position | Structured artifact |

## Key Principles

**Lead with the punchline.** Boards don't need CVE tables — they need: *"two of our payments-team services have unpatched issues an attacker could use to access customer card data."*

**Name the decision.** Every deliverable should have one answerable in a single sentence.

**Quantify concretely.** "Affects roughly 8% of paying customers" beats vague hedging.

**Strip jargon per audience.** Same finding, three different drafts.

## Critical Failure Modes

- Sending boards scored heat maps and 30-row CVE tables instead of the punchline
- Asking for budget without naming the alternative if budget is denied
- Pasting raw scanner output to engineers without context
- Using "out of an abundance of caution" in customer disclosures — readers recognize evasion

## Board Incident Update Template

```markdown
# Security Incident Board Update
**Date:** [ISO date]
**Severity:** [Critical / High / Medium]
**Status:** [Active / Contained / Resolved]

## What Happened (2 sentences max)
[Plain English — no jargon]

## Business Impact
- Systems/data affected: [list]
- Customers affected: [N or estimated %]
- Regulatory exposure: [GDPR/HIPAA/etc. notification required? Y/N]

## What We're Doing
1. [Immediate action already taken]
2. [Next action with owner and date]

## Decision Required
[Single yes/no or choose-A/B decision for the board]

## Resource Request (if any)
[Specific ask with business case]
```

## Customer Breach Disclosure Template

```markdown
Subject: Important Security Notice Regarding Your Account

Dear [Customer Name],

We are writing to inform you of a security incident that may have affected your account.

**What happened:** [Plain English description]

**What information was involved:** [Specific data types]

**What we are doing:** [Concrete actions already taken]

**What you should do:** [Specific steps]

If you have questions, contact us at [security@company.com].

[Company Name] Security Team
```

> Legal review required before sending any customer disclosure. GDPR Article 33: 72-hour notification window. HIPAA: 60-day rule. SEC 8-K for public companies.

## Post-Mortem Narrative Template

```markdown
# Post-Mortem: [Incident Title]
**Date:** [ISO date] | **Severity:** [level] | **Duration:** [X hours]

## Summary
[3 sentences: what happened, impact, resolution]

## Timeline
| Time | Event |

## Root Cause
[Technical explanation]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [Item]

## What Went Wrong
- [Item]

## Action Items
| Item | Owner | Due |
```
