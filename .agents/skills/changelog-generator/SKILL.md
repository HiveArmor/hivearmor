---
name: changelog-generator
description: Generate changelogs from git commits since the last release. Triggered by "generate changelog", "what changed since release", "create release notes". Outputs Keep a Changelog format.
---

# Changelog Generator Skill

Generate structured changelogs from git commit history.

## Workflow

### Step 1 — Detect versioning convention
```bash
# Check existing CHANGELOG.md for format clues
head -20 CHANGELOG.md 2>/dev/null

# Find last release tag
git describe --tags --abbrev=0

# List recent tags
git tag --sort=-version:refname | head -10
```

### Step 2 — Collect commits since last release
```bash
LAST_TAG=$(git describe --tags --abbrev=0)
git log ${LAST_TAG}..HEAD --oneline --no-merges

# Full log with body for important commits
git log ${LAST_TAG}..HEAD --pretty=format:"%h %s%n%b" --no-merges
```

### Step 3 — Map commit types to sections

| Commit type | Changelog section |
|---|---|
| `feat` | **Added** |
| `fix` | **Fixed** |
| `perf`, `refactor` | **Changed** |
| `build`, `chore` (dep updates) | **Changed** |
| `docs` | **Changed** (if user-facing) / omit |
| `test`, `ci` | Omit from user changelog |
| `BREAKING CHANGE` footer | **Changed** (bold + **BREAKING**) |
| Security fix | **Security** |
| `deprecate` | **Deprecated** |
| Feature removed | **Removed** |

### Step 4 — Format output

#### Keep a Changelog format (default)
```markdown
## [Unreleased] — 2026-07-15

### Added
- Bulk alert status update endpoint (`POST /api/ha-alerts/bulk-status`)
- SOC AI assistant drawer with alert triage narration (F-15)

### Fixed
- JWT token exposed in error response body when authentication fails
- OpenSearch bulk write dropping documents on buffer overflow

### Changed
- Event processor enrichment extracted into dedicated pipeline stage
- Spring Boot upgraded to 3.3.5

### Security
- **BREAKING**: Remove password from GET query param in account endpoint (SEC-01)
```

## Version Bump Rules

| Commits contain | Version bump |
|---|---|
| `BREAKING CHANGE` footer | Major (1.x.x → 2.0.0) |
| `feat` | Minor (1.2.x → 1.3.0) |
| `fix`, `perf`, `refactor` only | Patch (1.2.3 → 1.2.4) |

## Non-Conventional Commits

Group unclassifiable commits under **Changed** with the commit hash as reference.

## Commands

```bash
# Token-efficient initial scan
git log ${LAST_TAG}..HEAD --oneline --no-merges | head -50

# Get PR numbers from commit bodies (if squash-merged)
git log ${LAST_TAG}..HEAD --pretty=format:"%s" | grep -oE "#[0-9]+"

# Count by type for summary
git log ${LAST_TAG}..HEAD --pretty=format:"%s" --no-merges | \
  grep -oE "^(feat|fix|refactor|perf|build|chore|test|docs)" | sort | uniq -c
```

## Prepend to Existing CHANGELOG.md

When updating an existing file, **prepend only** — never rewrite older entries.

```bash
# Prepend new section
NEW_SECTION="## [1.3.0] — 2026-07-15\n\n..."
sed -i "s/# Changelog/# Changelog\n\n${NEW_SECTION}/" CHANGELOG.md
```
