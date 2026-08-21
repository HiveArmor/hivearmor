---
name: cybersecurity-pro
description: Comprehensive cybersecurity document generation across 22 domains — IR playbooks, SOC triage, DFIR, DevSecOps, cloud security, zero trust, AI/ML security, GRC compliance. Triggered by "cybersecurity assessment", "security document", "generate IR playbook", "write security policy", "compliance report".
---

# Cybersecurity Pro — Professional Security Document Generation

Comprehensive security document generation across 22 domains.

## Domain Coverage

| Cluster | Domains |
|---|---|
| Operations | IR Playbooks, SOC Triage, DFIR Forensics |
| Engineering | DevSecOps, GitOps, Code Security, Container/Supply Chain |
| Architecture | Cloud/CSPM, Zero Trust, OT/ICS, Post-Quantum Crypto |
| Risk & Compliance | Threat Modeling, NIST 800-53, PCI-DSS, GDPR, ISO 27001 |
| Emerging Tech | AI/ML Security, Agentic AI, API Security, Web3/Blockchain |
| Governance | Executive Leadership, Threat Intelligence, Identity/IAM |

## Key Behaviors

- Every output maps to relevant standards (MITRE ATT&CK IDs, NIST controls, OWASP categories)
- Keyword matching selects the correct domain reference before generating output
- Shannon Handoff: post-pentest mode reads a `handoff-manifest.json` to auto-generate defensive documents

## Output Formats

| Document Type | Format |
|---|---|
| Formal reports | `.docx` |
| Operational docs | `.md` |
| Pipeline configs | `.yml`/`.yaml` |
| Policy configs | `.json`/`.rego`/`.tf` |

## Severity Scale

| Level | SLA |
|-------|-----|
| Critical | Respond within 15 minutes |
| High | Respond within 1 hour |
| Medium | Respond within 4 hours |
| Low | Respond within 24 hours |
| Informational | Next business day |

## Quick Document Templates

### Incident Response Playbook

```markdown
# IR Playbook: [Incident Type]
**Framework:** NIST SP 800-61 | **MITRE ATT&CK:** [Txxxx]

## Trigger Conditions
[What alerts/indicators activate this playbook]

## Roles
- Incident Commander: [role]
- Technical Lead: [role]
- Communications Lead: [role]

## Phase 1: Detection & Analysis (0–30 min)
- [ ] Verify alert authenticity
- [ ] Classify severity
- [ ] Notify stakeholders

## Phase 2: Containment (30–60 min)
- [ ] Isolate affected systems
- [ ] Preserve evidence
- [ ] Block IOCs

## Phase 3: Eradication & Recovery
- [ ] Root cause analysis
- [ ] Remove malware/backdoors
- [ ] Restore from clean backup

## Phase 4: Post-Incident
- [ ] Write post-mortem
- [ ] Update detection rules
- [ ] Lessons learned session
```

### DevSecOps Pipeline Security Checklist

```yaml
# CI/CD security gates
security_gates:
  pre_commit:
    - secrets_scan: gitleaks
    - sast: semgrep
  pull_request:
    - dependency_scan: snyk
    - container_scan: trivy
  pre_deploy:
    - dast: zap
    - compliance_check: opa_rego
  post_deploy:
    - runtime_monitoring: falco
```

## HiveArmor Integration Points

- IR Playbooks → SOAR playbook engine (`/api/ha-soar-playbooks`)
- SOC Triage → Alert management (`/api/ha-alerts`)
- Compliance Reports → Compliance module (`/api/ha-compliance`)
- Threat Intelligence → CTI feeds (`/api/ha-threat-intel`)
