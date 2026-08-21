---
name: dependency-audit
description: Dependency and supply chain security audit — CVE scanning across npm/Maven/Go/pip, runtime vs dev-only scope, supply chain checks (lockfile integrity, CI pinning, postinstall scripts), Next.js middleware bypass, framework-specific gotchas. Triggered by "dependency audit", "supply chain security", "npm audit", "govulncheck", "vulnerable library".
---

# Dependency & Stack Security Audit

Audits project dependencies, runtimes, and CI/CD for CVEs, misconfigurations, and supply chain risks.

## Step 1 — Inventory

Catalog all package manifests:
```bash
find . -name "package.json" -not -path "*/node_modules/*"
find . -name "go.mod" -o -name "go.sum"
find . -name "pom.xml" -o -name "build.gradle"
find . -name "requirements.txt" -o -name "Pipfile"
```

Note edge cases: `optionalDependencies`, monorepo sub-packages, Docker base image versions.

## Step 2 — Automated Scanning

### Node.js / npm

```bash
# Production dependencies only (most relevant)
npm audit --omit=dev --json > npm-audit.json

# Parse critical/high only
npm audit --omit=dev --audit-level=high

# DRY RUN before fixing — --force can downgrade packages
npm audit fix --dry-run
npm audit fix  # only after reviewing dry-run output
```

### Java / Maven (HiveArmor backend)

```bash
cd backend
mvn -s settings.xml dependency-check:check -DfailBuildOnCVSS=7
# Report in target/dependency-check-report.html

# Check specific CVE
mvn -s settings.xml dependency-check:check \
  -Dsuppress.file=dependency-check-suppressions.xml
```

### Go

```bash
# govulncheck — checks only reachable vulnerabilities (not just dep tree)
govulncheck ./...

# For specific modules
govulncheck github.com/hivearmor/event-processor/...
```

### Python / pip

```bash
pip audit
# or
safety check -r requirements.txt
```

## Step 3 — Framework-Specific Risks

### Next.js (HiveArmor frontend-v2)

```bash
# Middleware auth bypass (critical category)
# If middleware.ts handles auth AND route.ts also handles auth,
# a bypass in middleware skips route handler auth entirely
grep -rn "NextResponse.redirect\|NextResponse.next" frontend-v2/middleware.ts

# Server-only data leaking to client bundles
grep -rn "import.*'server-only'" frontend-v2/src/app/api/
```

### Go Specifics

- In-memory state ≠ rate limiter — module-scoped Maps reset on cold starts/restarts
- Go modules use cryptographic checksums in go.sum — verify integrity
- `replace` directives in go.mod can redirect imports to local or malicious paths

```bash
# Verify no suspicious replace directives
grep "replace" agent/go.mod agent-manager/go.mod event-processor/go.mod
```

## Step 4 — Supply Chain Checks

### Dependency Confusion

```bash
# Check if private package names could be typosquatted on public registries
# Package names in package.json that aren't scoped (@org/) are vulnerable
grep '"name"' package.json | grep -v '"@'
```

### GitHub Actions Pinning

```bash
# Actions should use SHA, not tag (tags are mutable)
grep -rn "uses:.*@v[0-9]" .github/workflows/
# ❌ uses: actions/checkout@v4
# ✅ uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
```

### npm postinstall Scripts

```bash
# Malicious packages often hide in postinstall
cat package.json | jq '.scripts.postinstall'
find node_modules -name "package.json" -exec jq -r 'select(.scripts.postinstall) | "\(.name): \(.scripts.postinstall)"' {} \; 2>/dev/null
```

### Lockfile Integrity

```bash
# CI should use npm ci (not npm install) — uses lockfile exactly
# Verify in CI config
grep "npm ci\|npm install" .github/workflows/*.yml
```

## Step 5 — CI/CD Audit

```bash
# Unpinned Docker base images in CI
grep -rn "FROM.*:latest" Dockerfile* .github/workflows/

# Root-running containers
grep -rn "USER root" Dockerfile*

# Secrets baked into layers
grep -rn "ARG.*PASSWORD\|ARG.*SECRET\|ARG.*KEY" Dockerfile*
```

## Report Format

```markdown
## Dependency Audit Report
**Date:** [ISO date] | **Scanned by:** [tool]

| CVE | Package | Version | Severity | Scope | Remediation |
|-----|---------|---------|---------|-------|-------------|
| CVE-2024-XXXX | package-name | 1.2.3 | Critical | runtime | Upgrade to 1.2.4 |
| CVE-2024-YYYY | dev-package | 2.0.0 | High | dev-only | Upgrade — low priority |

### Supply Chain Findings
- [ ] Unpinned GitHub Actions in CI
- [ ] Service accounts with npm publish access lack MFA

### Next Steps (Prioritized)
1. Critical runtime CVEs — patch this sprint
2. High runtime CVEs — patch within 7 days
```

**Build/dev-only vulnerabilities should NOT block a production release on their own** — document with risk rationale, but prioritize runtime reachable vulnerabilities.
