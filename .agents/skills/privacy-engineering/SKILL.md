---
name: privacy-engineering
description: Privacy engineering — data classification, minimization, lawful basis, consent records, DSAR pipeline (access/deletion/portability), GDPR 72h notification, DPIA, pseudonymization vs anonymization. Triggered by "privacy engineering", "GDPR", "DSAR", "data deletion", "consent management", "privacy audit".
---

# Privacy Engineering

Security ≠ Privacy. "A perfectly secure system that logs every keystroke and shares the log with vendors is a privacy disaster."

## Eight Engineering Practices

### 1. Data Classification

Every data store requires classification before privacy controls can be enforced:

| Class | Treatment |
|-------|---------|
| Public | No special handling |
| Personal | Access logging, retention limits, deletion path |
| Sensitive Personal | Separate KMS key, audit on every read |

### 2. Data Minimization

Common findings:
- Storing full IP when only rate-limiting (boolean) is needed
- Collecting birthdate when only age-gate boolean is required
- Logging full request bodies in access logs (may contain PII)

Collect the minimum. Retain the minimum.

### 3. Lawful Basis

Each processing activity needs a documented basis:

| Basis | When Valid |
|-------|-----------|
| Contract | Necessary to fulfill contract with user |
| Consent | Freely given, specific, informed, unambiguous |
| Legitimate interest | Balanced against user's rights |
| Legal obligation | Required by law |

The application should log every processing activity with its lawful basis.

### 4. Consent Management

A valid consent record must capture all of:
- User identifier
- Specific purpose consented to
- Timestamp (ISO 8601)
- Consent text version shown
- Consent channel (web/mobile/API)
- Grant or deny status
- Revocation timestamp (when applicable)

"Withdrawal of consent must be as easy as granting it."

### 5. DSAR Pipeline (Five Rights)

| Right | Deadline |
|-------|---------|
| Access | 30 days (GDPR) / 45 days (CCPA) |
| Deletion | Must cover all stores |
| Portability | Machine-readable format |
| Rectification | Self-service path |
| Objection/opt-out | Honored in all processing paths |

Deletion is the hardest right — fan-out to all stores:
- Primary databases
- Replicas (read replicas, disaster recovery copies)
- Caches (Redis, Memcached)
- Search indexes (OpenSearch, Elasticsearch)
- Analytics (data warehouse, BI tools)
- Third-party vendors (every sub-processor)
- Backups (with a deletion schedule or documented exception)

### 6. Vendor / Sub-processor Management

Every SaaS integration touching user data requires:
- Data Processing Agreement (DPA)
- Documented deletion path (how to invoke DSAR deletion on their side)
- Confirmed data residency (relevant for GDPR transfer restrictions)

### 7. Breach Notification

GDPR timelines:
- **72 hours**: Notify supervisory authority if breach affects individual rights/freedoms
- **Without undue delay**: Notify affected individuals for high-risk breaches

**"The timeline-of-awareness clock starts when anyone on the team becomes aware."** A ticket submitted to the security team at 4pm Friday starts the clock at 4pm Friday, not Monday morning.

Encryption safe harbor: if PHI/PII was encrypted and the key was not also compromised, unauthorized acquisition may not trigger notification obligations.

### 8. DPIA (Data Protection Impact Assessment)

Required for high-risk processing. Engineering contributes:
- Data flow diagrams
- Categories of personal information
- Retention periods per data type
- Security measures in place

## Critical Distinction

**Pseudonymization ≠ Anonymization.**

- Pseudonymization: replacing identifiers with surrogate keys while a re-linking key exists somewhere → data is STILL personal data
- Anonymization: irreversible removal of identifiability → no longer personal data under GDPR

Treating pseudonymized data as anonymized is a common compliance gap.

## DSAR Checklist

```markdown
## DSAR Pipeline Status — [System Name]
- [ ] Access — implemented and tested end-to-end, returns all PI for subject
- [ ] Deletion — full fan-out tested (DBs, caches, search, analytics, vendors)
- [ ] Portability — machine-readable export (JSON/CSV) implemented
- [ ] Rectification — self-service path exists in UI
- [ ] Objection/opt-out — honored in all processing paths, not just marketing
- [ ] Timeline compliance — 30-day deadline tracked in ticketing system
- [ ] Delegation path — legal/privacy officer notified for complex DSARs
```

## HiveArmor Privacy Considerations

- Alert data may contain PII (usernames, IP addresses, email addresses in log events)
- Check that log-level PI retention aligns with GDPR storage limitation principle
- DSAR deletion must cover OpenSearch indices containing user-linked events
- Ensure access audit trail doesn't inadvertently create new PI processing

*Technical implementations only — compliance determinations require legal/privacy counsel.*
