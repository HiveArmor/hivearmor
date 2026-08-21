---
name: pci-audit
description: PCI DSS v4.0 compliance audit — CDE scoping, PAN storage checks, CVV storage, TLS requirements, MFA (v4.0 expanded), log retention, segmentation validation, SAQ selection. Triggered by "PCI audit", "PCI DSS", "cardholder data", "SAQ selection", "payment card security".
---

# PCI DSS v4.0 Audit

## Core Principle: Scope First

"Most PCI failures are scope failures." Getting scope wrong creates lasting compliance debt.

## System Classification

| Type | In Scope? |
|------|-----------|
| CDE (stores/processes/transmits PAN) | Yes |
| Connected-to systems | Yes |
| Security-impacting systems | Yes |
| Properly segmented systems | No |

## Scope Reduction Strategies

| Strategy | Impact |
|---------|--------|
| Hosted payment pages (Stripe/Adyen) | PAN never reaches your servers |
| Tokenization | Processor converts PAN to meaningless surrogate |
| P2PE | Encrypts at terminal — before data reaches your network |
| Network segmentation | Default-deny at CDE perimeter — properly executed, removes systems from scope |

## Key Engineering Requirements by Requirement Number

### Req 3 — Stored Data Protection

```sql
-- Check for stored PANs (Luhn-valid 16-digit numbers)
SELECT * FROM transactions WHERE pan_number ~ '^[0-9]{13,19}$';

-- CVV must NEVER be stored post-authorization
SELECT column_name FROM information_schema.columns 
WHERE table_name IN ('transactions','payments') 
AND column_name ~* 'cvv|cvc|csc|security_code';
```

- No PAN storage without strong cryptography (AES-256)
- CVV categorically forbidden after authorization
- PAN masked in all non-CDE displays (show only last 4 digits)

### Req 4 — Transmission Security

- TLS 1.2 minimum; TLS 1.3 preferred
- PAN must never appear in email, SMS, or chat messages
- Verify certificate chains for all payment API connections

### Req 6 — Secure SDLC

- WAF in place for all internet-facing CDE systems
- No real PANs in development/test environments
- Code reviews and security testing for custom code

### Req 8 — Authentication (Changed in v4.0)

**MFA now required for all CDE access** — this is expanded from v3.2.1 which only required MFA for remote access.

```bash
# Verify MFA on all accounts with CDE access
# Check IAM for accounts missing MFA that can reach CDE systems
```

### Req 10 — Logging

- 12-month log retention (3 months immediately accessible)
- Logs must be immutable (append-only, protected from modification)
- Daily review of security events
- Centralized log management for CDE systems

### Req 11 — Testing

- Quarterly external vulnerability scans (ASV-approved scanner)
- Annual internal pentest
- Annual network segmentation validation

## Common Findings

- Luhn-valid PANs appearing in logs or error reports
- CVV stored "for re-billing convenience" — categorically forbidden
- Staging databases seeded from unmasked production dumps
- Firewall-only segmentation — "effective segmentation requires architectural separation"
- MFA gaps from v4.0's broadened requirements (internal CDE access now requires MFA)
- Log retention under 12 months

## SAQ Selection Guide

| Merchant Profile | SAQ |
|----------------|-----|
| E-commerce using hosted payment page (Stripe/PayPal) | SAQ A |
| E-commerce with some card data handling | SAQ A-EP |
| Phone/mail orders, no electronic storage | SAQ B |
| Card-present only (terminals), no electronic storage | SAQ B-IP |
| All other merchants | SAQ D |
| Level 1 merchants (>6M transactions) | ROC with QSA assessment |

## HiveArmor CDE Assessment

HiveArmor itself is unlikely to be in CDE scope unless it processes payment event logs from a payment system. If payment system logs flow through HiveArmor:
- Ensure PANs are masked/tokenized before ingestion
- PAN patterns in OpenSearch indices would constitute CDE scope
- Apply Req 10 log retention requirements to `_v3_hive_*` indices
