---
name: osint-recon
description: Open-source intelligence gathering for authorized threat intelligence, attack surface assessment, and investigations — domain/IP/org/email/document intelligence, crt.sh, WHOIS, breach exposure, VirusTotal, OTX. Triggered by "OSINT investigation", "open source intelligence", "attack surface recon", "domain intelligence", "threat actor research".
---

# OSINT Reconnaissance

Systematically collects and correlates publicly available data for authorized investigations, threat intelligence, and attack surface assessment.

## Authorization Gate

Before any investigation, three conditions must hold:
1. Legitimate purpose (authorized IR, threat intel, attack surface assessment)
2. Public sources only — no unauthorized access to private systems
3. Results won't enable harassment, stalking, or targeted surveillance

## Capability Areas

| Domain | Techniques | Key Sources |
|--------|-----------|-------------|
| Infrastructure | WHOIS, DNS records, zone transfers, cert transparency | `crt.sh`, `whois`, `dig`, `dnsx` |
| Organization | Structure, personnel, technology stack | SEC/EDGAR, LinkedIn, job postings, GitHub orgs |
| Email/Username | Breach exposure, PGP keys, Gravatar | HaveIBeenPwned, PGP keyservers |
| Documents | Metadata extraction, exposed files | `exiftool`, Google dorking |
| Threat Intelligence | CVEs, malware hashes, C2 IPs | VirusTotal, OTX, Shodan, Censys |

## Domain & IP Investigation

```bash
# DNS enumeration
dig +short any target.com
nslookup -type=NS target.com
host -t mx target.com

# Certificate transparency — find subdomains
curl -s "https://crt.sh/?q=%.target.com&output=json" | \
  jq '.[].name_value' | sort -u

# Passive DNS resolution
curl -s "https://api.threatintelligenceplatform.com/v1/host/target.com"

# Reverse IP lookup
curl -s "https://api.shodan.io/shodan/host/<IP>?key=<API_KEY>"
```

## Email & Username

```bash
# Breach exposure (use API or web UI)
curl "https://haveibeenpwned.com/api/v3/breachedaccount/user@target.com" \
  -H "hibp-api-key: <key>"

# Public GitHub commits
curl "https://api.github.com/search/commits?q=author-email:user@target.com"
```

## Document Metadata

```bash
# Extract metadata from downloaded files
exiftool document.pdf
exiftool -Author -Creator -Company spreadsheet.xlsx
```

## Google Dorking

```
# Find exposed files
site:target.com filetype:pdf OR filetype:xls OR filetype:docx

# Configuration files
site:target.com ext:env OR ext:config OR ext:conf

# Admin panels
site:target.com inurl:admin OR inurl:login OR inurl:dashboard
```

## Threat Intelligence Lookups

```bash
# VirusTotal file or IP
curl "https://www.virustotal.com/api/v3/ip_addresses/<IP>" \
  -H "x-apikey: <key>"

# OTX (AlienVault) domain
curl "https://otx.alienvault.com/api/v1/indicators/domain/<domain>/general" \
  -H "X-OTX-API-KEY: <key>"

# Shodan host
curl "https://api.shodan.io/shodan/host/<IP>?key=<key>"
```

## Confidence Tiers

| Confidence | Criteria |
|-----------|---------|
| High | Multiple independent corroborating sources |
| Medium | Single reliable source, no contradiction |
| Low | Unverified, single source, or potentially stale |

## Report Template

```markdown
# OSINT Investigation Report
**Target:** [target entity]
**Scope:** [what was investigated]
**Date:** [ISO date]

## Summary
[2-3 sentence executive summary]

## Infrastructure Footprint
[Subdomains, IPs, ASN, hosting provider]

## Technology Stack
[Identified technologies from headers, certs, job postings]

## Exposure Analysis
[Exposed files, sensitive paths, breach history]

## Threat Intel
[IOCs matching threat feeds, historical malicious activity]

## Prioritized Next Steps
[What to follow up on, in order of interest]
```

## Hard Limits

- Never access private systems or authenticate without authorization
- Never aggregate unnecessary PII
- Never assist doxing, stalking, or targeted harassment
- Investigation scope does not extend to third-party systems not named in authorization
