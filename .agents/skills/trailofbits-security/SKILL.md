---
name: trailofbits-security
description: Trail of Bits security skills for HiveArmor — static analysis with Semgrep/CodeQL, differential review of security-relevant diffs, variant analysis for bug-class hunting. Use for security audits, pre-PR reviews, and finding recurrences of known vulnerability patterns. Based on trailofbits/skills.
metadata:
  type: skill
  source: trailofbits/skills (adapted inline — static-analysis, differential-review, variant-analysis)
---

# Trail of Bits Security Skills — HiveArmor

## When This Skill Applies
- Reviewing a PR that touches authentication, input handling, OpenSearch queries, or gRPC
- Fixing one of the known SEC-01..04 issues — use variant analysis to find all occurrences
- Running a pre-release security sweep
- Auditing new backend endpoints or Go plugins

---

## Skill 1 — Static Analysis

Integrates Semgrep and CodeQL patterns targeting HiveArmor's specific risk surface.

### Semgrep Rules for HiveArmor

```yaml
# .semgrep/hivearmor.yml — run with: semgrep --config .semgrep/hivearmor.yml .

rules:
  # SEC-01: Password/secret in GET query param
  - id: password-in-get-param
    patterns:
      - pattern: '@GetMapping(...)'
      - pattern-either:
          - pattern: '@RequestParam("password") ...'
          - pattern: '@RequestParam("secret") ...'
          - pattern: '@RequestParam("token") ...'
    message: "SEC-01: Secret value in GET query param. Use POST with request body."
    severity: ERROR
    languages: [java]
    paths:
      include: ["backend/src/**"]

  # SEC-03: CORS wildcard
  - id: cors-wildcard
    pattern: 'allowed-origins: ["*"]'
    message: "SEC-03: CORS wildcard in config. Specify exact allowed origins."
    severity: ERROR
    languages: [yaml]

  # SEC-04: InsecureSkipVerify
  - id: insecure-tls-skip-verify
    pattern: 'InsecureSkipVerify: true'
    message: "SEC-04: TLS verification disabled. Use proper certificate validation."
    severity: ERROR
    languages: [go]

  # OpenSearch string concat (injection risk)
  - id: opensearch-string-concat
    patterns:
      - pattern: '"query": "..." + $VAR'
      - pattern-not: 'QueryBuilders.$METHOD(...)'
    message: "OpenSearch query built via string concatenation — injection risk. Use QueryBuilders DSL."
    severity: WARNING
    languages: [java]
    paths:
      include: ["backend/src/**"]

  # Missing @PreAuthorize on REST controller methods
  - id: missing-preauthorize
    patterns:
      - pattern: |
          @$MAPPING(...)
          public ResponseEntity<...> $METHOD(...) { ... }
      - pattern-not: |
          @PreAuthorize(...)
          @$MAPPING(...)
          public ResponseEntity<...> $METHOD(...) { ... }
    message: "REST endpoint missing @PreAuthorize. Add authorization or explicitly add to public path list."
    severity: WARNING
    languages: [java]
    paths:
      include: ["backend/src/main/java/com/hivearmor/web/rest/**"]

  # Hardcoded credentials in Go
  - id: hardcoded-credentials-go
    patterns:
      - pattern-either:
          - pattern: 'password := "..."'
          - pattern: 'secret := "..."'
          - pattern: 'apiKey := "..."'
    pattern-not-regex: '.*test.*|.*mock.*|.*example.*'
    message: "Hardcoded credential. Use environment variable or config."
    severity: ERROR
    languages: [go]
```

### Running Static Analysis
```bash
# Install Semgrep
pip3 install semgrep

# Run HiveArmor rules
semgrep --config .semgrep/hivearmor.yml . --output=findings.sarif --sarif

# Run community security rules
semgrep --config p/java-security-audit backend/src/
semgrep --config p/golang-security event-processor/ plugins/

# CodeQL (requires GitHub CodeQL CLI)
codeql database create ha-db --language=java --source-root=backend/
codeql analyze ha-db java-security-extended.qls --format=sarif-latest --output=codeql-results.sarif

# govulncheck for Go dependencies
cd event-processor && govulncheck ./...
cd plugins/soc-ai && govulncheck ./...
```

### SARIF to Markdown Triage
```bash
# Quick readable output from SARIF
cat findings.sarif | python3 -c "
import sys, json
data = json.load(sys.stdin)
for run in data.get('runs', []):
    for result in run.get('results', []):
        rule = result.get('ruleId', 'unknown')
        msg = result.get('message', {}).get('text', '')
        locs = result.get('locations', [{}])
        path = locs[0].get('physicalLocation', {}).get('artifactLocation', {}).get('uri', '')
        line = locs[0].get('physicalLocation', {}).get('region', {}).get('startLine', '')
        print(f'[{rule}] {path}:{line} — {msg}')
"
```

---

## Skill 2 — Differential Review

Security-focused review of what changed in a diff, not the entire codebase. Identifies newly introduced or regressed vulnerabilities.

### Differential Review Checklist

When reviewing a PR or diff, apply these checks **only to changed lines**:

#### Authentication & Authorization
- [ ] New endpoint has `@PreAuthorize` OR is explicitly added to public path list in `SecurityConfiguration.java`
- [ ] No new endpoints that bypass `InternalApiKeyFilter` unintentionally
- [ ] JWT claims are validated, not just decoded
- [ ] Session management unchanged (stateless JWT — no new session state introduced)

#### Input Validation
- [ ] All user-provided strings validated before use in OpenSearch queries
- [ ] No new `@RequestParam` that takes a secret/password/token
- [ ] File uploads (if any) validated for type and size
- [ ] No new deserialization of untrusted data

