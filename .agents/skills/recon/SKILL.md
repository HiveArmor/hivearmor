---
name: recon
description: Authorized penetration test reconnaissance — passive (DNS/WHOIS/cert transparency/dorking/GitHub leaks) and active (Nmap/directory bruting/API discovery). Authorization required before active phase. Triggered by "pentest recon", "attack surface recon", "nmap scan", "subdomain enumeration", "port scan authorized".
---

# Penetration Test Reconnaissance

Structured recon for authorized penetration testing, CTF challenges, and bug bounty programs.

## Authorization Check

Before Phase 2 (active):
1. Written authorization confirmed for target
2. Target is within the defined scope
3. Time window for active scanning is approved

## Three-Phase Methodology

### Phase 1 — Passive (No direct contact with target)

```bash
# WHOIS
whois target.com

# DNS records
dig +short any target.com
dig +short mx target.com
dig +short txt target.com
dig +short ns target.com

# Zone transfer attempt (rarely works but worth trying)
dig axfr target.com @ns1.target.com

# Subdomain discovery via certificate transparency
curl -s "https://crt.sh/?q=%.target.com&output=json" | \
  jq -r '.[].name_value' | sort -u

# Wayback Machine for historical endpoints
curl -s "http://web.archive.org/cdx/search/cdx?url=target.com/*&output=json&fl=original&collapse=urlkey" | \
  jq -r '.[] | .[0]' | grep -E "\.php|\.asp|\.env|\.git" | sort -u

# GitHub credential/secret leaks
# Search: org:target-company "password" OR "api_key" OR "secret_key"

# Shodan (passive view)
curl "https://api.shodan.io/shodan/host/search?key=<KEY>&query=hostname:target.com"
```

### Phase 2 — Active (Direct contact — authorization required)

```bash
# Port scan
nmap -sC -sV -p- --min-rate 5000 target.com -oN nmap-full.txt

# Quick top-ports scan
nmap -sC -sV --top-ports 1000 target.com -oN nmap-quick.txt

# Virtual host enumeration
ffuf -u "http://target.com/" -H "Host: FUZZ.target.com" \
  -w /usr/share/wordlists/SecLists/Discovery/DNS/subdomains-top1million-5000.txt \
  -mc 200,301,302,403

# Directory bruting
feroxbuster -u https://target.com -w \
  /usr/share/wordlists/SecLists/Discovery/Web-Content/common.txt

# API endpoint discovery
ffuf -u "https://api.target.com/FUZZ" \
  -w /usr/share/wordlists/SecLists/Discovery/Web-Content/api-wordlist.txt

# TLS analysis
testssl.sh target.com
curl -vI --tlsv1.1 https://target.com  # test TLS 1.1 acceptance

# Check for common API paths
for path in graphql swagger.json v1 api/v1 api/v2; do
  curl -sI "https://target.com/$path" | head -2
done
```

### Phase 3 — Analysis

Correlate findings → prioritize attack vectors → document for exploitation planning.

Structure output:
1. Infrastructure footprint (ASN, IP ranges, hosting)
2. Technology fingerprint (frameworks, versions, cloud provider)
3. Exposed endpoints (admin panels, APIs, dev environments)
4. Potential entry points (ranked by exploitability × impact)

## Recon Report Template

```markdown
# Penetration Test Recon Report
**Target:** target.com
**Scope:** [what's in scope]
**Phase:** [Passive/Active/Both]
**Date:** [ISO date]

## Discovered Assets
| Asset | Type | Notes |
|-------|------|-------|
| api.target.com | Subdomain | Backend API, 443+8080 open |

## Technology Stack
[Web server, framework, CDN, language clues]

## Open Ports / Services
[Nmap summary — interesting ports only]

## High-Interest Paths
[Admin panels, swagger, .git/, etc.]

## Recommended Next Steps
[Top 3 paths for exploitation phase, ranked]
```

## Hard Limits

- Phase 2 (active) requires explicit written authorization
- Rate-limit aggressive scans — avoid DoS
- Never scan out-of-scope systems
- Stop and report if active compromise discovered
