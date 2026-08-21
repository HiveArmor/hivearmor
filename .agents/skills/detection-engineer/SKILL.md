---
name: detection-engineer
description: Convert malware analysis findings into SIEM detection content — IOC defanging, Sigma rules, Suricata rules, hunting queries, STIX/OpenIOC export. Triggered by "convert malware to detection", "write detection from IOCs", "Suricata rule", "IOC defang", "write detection rule from analysis".
---

# Detection Engineer — Malware Analysis to Detection Content

Transforms malware analysis findings into production-ready detection content.

## IOC Defanging

Neutralize live indicators for safe sharing:

```
http://evil.com        →  hxxp://evil[.]com
192.168.1.1           →  192[.]168[.]1[.]1
user@evil.com         →  user[@]evil[.]com
ftp://data.host.io    →  fxp://data[.]host[.]io
```

## IOC Confidence Tiers

| Confidence | IOC Type | Stability |
|-----------|---------|-----------|
| High (Static) | SHA256 hashes, mutexes, registry keys, PDB paths | Long shelf-life |
| Medium (Dynamic) | IP addresses, C2 domains | Rotate often |
| Low (Dynamic) | User-agents, process names, URL paths | Context-dependent |

## Sigma Rule Creation

```yaml
title: [Malware Family] - [Detection Method]
id: [UUID v4]
status: experimental
description: |
  Detects [behavior] associated with [malware family].
  Analysis date: [date] | Sample hash: [SHA256]
author: [Analyst name]
date: YYYY/MM/DD
references:
    - [MalwareBazaar URL or analysis report URL]
tags:
    - attack.[tactic]
    - attack.tNNNN
logsource:
    category: [process_creation|network_connection|file_event]
    product: [windows|linux]
detection:
    selection:
        [field]: [value from malware analysis]
    condition: selection
falsepositives:
    - [Legitimate software using same pattern]
level: [critical|high|medium|low]
```

```bash
# Convert Sigma to SIEM
sigma convert -t splunk rule.yml       # Splunk SPL
sigma convert -t elasticsearch rule.yml # Elastic
sigma convert -t opensearch rule.yml   # OpenSearch (HiveArmor)
```

## Suricata Rule Creation

```
# Custom SIDs start at 1,000,000+
alert http $HOME_NET any -> $EXTERNAL_NET any (
    msg:"[Malware Family] C2 Beacon";
    flow:established,to_server;
    http.uri; content:"/path/to/c2";
    http.user_agent; content:"MaliciousUA";
    classtype:trojan-activity;
    sid:1000001;
    rev:1;
)
```

```bash
# Test Suricata rule syntax
suricata -T -S custom.rules
```

## Hunting Query Templates

### Splunk SPL

```spl
index=endpoint sourcetype=sysmon EventCode=3
dest_ip="<C2-IP>" OR dest_port=6606
| stats count by src_ip, process_name, CommandLine
| sort -count
```

### Elastic EQL

```eql
sequence by process.entity_id [
  process where process.name == "powershell.exe" and
    process.command_line like~ "*-EncodedCommand*"
] [
  network where destination.ip == "<C2-IP>"
]
```

### OpenSearch (HiveArmor)

```json
GET _v3_hive_alerts-*/_search
{
  "query": {
    "bool": {
      "should": [
        { "term": { "destination.ip": "<C2-IP>" } },
        { "term": { "file.hash.sha256": "<sample-hash>" } }
      ]
    }
  }
}
```

## IOC Export Formats

```python
# STIX 2.1 indicator
{
  "type": "indicator",
  "spec_version": "2.1",
  "pattern": "[file:hashes.SHA256 = '<hash>']",
  "pattern_type": "stix",
  "name": "Malware Sample Hash",
  "labels": ["malicious-activity"]
}
```

## Detection Development Workflow

1. Identify unique, observable behaviors from triage/dynamic analysis
2. Map behaviors to data sources (Sysmon events, network logs, DNS)
3. Select rule type: host-based → Sigma; network → Suricata; file → YARA
4. Validate against both malicious and benign samples
5. Deploy, monitor alert volume, tune as needed

Note: YARA rules are authored in the `malware-report-writer` skill, not here.
