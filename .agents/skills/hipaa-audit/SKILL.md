---
name: hipaa-audit
description: HIPAA Security and Privacy Rule audit — PHI identification (18 identifiers), admin/physical/technical safeguards, BAA requirements, minimum necessary principle, breach notification timelines, NIST SP 800-66 Rev.2. Triggered by "HIPAA audit", "PHI security", "healthcare data", "BAA", "breach notification healthcare".
---

# HIPAA Security & Privacy Audit

## Who Must Comply

- Covered entities: health plans, providers, clearinghouses
- Business associates: anyone who "creates, receives, maintains, or transmits PHI on behalf of a covered entity"
- Subcontractors of BAs are also BAs — every link in the chain needs a BAA

## What Counts as PHI

18 identifiers make data PHI:
Names, dates (except year), phone numbers, fax numbers, email addresses, SSN, medical record numbers, health plan beneficiary numbers, account numbers, certificate/license numbers, VINs, device identifiers/serial numbers, URLs, IP addresses, biometric identifiers, full-face photographs, unique identifying numbers/characteristics/codes.

**Pseudonymized data is still PHI** — a surrogate key and a re-linking table means re-identification is possible.

## Security Rule — Three Safeguard Categories

### Administrative Safeguards

- [ ] Risk analysis documented and current
- [ ] Risk management plan in place
- [ ] Workforce training program
- [ ] BAA in place with every business associate
- [ ] Access management procedures (user provisioning/deprovisioning)
- [ ] Sanctions policy for workforce violations

### Physical Safeguards

- [ ] Workstation and device encryption
- [ ] Device disposal procedures (sanitization documentation)
- [ ] Physical access controls to facilities with PHI
- Inherited from cloud BAA when using HIPAA-eligible services (AWS/GCP/Azure with signed BAA)

### Technical Safeguards

- [ ] Unique user identification (no shared accounts for PHI access)
- [ ] Automatic logoff for workstations with ePHI access
- [ ] Audit logs on all PHI access
- [ ] MFA for remote access to ePHI (strongly recommended by HHS post-2013)
- [ ] TLS 1.2+ for PHI in transit
- [ ] Encryption at rest for ePHI storage

**MFA note:** While technically "addressable" in the rule text, HHS guidance and enforcement actions strongly recommend MFA for any remote access to ePHI.

## Privacy Rule — Minimum Necessary

`SELECT *` on PHI tables is a minimum-necessary violation risk. APIs should return only fields the caller's role requires.

```java
// ❌ Returns full patient record
PatientRecord getPatient(Long id) {
    return repo.findById(id).orElseThrow();
}

// ✅ Returns only what the calling role needs
PatientSummaryDTO getPatientSummary(Long id) {
    return repo.findSummaryById(id).orElseThrow();
}
```

## Breach Notification Timelines

| Recipient | Deadline |
|----------|---------|
| Affected individuals | ≤ 60 days from discovery |
| HHS/OCR (if ≥500 affected) | ≤ 60 days |
| Media (>500 affected in a jurisdiction) | ≤ 60 days |
| Annual HHS report (< 500 affected breaches) | Within 60 days of year-end |

**Encryption safe harbor:** if ePHI was encrypted and the key was not compromised, unauthorized acquisition may not trigger notification obligations — document encryption posture for all PHI stores.

## Top Common Findings

- PHI flowing to vendors (Sentry, Mixpanel, Slack, analytics tools) **without a BAA**
- Shared service accounts accessing PHI — violates the unique-user-ID requirement
- Production PHI seeded into lower environments (staging, dev, CI test data)
- Audit log retention under the 6-year threshold
- Backup encryption keys stored alongside the data they protect
- Log aggregation tools (Splunk, OpenSearch, Datadog) receiving PHI without BAA

## HiveArmor PHI Considerations

If HiveArmor ingests logs from healthcare systems:
- Healthcare event logs may contain PHI (patient identifiers in event messages)
- A BAA with the healthcare organization may be required
- Apply 6-year retention to OpenSearch indices containing healthcare event data
- Row-level security on OpenSearch indices should prevent unauthorized analyst access to PHI

## Key References

- NIST SP 800-66 Rev. 2 (2024) — current technical implementation guidance
- HHS OCR Audit Protocol — self-assessment checklist
- 45 CFR Parts 160 and 164 — regulatory text

*Final compliance determinations require your privacy officer and legal counsel.*
