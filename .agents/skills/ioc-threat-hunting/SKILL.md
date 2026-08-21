---
name: ioc-threat-hunting
description: IOC-driven threat hunting — extract and validate indicators from threat intel, map to ATT&CK, generate hunting hypotheses, translate to Splunk/KQL/EQL/Sigma queries, correlate and pivot across data sources. Triggered by "hunt for IOC", "threat intel hunting", "pivot on indicator", "hunt hypothesis from IOC", "ATT&CK hunting".
---

# IOC-Driven Threat Hunting

Extracts indicators from threat intelligence, maps to ATT&CK, and generates hunting queries for multiple SIEM platforms.

## IOC Extraction and Validation

```python
# Defang indicators for safe handling during analysis
import re

def defang(indicator: str) -> str:
    return indicator.replace("http://", "hxxp://") \
                    .replace("https://", "hxxps://") \
                    .replace(".", "[.]")

# Validate IOC types
IOC_PATTERNS = {
    "ipv4": r"^(\d{1,3}\.){3}\d{1,3}$",
    "domain": r"^([a-z0-9-]+\.){1,}[a-z]{2,}$",
    "sha256": r"^[a-f0-9]{64}$",
    "md5": r"^[a-f0-9]{32}$",
    "email": r"^[^@]+@[^@]+\.[^@]+$"
}
```

## ATT&CK Mapping

For each IOC, determine:
1. **Tactic** — Initial Access / Persistence / Defense Evasion / Credential Access / Lateral Movement / Exfiltration / C2
2. **Technique** — specific T-number from `attack.mitre.org`
3. **Data source** — which logs would contain evidence

## Hunt Hypothesis Generation

Three requirements for a valid hypothesis:
- **Specific** — names the technique and expected observable behavior
- **Testable** — at least one data source can confirm or deny it
- **Bounded** — defines a time window and system scope

Example: "If `192.168.x.x` is an active C2, workstations in VLAN-20 should show TCP connections to port 8080 on this IP within the last 7 days."

## Multi-Platform Hunting Queries

### Splunk SPL

```spl
# Hunt for C2 IP
index=firewall OR index=proxy
dest_ip="<C2-IP>"
| stats count, values(src_ip) as sources, min(_time) as first_seen, max(_time) as last_seen
| sort -count

# Hunt for malicious domain
index=dns query="<malicious-domain>"
| stats count by src_ip, query
| sort -count
```

### Sentinel KQL

```kql
// Hunt for file hash
DeviceFileEvents
| where SHA256 == tolower("<sha256-hash>")
| project Timestamp, DeviceName, FileName, FolderPath, InitiatingProcessFileName
| sort by Timestamp

// Hunt for C2 domain
DeviceNetworkEvents
| where RemoteUrl has "<malicious-domain>"
| project Timestamp, DeviceName, InitiatingProcessFileName, RemoteUrl, RemotePort
```

### Elastic EQL

```eql
// Process execution matching hash
process where process.hash.sha256 == "<sha256>"

// Lateral movement to new hosts from compromised account
sequence by user.name
  [authentication where event.outcome == "success"]
  [process where process.name == "cmd.exe" or process.name == "powershell.exe"]
```

### Sigma (Portable to any SIEM)

```yaml
title: C2 Connection to Known Malicious IP
detection:
  selection:
    DestinationIp: '<C2-IP>'
  condition: selection
falsepositives:
  - None — IP confirmed malicious in threat intel
level: high
```

## Hunt Execution Workflow

1. Load IOCs from threat intel (STIX, MISP, CSV)
2. Enrich with reputation (VirusTotal, OTX, MISP)
3. Map each IOC to ATT&CK technique and data source
4. Generate hypothesis (specific, testable, bounded)
5. Execute queries on SIEM/EDR
6. Triage hits (FP elimination)
7. Pivot: from IOC hit → related processes, network connections, files
8. Document findings and create detections for persistent monitoring

## Pivot Methodology

When a hunt finds a hit, pivot in multiple directions:
- **Process** → parent process, command line, child processes
- **Network** → other connections from same source, same destination
- **File** → file hash → other systems with same hash
- **Account** → other logins from same account, same IP

## Hunt Report Template

```markdown
# Threat Hunt Report
**IOC:** [indicator] | **Type:** [ip/domain/hash]
**ATT&CK:** [tactic] / [T-number]
**Hunt Period:** [start] to [end]
**Analyst:** [name]

## Hypothesis
[Specific, testable, bounded statement]

## Queries Executed
[List query for each platform]

## Findings
| System | Timestamp | Evidence | Disposition |
|--------|-----------|---------|-------------|

## Conclusion
[Confirmed / Not Found / Inconclusive + rationale]

## Next Steps
[New IOCs discovered, detections to create, additional hunts needed]
```
