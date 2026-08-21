---
name: vuln-research
description: CVE vulnerability research — NVD/GHSA/CISA KEV lookups, EPSS scoring, reachability analysis, patch window assessment, PoC verification. Triggered by "research this CVE", "vulnerability assessment", "is this CVE exploitable", "patch urgency", "EPSS score".
---

# Vulnerability Research

End-to-end CVE investigation beyond "do we have this package?" to answering real risk questions.

## Core Questions

- Is the vulnerable code path actually invoked?
- Does a public proof-of-concept exist?
- Is a patch available, and what's the exposure window?
- Is CISA tracking active exploitation?

## Research Workflow

| Phase | Key Action |
|-------|-----------|
| Source Pull | NVD, vendor advisory, GitHub GHSA, CISA KEV, EPSS |
| Version Confirm | Match fix commit to your exact installed version |
| Env Mapping | Trace direct vs. transitive dependency chains |
| Reachability | Grep for the vulnerable function in actual codebase |
| PoC Check | GitHub search, Exploit-DB, GreyNoise telemetry |
| Decision | Patch / Mitigate / Accept Risk (all require documentation) |

## Key Data Sources

```bash
# NVD API lookup
curl "https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-YYYY-NNNNN"

# CISA KEV check (is this actively exploited?)
curl "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json" \
  | jq '.vulnerabilities[] | select(.cveID == "CVE-YYYY-NNNNN")'

# EPSS score (probability of exploitation within 30 days)
curl "https://api.first.org/data/v1/epss?cve=CVE-YYYY-NNNNN"

# GitHub advisory search
gh api /advisories --jq '.[] | select(.cve_id == "CVE-YYYY-NNNNN")'
```

## EPSS Scoring Guide

| EPSS Score | Priority |
|-----------|---------|
| > 0.7 | Treat as urgent — high probability of exploitation |
| 0.1–0.7 | Patch on regular cadence |
| < 0.1 | Patch when convenient |

## Reachability Analysis

```bash
# Java — find if vulnerable method is called
grep -rn "VulnerableClass\|vulnerableMethod" backend/src/main/java/

# Go — check if affected package is actually used
grep -rn "packagename.VulnerableFunc" --include="*.go" .

# Check transitive dependency in Maven
cd backend && mvn -s settings.xml dependency:tree | grep "affected-artifact"

# Check transitive dependency in Go
go mod graph | grep "affected-module"
```

## Decision Framework

| Decision | Requirements |
|----------|-------------|
| Patch immediately | CISA KEV listed OR EPSS > 0.7 OR code path reachable AND PoC public |
| Patch on cadence | EPSS 0.1–0.7, code path reachable, no active exploitation |
| Mitigate + monitor | Can't patch now, add compensating controls (WAF rule, network isolation) |
| Accept risk | EPSS < 0.1 AND code path unreachable AND no PoC |

**Accepting risk requires three documented fields: why, compensating controls, re-evaluation trigger — no exceptions.**

## HiveArmor Dependency Audit Commands

```bash
# Java — OWASP dependency check
cd backend && mvn -s settings.xml org.owasp:dependency-check-maven:check \
  -DfailBuildOnCVSS=7

# Go — govulncheck
cd event-processor && govulncheck ./...
cd agent && govulncheck ./...
cd agent-manager && govulncheck ./...

# Frontend
cd frontend-v2 && npm audit --audit-level=high
```

## Boundary

Research is strictly for assessing applicability. Do not develop, weaponize, or distribute exploit code.
