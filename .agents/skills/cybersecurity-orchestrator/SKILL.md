---
name: cybersecurity-orchestrator
description: Multi-agent cybersecurity orchestrator — coordinates 8 specialized security agents (vuln detection, auth review, secrets, supply chain, IaC, threat intel, AI code patterns, logic flaws) for comprehensive security analysis. Triggered by "full security audit", "orchestrate security review", "comprehensive security scan".
---

# Cybersecurity Multi-Agent Orchestrator

Coordinates 8 specialized security agents for comprehensive security analysis.

## Agent Roster

| Agent | Specialty | Invocation |
|-------|----------|------------|
| `vuln-detector` | OWASP/CWE vulnerability patterns | `/vuln-detector` |
| `auth-reviewer` | Authorization, JWT, RBAC | `/auth-reviewer` |
| `secret-scanner` | Credential exposure | `/secret-scanner` |
| `supply-chain` | Dependency vulnerabilities | `/supply-chain` |
| `iac-auditor` | Dockerfile, k8s, Terraform | `/iac-auditor` |
| `threat-intel` | IOC correlation, threat feeds | `/threat-intel` |
| `ai-code-review` | AI-generated code risk patterns | `/ai-code-review` |
| `logic-auditor` | Business logic flaws | `/logic-auditor` |

## Orchestration Modes

### Full Audit (all 8 agents)
```
/cybersecurity-orchestrator full
Target: [file, directory, or PR diff]
```

### Quick Scan (4 core agents)
```
/cybersecurity-orchestrator quick
Agents: vuln-detector, auth-reviewer, secret-scanner, logic-auditor
```

### PR Review (diff only)
```
/cybersecurity-orchestrator diff
Target: [PR number or git diff]
```

## Orchestration Flow

```
1. GATHER: Stack detection, entry-point enumeration, threat modeling
   ↓
2. ANALYZE: All 8 agents run in parallel on their domains
   ↓
3. CORRELATE: Cross-reference findings for attack chains
   ↓
4. SCORE: Weighted composite score (A-F grade)
   ↓
5. REPORT: Prioritized findings with remediation steps
```

## Attack Chain Detection

The orchestrator correlates findings across agents to identify chained vulnerabilities:

Example chain: `SEC-01 (password in GET param)` + `missing @PreAuthorize` → **credential exposure + unauthorized access** → elevated severity

## HiveArmor Integration

For PR reviews, the orchestrator checks against the AGENTS.md security rules:
1. No SEC-01..04 anti-patterns in new code
2. All new endpoints have @PreAuthorize
3. Audit trail implemented for required operations
4. Liquibase changes follow schema rules
5. Plugin binary names follow `com.hivearmor.<name>.plugin` convention
