---
name: ship-gate
description: Pre-production deploy gate for HiveArmor — blocks shipping until all critical checks pass. Covers security (SEC-01..04), schema migrations (Liquibase), frontend types, build health, and Go plugin binary names. Use before any production deploy or release PR merge. Based on alirezarezvani/Codex-skills ship-gate.
metadata:
  type: skill
  source: alirezarezvani/Codex-skills (adapted inline — network blocked)
---

# Ship Gate — HiveArmor Pre-Production Checklist

## When to Use
Run this gate before:
- Merging any PR into `main`
- Cutting a release branch
- Deploying to production (even a hotfix)
- Pushing a new Docker image to `ghcr.io/hivearmor/`

---

## Gate Execution

Run each section in order. A ❌ at any gate blocks the deploy. A ⚠️ is advisory.

---

### Gate 1 — Security (BLOCKING)

```bash
# 1a. SEC-01: Password/secret in GET query params (new code only)
git diff main...HEAD -- '*.java' | grep "^\+" | grep -i "@RequestParam" | \
  grep -i "password\|secret\|token\|apikey" | grep -v "//\|test\|mock"
# Expected: 0 matches

# 1b. SEC-03: CORS wildcard in config
git diff main...HEAD -- '*.yml' | grep "^\+" | grep -i "allowed-origins" | grep '"\*"'
# Expected: 0 matches

# 1c. SEC-04: TLS skip verify
git diff main...HEAD -- '*.go' | grep "^\+" | grep "InsecureSkipVerify: true"
# Expected: 0 matches

# 1d. Missing @PreAuthorize on new Java endpoints
git diff main...HEAD -- '*/web/rest/*.java' | \
  grep -B5 "^\+.*@GetMapping\|^\+.*@PostMapping\|^\+.*@PutMapping\|^\+.*@DeleteMapping" | \
  grep -v "@PreAuthorize\|//\|test"
# Review manually — each new endpoint must have @PreAuthorize or be in public path list

# 1e. Hardcoded secrets in Go (new code)
git diff main...HEAD -- '*.go' | grep "^\+" | \
  grep -E '(password|secret|apikey|api_key)\s*:?=\s*"[^"]{4,}"' | \
  grep -v "test\|mock\|example\|\.env"
# Expected: 0 matches

# 1f. govulncheck — known CVEs in Go dependencies
cd event-processor && govulncheck ./... 2>&1 | grep -i "vulnerability\|FAIL"
cd plugins/soc-ai && govulncheck ./... 2>&1 | grep -i "vulnerability\|FAIL"
# Expected: no HIGH/CRITICAL vulnerabilities
```

**Gate 1 result: ✅ PASS / ❌ FAIL**

---

### Gate 2 — Schema Migrations (BLOCKING)

```bash
# 2a. Liquibase validate — no malformed or conflicting changesets
cd backend
mvn -s settings.xml liquibase:validate -q 2>&1 | tail -5
# Expected: BUILD SUCCESS

# 2b. Check master.xml inclusion order (must be date-ordered)
grep "include file" backend/src/main/resources/config/liquibase/master.xml | \
  grep -o '[0-9]\{11\}' | sort | uniq -d
# Expected: 0 duplicate changeset IDs

# 2c. No DROP COLUMN or RENAME COLUMN in new changesets
git diff main...HEAD -- '*/changelog/*.xml' | grep "^\+" | \
  grep -i "dropColumn\|renameColumn\|dropTable"
# Expected: 0 matches (requires 2-release deprecation cycle)

# 2d. New columns have defaultValue or nullable=true
git diff main...HEAD -- '*/changelog/*.xml' | grep "^\+" | grep "addColumn" -A5 | \
  grep -v "defaultValue\|nullable=\"true\"\|nullable='true'"
# Review manually — nullable or default required
```

**Gate 2 result: ✅ PASS / ❌ FAIL**

---

### Gate 3 — Frontend Build (BLOCKING)

```bash
cd frontend-v2

# 3a. TypeScript type check
npx tsc --noEmit 2>&1 | grep -c "error TS"
# Expected: 0

# 3b. ESLint (no new errors)
npm run lint 2>&1 | grep -c "Error"
# Expected: 0 (warnings OK, errors block)

# 3c. Production build succeeds
npm run build 2>&1 | tail -20
# Expected: "Route (app)" table — no build errors

# 3d. No hardcoded backend URLs (must use NEXT_PUBLIC_API_URL or proxy)
grep -rn "localhost:8088\|localhost:8080\|127.0.0.1:8" src/ --include="*.ts" --include="*.tsx"
# Expected: 0 matches in non-test files

# 3e. No JWT key exposed in non-auth files
grep -rn "hivearmor_auth_token" src/ | grep -v "auth.ts\|route.ts\|middleware.ts"
# Expected: 0 matches (JWT key only in store/auth.ts and api proxy)
```

