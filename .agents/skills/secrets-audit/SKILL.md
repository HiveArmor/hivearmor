---
name: secrets-audit
description: Secrets audit — find leaked credentials in source/history/CI, assess secrets management posture, rotation cadence, gitleaks/trufflehog/detect-secrets tooling. Triggered by "secrets audit", "leaked credentials", "scan for secrets", "API keys in code", "rotate secrets".
---

# Secrets Audit: Credential Exposure & Management Review

## Two Core Objectives

1. **Find already-leaked secrets** in source, history, and artifacts
2. **Assess posture** to prevent future leaks

## Finding Leaked Secrets

### High-Confidence Pattern Scanning

Target known provider prefixes first — false positives are minimal:

| Provider | Pattern |
|----------|---------|
| AWS | Keys start with `AKIA` or `ASIA` |
| GitHub | Tokens match `gh[pousr]_` |
| Stripe | Live keys begin `sk_live_` |
| OpenAI | Keys use `sk-` prefix |
| Anthropic | Keys use `sk-ant-` prefix |

```bash
# Quick scan with gitleaks
gitleaks detect --source . --verbose

# Scan git history
gitleaks detect --source . --log-opts="--all"

# trufflehog — verifies findings against live APIs
trufflehog git file://. --json

# HiveArmor-specific patterns
grep -rn "INTERNAL_KEY\|REPLACE_KEY\|MAXMIND_LICENSE\|AGENT_SECRET" \
  --include="*.go" --include="*.java" --include="*.ts" --include="*.env*" .
grep -rn "password.*=.*['\"]" --include="*.yml" --include="*.yaml" .
```

### Git History — Commonly Overlooked

Removing a secret from the latest commit doesn't erase it from history. Every fork and local clone retains it.

Tools: `git filter-repo` or `bfg` can rewrite history.

**Rule: Always rotate first, history-rewrite second.**

### Other Leak Surfaces

Beyond `.env` files, secrets appear in:
- Docker image layers (`ENV` instructions, `--build-arg`)
- Frontend bundles (`NEXT_PUBLIC_*` vars ship to browsers)
- CI logs, crash reports, and application logs
- Shared docs, Slack messages, README examples

## Triage Process for Found Secrets

1. Verify the credential is still active (minimal API call only)
2. Establish exposure window via commit history
3. Assess blast radius — permissions, environment (live vs. sandbox)
4. **Rotate before revoking** (revoking first breaks production)
5. Review provider audit logs for unauthorized use
6. Clean source code and optionally rewrite history
7. Document as an incident regardless of outcome

## Secrets Management Posture

### Storage Hierarchy (Worst → Best)

| Tier | Pattern |
|---|---|
| ❌ | Hardcoded in source or build artifacts |
| ❌ | Plaintext in shared docs/Slack |
| ⚠️ | `.env` file in repo (even gitignored) |
| ⚠️ | Environment variables only |
| ✅ | Secrets manager pulled at deploy time |
| ✅ | Workload identity federation (no stored secret) |

### Audit Checklist

- [ ] No secrets present anywhere in Git history
- [ ] `.gitignore` covers `.env*` patterns
- [ ] Secrets fetched at runtime, not baked into images
- [ ] IAM scoped per secret — service A reads only secret A
- [ ] Rotation cadence defined and **automated**
- [ ] Access logging enabled for every read/decrypt operation
- [ ] Staging cannot access production secrets (separate KMS keys/IAM)

### Common HiveArmor Findings

- `INTERNAL_KEY` shared by backend, agent-manager, event-processor — changing requires simultaneous redeploy
- `MAXMIND_LICENSE_KEY` used in CI for GeoLite2 CSV download
- `MAVEN_TK` GitHub PAT for GitHub Packages — scoped to `read:packages` only
- `AGENT_SECRET_PREFIX` injected at ldflags build time for agent binary

## Report Output

```markdown
# Secrets Audit Report
**Scope:** [directories/repos scanned]
**Date:** [ISO date]
**Tools used:** [gitleaks, trufflehog, etc.]

### Live Leaked Secrets
| Provider | Location | First Seen | Verified Live? | Rotation Status |

### Management Posture
| Category | Status | Notes |

### Recommendations
| Priority | Item | Owner | Deadline |
```
