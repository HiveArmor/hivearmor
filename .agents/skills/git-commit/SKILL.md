---
name: git-commit
description: Generate conventional commit messages for Java/Go changes. Triggered by "commit these changes", "create commit", "write commit message". Uses Conventional Commits format with type(scope): subject.
---

# Git Commit Skill

Generate well-structured commit messages using **Conventional Commits** format.

## Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

## Commit Types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `perf` | Performance improvement |
| `build` | Build system, CI, dependencies |
| `chore` | Maintenance, config, tooling |

## Scope Examples (HiveArmor)

| Scope | Covers |
|---|---|
| `alerts` | Alert service, controller, queries |
| `incidents` | Incident management |
| `auth` | JWT, SecurityConfiguration, login |
| `agents` | Agent manager, gRPC |
| `plugins` | Go correlation plugins |
| `event-processor` | Core pipeline |
| `frontend` | Next.js pages, components |
| `db` | Liquibase migrations |
| `ci` | GitHub Actions workflows |

## Workflow

1. Analyze staged changes: `git diff --cached --stat`
2. Identify the primary scope from modified file paths
3. Determine type: was behavior added, fixed, or restructured?
4. Draft subject line: **imperative mood**, under 50 characters
5. Add body if the WHY needs explanation (wrap at 72 chars)
6. Add footer for breaking changes

## Subject Line Rules

- Imperative mood: "add", "fix", "update" — not "added", "fixes", "updated"
- Under 50 characters
- No period at end
- Lowercase after the colon

## Examples

```
feat(alerts): add bulk status update endpoint

fix(auth): prevent JWT exposure in error response body

refactor(event-processor): extract enrichment into separate stage

perf(opensearch): batch alert writes to reduce round trips

build(ci): add govulncheck step to deployment pipeline

chore(deps): upgrade Spring Boot to 3.3.5
```

## Body — Explain WHY

```
fix(auth): rotate JWT signing key on schedule

Prior behavior regenerated the key only on restart (DEBT-14),
invalidating all active sessions. This adds a 24-hour rotation
with overlap window so existing tokens remain valid during rollover.
```

## Footer — Breaking Changes

```
feat(plugins): require semantic version in plugin descriptor

BREAKING CHANGE: PluginDescriptor now requires a `version` field
in semver format (e.g. "1.2.3"). Plugins without it will fail to load.
Migrate: add `version = "1.0.0"` to all plugin descriptors.
```

## Anti-Patterns to Avoid

```
❌ fix stuff
❌ update code
❌ WIP
❌ asdfgh
❌ Fixed the bug with the thing in the class
❌ Mixing unrelated changes in one commit
```

## After Committing

```bash
# Push to remote
git push origin <branch>

# Or create PR
gh pr create --title "<commit subject>" --body "..."
```
