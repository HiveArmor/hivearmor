---
name: sigma-rule-writer
description: Production-grade Sigma detection rule authoring — 5-step workflow (clarify/draft/validate/convert/save), ATT&CK tagging, SIEM conversion (Splunk SPL, Elastic ES|QL/KQL, Wazuh XML), false positive documentation. Triggered by "write a sigma rule", "detect X in SIEM", "sigma rule for", "convert CVE to rule".
---

# Sigma Rule Writer

Guides production-grade Sigma detection rule creation from plain-English threat descriptions.

## 5-Step Workflow

### Step 1 — Clarify
Collect missing details before drafting:
- Threat behavior (what exactly is happening)
- Logsource (Windows Event Log, Sysmon, network, cloud)
- Platform (Windows, Linux, AWS, Azure)
- MITRE ATT&CK TTP (Txxxx.NNN)
- Severity level
- References (CVE, blog post, incident report URL)

### Step 2 — Draft

```yaml
title: [Descriptive title]
id: [UUID v4]
status: experimental    # experimental → test → stable
description: |
  [What this rule detects and why it matters]
author: [Author name]
date: YYYY/MM/DD
references:
    - [CVE URL or blog URL — required]
tags:
    - attack.[tactic]
    - attack.tNNNN.NNN
logsource:
    category: [process_creation|network_connection|file_event|etc.]
    product: [windows|linux|cloud]
detection:
    selection:
        [field]: [value]
    filter_legitimate:
        [field]: [known-FP-value]
    condition: selection and not filter_legitimate
falsepositives:
    - [At least one realistic FP scenario]
level: [critical|high|medium|low|informational]
```

### Step 3 — Validate

Every rule must pass:
- [ ] Valid MITRE ATT&CK `tags:` (real `Txxxx` IDs only — no invented ones)
- [ ] Populated `references:` block (CVE, blog, or incident URL)
- [ ] At least one realistic `falsepositives:` entry
- [ ] Valid pySigma-parseable YAML (no comment wrappers)
- [ ] `id:` field is a valid UUID v4

```bash
# Validate with sigma CLI
sigma check rules/your_rule.yml

# Convert to Splunk SPL
sigma convert -t splunk -p splunk_windows rules/your_rule.yml

# Convert to Elastic ES|QL
sigma convert -t elasticsearch rules/your_rule.yml

# Convert to OpenSearch (HiveArmor)
sigma convert -t opensearch rules/your_rule.yml
```

### Step 4 — Convert (optional)

SIEM-specific outputs:

| Target SIEM | sigma CLI target |
|-------------|-----------------|
| Splunk | `-t splunk` |
| Elastic (ES|QL) | `-t elasticsearch` |
| OpenSearch | `-t opensearch` |
| Wazuh | `-t wazuh` |
| Chronicle/YARA-L | `-t chronicle` |
| KQL (Azure Sentinel) | `-t microsoft365defender` |

### Step 5 — Save

Suggested path convention:
```
detections/sigma/<platform>/<tactic>/<txxxx-nnnn>_<descriptive-slug>.yml
```

Example:
```
detections/sigma/windows/lateral_movement/t1021-002_psexec_remote_service.yml
```

## High-Value Rule Patterns

### Suspicious Process Execution

```yaml
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        ParentImage|endswith: '\cmd.exe'
        Image|endswith:
            - '\powershell.exe'
            - '\wscript.exe'
            - '\cscript.exe'
    condition: selection
```

### LSASS Access (Credential Dumping)

```yaml
logsource:
    category: process_access
    product: windows
detection:
    selection:
        TargetImage|endswith: '\lsass.exe'
        GrantedAccess|contains:
            - '0x1010'
            - '0x1410'
    filter_legitimate:
        SourceImage|endswith:
            - '\svchost.exe'
            - '\lsass.exe'
    condition: selection and not filter_legitimate
```

## Quality Checklist

Before finalizing any rule:
- [ ] Detection logic tested against sample logs
- [ ] FP filter covers known-good behavior
- [ ] ATT&CK IDs verified at attack.mitre.org
- [ ] References link to actual threat reports/CVEs
- [ ] Severity matches actual attacker capability/impact
- [ ] Status set to `experimental` (not `stable`) for new rules
