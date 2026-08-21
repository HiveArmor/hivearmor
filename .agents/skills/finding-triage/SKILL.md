---
name: finding-triage
description: Security finding disposition — evaluate single findings, determine true severity (context-adjusted), dispose as Fix/Defer/Accept/FP with full audit trail. Triggered by "triage this finding", "is this a false positive", "accept risk", "finding disposition", "CVSS context adjustment".
---

# Security Finding Triage

Handles the full lifecycle of a single security finding — evaluation, severity adjustment, disposition, and documentation.

## Four Possible Dispositions

| Disposition | Action | Severity Impact |
|------------|--------|----------------|
| Fix Now | Deploy a patch within severity SLA | Unchanged |
| Defer | Valid finding, operational delay | Unchanged — deferral is NOT risk reduction |
| Accept Risk | No fix planned, with compensating controls | Unchanged |
| False Positive | No actual vulnerability | N/A |

**Critical:** `Accepted Risk` without all three required fields is a real finding being silently dropped.

## Accept Risk — Required Fields

1. **Why fix doesn't apply** — specific technical/business justification
2. **Compensating controls** — what mitigates the risk in lieu of a fix
3. **Re-evaluation trigger** — event or date that causes this to be reconsidered

## Severity Adjustment Methodology

Scanner severity ratings are a starting point. Your environment adjusts them:

| Modifier | Effect |
|---------|--------|
| Internet-exposed | +1 severity level |
| Stores PII/PCI/PHI | +1 severity level |
| No authentication required | +1 severity level |
| Not reachable from internet | -1 severity level |
| Compensating control in place | -1 severity level |
| No known public exploit | -1 severity level |

### Severity SLAs (after adjustment)

| Adjusted Severity | Fix SLA |
|------------------|---------|
| Critical | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | 90 days |

## Escalation Requirements (Second Reviewer)

Do not dispose solo — require a second reviewer for:
- Critical severity or pre-auth exploitable findings
- Regulated data involvement (PII, PCI, PHI, HIPAA)
- Active public exploits in the wild
- Accept Risk at High severity or above

## Context Questions for Each Finding

1. Is this reachable from the internet?
2. Is authentication required to reach it?
3. What data is accessible if exploited?
4. Does a public proof-of-concept exist?
5. Is this system in a compliance scope (PCI, HIPAA)?

## Triage Output Template

```markdown
## Finding: [title]
**Scanner:** [tool name] | **Rule/CVE:** [identifier]
**Scanner Severity:** [Critical/High/Medium/Low]

### Context Analysis
- Reachability: [internet/internal/localhost]
- Auth required: [yes/no]
- Data at risk: [PII/config/internal/none]
- PoC public: [yes/no/unknown]
- Compliance scope: [PCI/HIPAA/none]

### Adjusted Severity: [severity after context] (rationale: [brief reason])

### Disposition: [Fix Now / Defer / Accept Risk / False Positive]

**Justification:** [2-3 sentences]

**If Accept Risk:**
- Why fix doesn't apply: [reason]
- Compensating controls: [what's in place]
- Re-evaluation trigger: [event or date]

**If Defer:**
- Target fix date: [date]
- Ticket: [link]

**Analyst:** [name] | **Date:** [ISO date]
```

## Severity Does Not Change on Deferral

A deferred finding is still the same severity as when it was opened. "We chose not to fix it now" is not the same as "the risk is lower." Deferral is an operational decision; the risk remains.
