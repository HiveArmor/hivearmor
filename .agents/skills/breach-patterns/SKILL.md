---
name: breach-patterns
description: Convert public breach disclosures into audit questions for your stack — Capital One SSRF/IMDS, SolarWinds supply chain, LastPass developer endpoint, Lapsus$ MFA push fatigue, Snowflake infostealer creds, MOVEit zero-day, Codecov CI exfil, Equifax stale inventory, Uber network share. Triggered by "breach pattern", "preemptive hardening", "Capital One pattern", "supply chain audit".
---

# Breach Patterns — Preemptive Hardening

Converts public breach disclosures into concrete audit questions for your own stack. Cheaper than learning from your own incident.

## Methodology

For each pattern: read the one-sentence generalization, ask the implied audit question, map to existing controls, declare **Clean / Gap / Accept-Risk**.

## Pattern Library

| Breach | Core Pattern | Audit Question |
|--------|-------------|----------------|
| Capital One | SSRF → cloud metadata endpoint → IAM credentials | Can user-supplied URLs reach `169.254.169.254` or `metadata.google.internal`? |
| SolarWinds | Compromised build pipeline → trusted update signed by vendor | Which suppliers have credentials/access in your environment that could compromise you through a vendor update? |
| LastPass | Developer device → internal tools endpoint → vault backup exfil | What device posture gates production access? Is MFA enforced on internal tooling, not just production? |
| Lapsus$ / Okta | MFA push fatigue on standard TOTP/push | Is admin MFA phishing-resistant (FIDO2/hardware key), or just push notification? |
| Snowflake customers | Infostealer-harvested credentials → no-MFA SaaS login | Can stolen credentials unlock SaaS apps without SSO enforcement? |
| MOVEit | Unpatched SQL injection in file transfer appliance | What is your patch SLA when a CISA KEV drops? Which file transfer systems are internet-exposed? |
| Codecov | Malicious CI tool exfiltrates `$ENV` vars | What third-party CI tools run with access to environment variables containing secrets? |
| Equifax | 76-day dwell because scan target list was stale | Does your vulnerability scanner's target list match your actual asset inventory? |
| Uber | Credentials on internal file shares → full cloud access | What would an attacker who gained a foothold find on your internal file shares or wikis? |

## HiveArmor Assessment

| Pattern | Question | Status |
|---------|---------|--------|
| IMDS abuse | SSRF reachable from user input? | `api-audit` skill + `cloud-audit` skill |
| CI/CD blast radius | Do CI secrets need `INTERNAL_KEY` or `MAXMIND_LICENSE_KEY`? | See `secrets-audit` skill |
| Developer device posture | MFA required for developer access to prod? | Confirm with ops |
| Supply chain | Pinned third-party actions in CI? `uses: action@SHA`? | Check `.github/workflows/` |

## Assessment Output Template

```markdown
# Breach Pattern Coverage Assessment
## Environment: HiveArmor
## Date: [ISO date]

| Pattern | Audit Question | Status | Owner | Due |
|---------|---------------|--------|-------|-----|
| IMDS abuse | SSRF-to-metadata reachable? | Gap | security | [date] |
| CI secrets exfil | Third-party CI tools with env access? | Clean | platform | — |
```

## Growing the Library

New breach → extract one-sentence generalizable pattern → phrase as audit question → map to controls.

Sources: vendor post-mortems, SEC 8-K filings, Krebs on Security, Verizon DBIR, CISA advisories.

**Rerun quarterly.** Threat landscape shifts faster than annual reviews.
