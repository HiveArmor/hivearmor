---
name: incident-triage
description: Security incident triage and response — NIST SP 800-61 methodology, classification, severity, containment, evidence collection, IOC extraction. Triggered by "incident response", "security incident", "triage this alert", "incident triage", "contain breach".
---

# Incident Triage — Security Incident Response

NIST SP 800-61 methodology for rapid, evidence-preserving incident response.

## Core Priorities

1. Human safety first
2. Contain damage
3. Preserve evidence
4. Identify root cause
5. Document everything

## Incident Types & Classification

| Type | Examples |
|------|---------|
| Malware infection | Ransomware, RAT, cryptominer |
| Unauthorized access | Brute force success, credential stuffing |
| Data exfiltration | Bulk file copy to external, DNS tunneling |
| Denial of Service | Network flood, application-layer DoS |
| Web compromise | SQLi, RCE, web shell |
| Phishing | Credential harvest, malicious attachment |

### Severity Levels

- **Critical** — Active breach, data exfiltration in progress, ransomware spreading
- **High** — Confirmed compromise, attacker present, lateral movement detected
- **Medium** — Suspicious but unconfirmed, potential breach
- **Low** — Policy violation, failed attack, informational

## Containment

- Block IPs/domains at firewall
- Isolate hosts via network disconnect
- Disable compromised accounts

> **CRITICAL: Do NOT power off systems.** Volatile memory holds forensic evidence.

## Evidence Collection

Capture in volatility order:
1. Running processes (`ps aux`, tasklist)
2. Network connections (`netstat -anp`, `ss -tulpn`)
3. Logged-in users (`who`, `w`)
4. Open files (`lsof`)
5. System logs
6. Memory dump (if available — capture this FIRST)

```bash
# Linux — capture volatile evidence
date >> incident_$(hostname)_$(date +%Y%m%d).txt
ps aux >> incident_*.txt
netstat -anp >> incident_*.txt
who >> incident_*.txt
last -50 >> incident_*.txt
find /tmp /var/tmp -newer /etc/passwd -ls >> incident_*.txt
```

## IOC Extraction

| Type | Examples |
|------|---------|
| IPs/Domains | C2 infrastructure |
| File hashes | MD5, SHA256 of malware samples |
| Email/URLs | Phishing artifacts |
| Registry keys | Persistence mechanisms |
| Process names | Malicious binaries |

## HiveArmor Incident Workflow

```
Alert fires → SOC triage → Create incident in HiveArmor UI
→ Link related alerts → SOAR playbook triggers
→ Containment actions logged → Evidence documented
→ Post-incident review → Detection rule created
→ Audit trail complete (required by AGENTS.md)
```

## Triage Report Template

```markdown
# Security Incident Triage Report
**Incident ID:** INC-[YYYY-MMDD-NNN]
**Severity:** [Critical / High / Medium / Low]
**Status:** [Active / Contained / Resolved]
**Analyst:** [Name]
**Date/Time:** [ISO timestamp]

## Affected Systems
- [hostname, IP, role]

## Timeline
| Time | Event |

## IOCs
| Type | Value | Context |

## Containment Actions
- [ ] [Action taken] at [timestamp]

## Evidence Preserved
- [What was collected, where stored]

## Next Steps
- [ ] [Pending actions]
```

## Firm Boundaries

- Never recommend counter-attacks or "hacking back"
- Never tamper with or alter logs/timestamps
- Escalate confirmed breaches to management and legal immediately
- GDPR Article 33: 72-hour notification window starts at confirmed breach