#### Cryptography & Secrets
- [ ] No hardcoded credentials in new code
- [ ] New env vars referenced in code are documented in `local-dev/.env.example`
- [ ] No new `InsecureSkipVerify: true` in Go TLS config
- [ ] No new `InsecureTrustManagerFactory` in Java gRPC setup

#### OpenSearch Safety
- [ ] All new OpenSearch queries use `QueryBuilders` DSL (Java) or typed struct (Go)
- [ ] No raw string concatenation into query body
- [ ] Index pattern unchanged (`_v3_hive_<type>-YYYY.MM.DD`)

#### Audit Trail
- [ ] Alert/incident status changes emit an audit event
- [ ] Agent remote commands logged
- [ ] New API key usage logged

### Differential Review Prompt
```
Review the following diff for security issues introduced in the changed lines ONLY.
Ignore existing code that was not modified.

Focus on:
1. Missing authorization (@PreAuthorize or SecurityConfiguration entry)
2. Input validation gaps (unsanitized user input → database/OpenSearch/filesystem)
3. Secrets exposure (credentials in logs, query params, URLs)
4. TLS/authentication bypasses
5. Audit trail gaps (status changes, admin actions without logging)

For each finding, output:
- File and line number
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- Finding: one sentence
- Fix: one sentence

Diff:
{paste diff here}
```

---

## Skill 3 — Variant Analysis

Given a known vulnerability in one location, find all similar patterns across the codebase.

### Variant Analysis Workflow

**Step 1: Characterize the known vulnerability**
```
Given: SEC-01 — GET endpoint with password in query param
Location: AccountResource.java, line ~85
Pattern: @GetMapping + @RequestParam("password")
```

**Step 2: Generate search patterns**
```bash
# Find all GET mappings with sensitive params (Java)
grep -rn "@GetMapping\|@RequestParam" backend/src/ | \
  grep -i "password\|secret\|token\|key\|credential" | \
  grep -v "test\|Test\|mock\|Mock"

# Find all places where user input reaches OpenSearch without DSL builder
grep -rn "searchRequest\|searchSource" backend/src/ | grep -v "QueryBuilders"

# Find all gRPC clients without TLS verification (Go)
grep -rn "InsecureSkipVerify\|insecure.NewCredentials\|grpc.WithInsecure" \
  agent/ agent-manager/ plugins/ event-processor/

# Find all CORS configurations
grep -rn "allowed-origins\|allowedOrigins\|CorsConfiguration" \
  backend/src/ --include="*.java" --include="*.yml"
```

**Step 3: Triage each variant**
```
For each match found, determine:
- Is this the same root cause as the known bug?
- Is it in production code (not test/mock)?
- Is user-controlled input actually reachable?
- What is the exploitability? (Internal API? Admin-only endpoint? Public endpoint?)
```

**Step 4: Document variants**
```markdown
## Variant Analysis: SEC-01 (password in GET param)

Known instance: AccountResource.java:85
Variants found:

| File | Line | Pattern | Exploitable | Severity |
|---|---|---|---|---|
| UserResource.java | 142 | @RequestParam("apiKey") in GET | Yes — public endpoint | HIGH |
| AgentResource.java | 67 | @RequestParam("token") in GET | Internal only | MEDIUM |
| (none other found) | | | | |

Next action: Fix all HIGH instances before next release.
```

### HiveArmor Variant Analysis Targets

Run these searches before any release:

```bash
# 1. SEC-01 variants — all sensitive params in GET endpoints
grep -rn "@RequestParam" backend/src/main/java/com/hivearmor/web/rest/ | \
  grep -i "pass\|secret\|key\|token\|credential" | grep -v "//\|test"

# 2. SEC-04 variants — all TLS skip-verify
grep -rn "InsecureSkipVerify\|InsecureTrustManager\|grpc.WithInsecure\|skipVerify" \
  agent/ agent-manager/ event-processor/ plugins/ hivearmor-collector/

# 3. Missing PreAuthorize — all public-facing endpoints
grep -rn "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping" \
  backend/src/main/java/com/hivearmor/web/rest/ | \
  xargs -I{} sh -c 'grep -l "@PreAuthorize" {} 2>/dev/null || echo "MISSING: {}"'

# 4. Hardcoded secrets in Go
grep -rn '"password"\|"secret"\|"apikey"\|"api_key"' \
  agent/ agent-manager/ event-processor/ plugins/ | \
  grep ':= "' | grep -v "test\|mock\|example\|_test.go"

# 5. OpenSearch injection variants
grep -rn "SearchRequest\|searchSource" backend/src/ | \
  grep -v "QueryBuilders\|SearchUtil\|//\|test" | grep '"\+ \|+" '
```

---

## Integration with GitHub Actions

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  pull_request:
    paths:
      - 'backend/src/**'
      - 'event-processor/**'
      - 'plugins/**'
      - 'agent/**'

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: .semgrep/hivearmor.yml

  govulncheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: golang/govulncheck-action@v1
        with:
          go-version-file: event-processor/go.mod
          work-dir: event-processor
```

---

## Severity Classification for HiveArmor

| Severity | Definition | Example | SLA |
|---|---|---|---|
| CRITICAL | Direct auth bypass, RCE, full data exfiltration | SQL injection in public endpoint | Fix before merge |
| HIGH | Privilege escalation, significant data exposure | Missing @PreAuthorize on admin endpoint | Fix in current sprint |
| MEDIUM | Information disclosure, SSRF, internal-only bypasses | Password in GET param (internal API) | Fix within 2 sprints |
| LOW | Defense-in-depth, best practice, non-exploitable | Overly broad CORS on internal service | Fix at next opportunity |