**Gate 3 result: ✅ PASS / ❌ FAIL**

---

### Gate 4 — Go Plugin Binary Names (BLOCKING)

```bash
# All plugin binaries must be named com.hivearmor.<name>.plugin
# event-processor loads plugins by EXACT name

for plugin_dir in plugins/*/; do
  name=$(basename "$plugin_dir")
  # Check main.go for InitCorrelationPlugin call with correct name
  if grep -l "InitCorrelationPlugin\|InitPlugin" "$plugin_dir"*.go 2>/dev/null; then
    expected="com.hivearmor.${name}.plugin"
    if grep -q "\"$expected\"" "$plugin_dir"*.go 2>/dev/null; then
      echo "✅ $name: correct name"
    else
      echo "❌ $name: WRONG plugin name — expected $expected"
    fi
  fi
done
```

**Gate 4 result: ✅ PASS / ❌ FAIL**

---

### Gate 5 — Docker Images (BLOCKING for infra changes)

```bash
# 5a. Images use non-root user
for dockerfile in $(git diff main...HEAD --name-only | grep Dockerfile); do
  if grep -q "USER\s\+root\|USER\s\+0" "$dockerfile"; then
    echo "❌ $dockerfile: root user detected"
  else
    grep "USER" "$dockerfile" | tail -1
  fi
done

# 5b. Secrets not baked into images
for dockerfile in $(git diff main...HEAD --name-only | grep Dockerfile); do
  grep -in "password\|secret\|api.key\|token" "$dockerfile" | grep -v "ARG\|ENV.*\${"
  # Any output = potential secret hardcoded
done

# 5c. HEALTHCHECK present for long-running services
for dockerfile in $(git diff main...HEAD --name-only | grep Dockerfile); do
  if ! grep -q "HEALTHCHECK" "$dockerfile"; then
    echo "⚠️ $dockerfile: missing HEALTHCHECK"
  fi
done
```

**Gate 5 result: ✅ PASS / ❌ FAIL**

---

### Gate 6 — CI Pipeline (ADVISORY)

```bash
# Check latest workflow run on main
gh run list --branch main --workflow deployment-pipeline.yml --limit 5

# Check current PR's CI status
gh pr checks

# Trivy scan latest images (if CI ran)
# gh run view <latest-run-id> --log | grep -i "CRITICAL\|HIGH" | grep -v "0 vulnerabilities"
```

**Gate 6 result: ✅ PASS / ⚠️ Advisory**

---

### Gate 7 — Audit Trail Completeness (ADVISORY)

Review that new features have audit trail entries for:
- [ ] Alert status changes (open → in_progress → closed → suppressed)
- [ ] Incident status changes
- [ ] Agent remote command execution
- [ ] User login / logout
- [ ] API key creation / deletion
- [ ] Detection rule changes (enable / disable / edit)

Check the `ApplicationEventService` calls in modified files:
```bash
git diff main...HEAD -- '*.java' | grep "^\+" | grep "ApplicationEventService\|auditEvent\|AuditEvent"
# If status-changing endpoints are modified, this should have matches
```

**Gate 7 result: ✅ Complete / ⚠️ Review needed**

---

## Ship Gate Summary Template

Copy this into your PR description before requesting final approval:

```
## Ship Gate Results

| Gate | Status | Notes |
|---|---|---|
| 1. Security (SEC-01..04, vulns) | ✅ / ❌ | |
| 2. Liquibase validate | ✅ / ❌ | |
| 3. Frontend build + types | ✅ / ❌ | |
| 4. Plugin binary names | ✅ / ❌ | N/A if no plugin changes |
| 5. Docker image safety | ✅ / ❌ | N/A if no Dockerfile changes |
| 6. CI pipeline | ✅ / ⚠️ | Link to run: |
| 7. Audit trail | ✅ / ⚠️ | |

**Deploy decision: APPROVED / BLOCKED**
Blocker reason (if blocked): 
```

---

## Fast Gate (for hotfixes only)

When time-critical, run only the BLOCKING gates:

```bash
# Fast gate — runs in ~60 seconds
echo "=== SEC-01 ===" && \
  git diff main...HEAD -- '*.java' | grep "^\+" | grep -i "@RequestParam" | grep -i "password\|secret" | grep -v test

echo "=== SEC-04 ===" && \
  git diff main...HEAD -- '*.go' | grep "^\+" | grep "InsecureSkipVerify: true"

echo "=== Liquibase ===" && \
  cd backend && mvn -s settings.xml liquibase:validate -q 2>&1 | tail -3

echo "=== TS types ===" && \
  cd frontend-v2 && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

All outputs should be either 0 matches or BUILD SUCCESS. Anything else blocks the hotfix.
