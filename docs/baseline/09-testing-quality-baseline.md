# 09 — Testing and Quality Baseline

## Current Test Coverage Assessment: **CRITICAL GAP**

The UTMStack codebase has **extremely limited automated test coverage** across all components. This is the most significant quality risk.

---

## Backend (Java)

### Test Infrastructure
- **No `src/test/` directory** — explicitly noted in `AGENTS.md`
- Tests would be embedded in `src/main/java/` (non-standard, not confirmed present)
- JUnit and Spring Test are likely in dependencies (JHipster scaffolding usually includes them) but no test execution is configured in CI

### What Exists
- `archunit-junit5.version: 0.21.0` in pom.xml — ArchUnit dependency declared but no test files found
- `maven-surefire-plugin:3.0.0-M5` configured — suggests unit test runner is ready
- `maven-failsafe-plugin:3.0.0-M5` configured — suggests integration test runner exists
- `JaCoCo` plugin declared — code coverage reporting configured but not running

### What Is Missing
- Unit tests for: `UtmCorrelationRulesService`, `TokenProvider`, `UtmAlertResponseRuleService`, `ElasticsearchService`
- Integration tests for all REST controllers
- Security tests for JWT flow, SAML2, API key auth
- Repository-layer tests

---

## Frontend (Angular)

### Test Infrastructure
- **Karma 6.4.1** configured in `karma.conf.js`
- **Jasmine ~2.99.1** as test framework
- **karma-chrome-launcher ~2.2.0** — requires Chrome
- **karma-coverage-istanbul-reporter** — coverage reporting
- `npm test` runs Karma in watch mode; use `npm test -- --single-run` for CI

### What Exists
- Karma configuration exists
- Some spec files may exist for JHipster-generated services (auth, account)
- No substantive component or service test evidence found

### What Is Missing
- Component tests for alert management, dashboard, incident modules
- Service tests for `AccountService`, `AuthServerProvider`
- Integration tests for auth flow
- E2E tests via Protractor (configured but deprecated — `protractor:7.0.0`)

---

## Go Components (Agent, Plugins, AgentManager)

### Test Infrastructure
- `go test ./...` is referenced in `reusable-golang.yml` CI workflow
- No test files (`*_test.go`) were observed during codebase exploration

### What Is Missing
- Unit tests for: agent registration logic, key validation, gRPC handlers
- Tests for: `alerts` plugin correlation logic, `geolocation` parsing
- Tests for: `config` plugin rule writing, filter cleaning
- Tests for: agent-manager authentication interceptors

---

## Build / Lint / Type-Check Commands

### Frontend
```bash
cd frontend
npm run lint          # TSLint (tslint.json) — ng lint
npm test              # Karma/Jasmine unit tests (watch mode)
npm test -- --single-run  # Single-run for CI
NODE_OPTIONS=--max_old_space_size=8192 npm run build  # Production build (type-checks included)
```

### Backend
```bash
cd backend
mvn -s settings.xml -B test           # Run tests (if any exist)
mvn -s settings.xml checkstyle:check  # Checkstyle (maven-checkstyle-plugin configured)
mvn -B -Pprod clean package -s settings.xml  # Full build + compile
```

### Go
```bash
go test ./...                          # Run all tests (from each module directory)
go vet ./...                           # Static analysis
go build -v .                          # Compile check
```

---

## CI/CD Quality Gates

### PR Checks (`.github/workflows/pr-checks.yml`)
- **Go dependency scan** (`_pr-reusable-go-deps.yml`) — checks for dependency issues
- **AI code review** (`_pr-reusable-ai-review.yml`) — ThreatWinds AI review
- **Approver** — requires tier-3 reviewers (`Kbayero`, `osmontero`)
- **No automated test execution** in PR checks pipeline
- **No lint execution** in PR checks pipeline

### Deployment Pipeline
- Only build verification — no test stage in `v11-deployment-pipeline.yml`
- Agent binaries built with `go build` only (no `go test`)
- Java backend built with `mvn clean package` in `prod` profile (no test phase)
- Frontend built with `npm run-script build` (no `npm test`)

---

## Detection Rule Testing

### Current Approach
- No automated testing for YAML correlation rules
- Rules are loaded by the `config` plugin into the event processor at runtime
- No unit test framework for rule logic validation
- No regression test suite for alert generation

### Risk
- A rule change could silently break detection without any automated verification
- `rule_last_update` field tracks changes but no change history is maintained beyond that

---

## Parser / Filter Testing

### Current Approach
- Log parsing filters (Logstash-compatible YAML) have no automated tests
- Filter changes are deployed directly to the `utm_logstash_filter` table
- No unit test for parsing transformations
- No regression suite for parsing correctness

---

## Missing Critical Tests (Priority Order)

| # | Area | Risk if Missing |
|---|---|---|
| 1 | Backend: JWT auth unit tests | Auth bypass goes undetected |
| 2 | Backend: Correlation rule service | Rule CRUD bugs silently break detection |
| 3 | Backend: Alert response rule engine | SOAR automation fires incorrectly |
| 4 | Frontend: Auth flow integration tests | Login regression undetected |
| 5 | Go: Agent-manager auth interceptors | Security boundary test coverage |
| 6 | Go: Alert deduplication logic | Duplicate or missed alerts |
| 7 | Go: Geolocation parsing | Enrichment failures go unnoticed |
| 8 | Detection rules: YAML rule evaluation | Rules broken after schema changes |
| 9 | API: Controller smoke tests | Regressions in critical endpoints |
| 10 | E2E: Alert investigation flow | Core UX regressions |

---

## Linter Configuration

### Frontend
- **TSLint** (`tslint.json`) — deprecated (ESLint replacement is the standard)
- Rules: `codelyzer` Angular-specific rules + standard TSLint rules
- No max-line-length enforcement observed (many TSLint disable comments in shared module)

### Backend
- **Checkstyle** (`maven-checkstyle-plugin:3.1.2` + `checkstyle:9.0`) — configured but not enforced in CI
- **`nohttp-checkstyle`** — checks for HTTP instead of HTTPS in source code
- **Modernizer** (`modernizer-maven-plugin:2.3.0`) — flags legacy Java APIs

### Go
- No golangci-lint or staticcheck configuration found
- `go vet` would run with `go test`
