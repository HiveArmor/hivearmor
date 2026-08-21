---
name: sigma-rule-reviewer
description: Review and validate existing Sigma detection rules — spec compliance, false positive analysis, severity calibration, ATT&CK mapping, detection logic walkthrough. Triggered by "review this sigma rule", "validate sigma rule", "sigma rule quality", "detect rule audit", "sigma false positives".
---

# Sigma Rule Reviewer

Accepts an existing Sigma rule and produces a structured quality review.

## Activation Patterns

- User pastes a Sigma YAML rule seeking feedback
- "Review this detection" or "audit this sigma rule"
- Questions about rule noisiness or false positive reduction

## Review Workflow

1. Accept the rule and echo back verbatim (confirm parsing)
2. Run structural validation against the Sigma spec
3. Bucket findings into Errors / Warnings / Notes
4. Provide a detection logic walkthrough (plain English)
5. Offer an opt-in revised version
6. Optional: SIEM conversion on request

## Finding Categories

| Level | Meaning |
|-------|--------|
| ERROR | Spec violation — rule will fail to compile or produce wrong results |
| WARNING | Likely false positive source or quality gap |
| NOTE | Style, completeness suggestion, or improvement opportunity |

**Never soften `ERROR` to `WARNING`.** Honest severity only.

## Structural Checklist

```yaml
# Required fields
title:            # Present, descriptive, under 80 chars?
id:               # UUID v4 format?
status:           # experimental/test/stable/deprecated
description:      # ≥1 sentence describing what and why
author:           # Present?
date:             # YYYY/MM/DD format?
references:       # At least one source reference?
tags:             # ATT&CK technique IDs (attack.tNNNN)?
logsource:        # product AND category OR service specified?
detection:        # At least one named selection, with condition?
falsepositives:   # Non-empty — "None known" is explicit, empty is a gap
level:            # critical/high/medium/low/informational
```

## High-Value Review Points

### ATT&CK Mapping
- Verify technique IDs are real (check `attack.mitre.org`)
- Tactic tags: `attack.initial_access`, `attack.execution`, `attack.persistence`, etc.
- Sub-technique format: `attack.t1059.001` (not `attack.t1059/001`)

### False Positives
An **empty** `falsepositives:` section is a common alert-fatigue cause. If the analyst can't name at least one false positive scenario, the detection hasn't been properly thought through.

### Condition Logic
```yaml
# ❌ Overly broad — fires on ANY sysmon EventID 1
detection:
  selection:
    EventID: 1
  condition: selection

# ✅ Constrained to high-risk parent processes
detection:
  selection:
    EventID: 1
    ParentImage|endswith:
      - '\winword.exe'
      - '\excel.exe'
      - '\outlook.exe'
  condition: selection
```

### Keyword Specificity
- `*` wildcards at the start of a string (`CommandLine|contains: '*encoded'`) are expensive and should be noted
- Regex patterns without anchors can match unexpectedly broadly

### Internal Indicators
Field values like specific internal hostnames, IP ranges, or organizational CIDRs should be flagged as potential information leakage if the rule is published publicly.

## Detection Logic Walkthrough (Required)

Every review must include a plain-English walkthrough of what the rule actually detects:

"This rule fires when a Windows process creation event (EventID 4688) is observed where the parent process is a Microsoft Office application and the child process is a scripting interpreter (cmd, PowerShell, wscript). This combination indicates macro-based code execution, consistent with spear-phishing delivery."

This forces honest evaluation — if you can't explain it plainly, the detection logic may be flawed.

## Improvement Output Template

```markdown
## Sigma Rule Review
**Title:** [rule title]
**Analyst:** [name] | **Date:** [ISO date]

### Summary
[Overall quality assessment in 2 sentences]

### Errors
- [Line N]: [error description with specific fix]

### Warnings
- [Line N]: [warning description]

### Notes
- [suggestion]

### Detection Logic Walkthrough
[Plain English explanation]

### Improvement Opportunities
- [ ] [Specific suggestion with example YAML]
```
