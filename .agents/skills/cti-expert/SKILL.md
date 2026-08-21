---
name: cti-expert
description: Cyber threat intelligence and OSINT analysis — AEAD lifecycle (Acquire/Enrich/Assess/Deliver), domain/IP/email/username investigation, STIX 2.1 IOC bundles, breach checking, attribution. Triggered by "threat intelligence", "CTI analysis", "OSINT investigation", "investigate this IP", "threat actor attribution".
---

# CTI Expert — Cyber Threat Intelligence & OSINT

AEAD lifecycle for threat intelligence work:
- **Acquire** — collect raw data
- **Enrich** — expand leads laterally
- **Assess** — score and verify findings
- **Deliver** — package structured intelligence products

## Key Capabilities

### Domain Investigation (`/domain <target>`)
- WHOIS, passive DNS, certificate transparency
- Subdomain enumeration, related infrastructure
- Historical threat intelligence lookups
- Malware delivery and phishing history

### IP Investigation (`/ip <address>`)
- Geolocation, ASN, hosting provider
- Threat intel feeds (AbuseIPDB, VirusTotal, Shodan)
- Passive DNS, SSL certificate history
- GreyNoise context (mass scanning vs. targeted)

### Email Investigation (`/email <address>`)
- Breach exposure check (HaveIBeenPwned)
- Domain reputation and SPF/DKIM/DMARC
- Social media presence mapping

### Username Investigation (`/username <handle>`)
- Platform enumeration across major services
- Cross-platform identity correlation
- Breach exposure

### Organization Intelligence (`/org <name>`)
- ASN and IP range discovery
- Email format enumeration
- Exposed services and attack surface

### MISP Threat Intelligence
- `/misp-search <indicator>` — query threat intel platform
- `/stix-bundle <IOC list>` — generate STIX 2.1 package
- IOC deduplication and enrichment

## Output System

Reports auto-save five formats simultaneously:
1. Markdown
2. Interactive offline HTML (primary deliverable)
3. JSON
4. CSV
5. IOC bundle (STIX 2.1 + flat + CSV)

## IOC Triage for HiveArmor

```python
# Import IOCs into HiveArmor for correlation
POST /api/ha-threat-intel
{
  "iocs": [
    { "type": "ip", "value": "1.2.3.4", "confidence": 85, "source": "CTI analysis" },
    { "type": "domain", "value": "evil.example.com", "confidence": 90 }
  ],
  "ttl_days": 30
}
```

## Severity / Confidence Scale

| Score | Meaning |
|-------|---------|
| 90–100 | Confirmed malicious — block immediately |
| 70–89 | High confidence — alert + monitor |
| 50–69 | Medium confidence — log and watch |
| < 50 | Low confidence — informational only |

## STIX 2.1 Bundle Template

```json
{
  "type": "bundle",
  "id": "bundle--[uuid]",
  "objects": [
    {
      "type": "indicator",
      "spec_version": "2.1",
      "id": "indicator--[uuid]",
      "pattern": "[network-traffic:dst_ref.type = 'ipv4-addr' AND network-traffic:dst_ref.value = '1.2.3.4']",
      "pattern_type": "stix",
      "valid_from": "[ISO timestamp]",
      "name": "Suspected C2 Infrastructure",
      "labels": ["malicious-activity"]
    }
  ]
}
```

## Autonomous Mode

Append `--yolo` to any command for fully autonomous, no-prompt operation in batch workflows.

## Ethics Boundary

Strictly limited to publicly available information. Stalking, unauthorized access, and social engineering are explicitly prohibited. All investigations must be for authorized security purposes.
