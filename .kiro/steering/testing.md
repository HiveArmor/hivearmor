---
inclusion: always
---

# Testing Expectations

## Current State

Test coverage is near zero across all three language stacks. This is the highest-quality risk in the codebase (see `docs/baseline/09-testing-quality-baseline.md`).

**Rule: do not make changes to security-sensitive paths, auth flows, correlation logic, or SOAR execution without adding at least one test covering the changed behaviour.**

## Backend (Java)

`src/test/` does not exist yet. The test framework is declared in `pom.xml` but unused.

To start:
```bash
mkdir -p backend/src/test/java/com/park/utmstack
```

Run tests:
```bash
cd backend && mvn -s settings.xml test
```

Preferred patterns:
- `@SpringBootTest` + `MockMvc` for controller / integration tests
- `@ExtendWith(MockitoExtension.class)` for pure unit tests
- JaCoCo is configured — coverage reports will appear once tests exist

Priority targets (in order):
1. `security/jwt/TokenProvider.java` — token generation, expiry, role claims
2. `web/rest/UserJWTController.java` — login happy path, wrong password, TFA gating
3. `service/correlation/rules/UtmCorrelationRulesService.java` — system rule protection
4. `service/alert_response/UtmAlertResponseRuleService.java` — SOAR rule evaluation

## Frontend (Angular)

Karma + Jasmine are configured. Test files: `*.spec.ts` alongside their component/service.

Run tests:
```bash
cd frontend
npm test -- --single-run     # CI mode — do not use watch mode in CI
npm test                     # watch mode for local development
```

Priority targets:
1. `core/auth/account.service.ts` — identity resolution, `hasAnyAuthority`, navigation on login
2. `core/auth/auth-jwt.service.ts` — token storage/retrieval, logout
3. `core/auth/user-route-access-service.ts` — `canActivate` logic
4. `blocks/interceptor/auth.interceptor.ts` — header injection

Use `TestBed.configureTestingModule` with `HttpClientTestingModule` for services that make HTTP calls.

## Go (Agent, AgentManager, Plugins)

No `*_test.go` files exist. CI runs `go test ./...` but it passes vacuously.

Test file naming: `<file>_test.go` in the same package.

```go
// agent-manager/agent/interceptor_test.go
package agent

import "testing"

func TestIsInternalKeyValid_correctKey_returnsTrue(t *testing.T) { ... }
func TestIsInternalKeyValid_wrongKey_returnsFalse(t *testing.T) { ... }
```

Priority targets:
1. `agent-manager/agent/interceptor.go` — `isInternalKeyValid`, `authHeaders`, route list membership
2. `agent-manager/agent/agent_imp.go` — `ValidateAgentKey`
3. `plugins/alerts/main.go` — `isDuplicate`, `getPreviousAlertId` (dedup and groupBy logic)
4. `plugins/geolocation/` — IP lookup, missing-field handling

## Detection Rules

No automated rule tests exist. When modifying YAML correlation rules:
- Validate that `where` expressions parse without error by checking `com.utmstack.config` plugin startup logs
- Test temporal `afterEvents` windows manually against sample log events in a dev environment
- Confirm `deduplicateBy` and `groupBy` fields exist on the actual alert document schema

## What Must Have Tests Before Merging

These areas require at least one new test in the same PR that changes them:

| Area | Minimum test |
|---|---|
| Any new REST endpoint | One happy-path test; one unauthenticated 401 test |
| JWT / auth changes | Token lifecycle test covering the changed code path |
| New SOAR rule evaluation logic | At least one rule-matches and one rule-misses case |
| New alert deduplication logic | At least one duplicate-suppressed and one non-duplicate-passed case |
| New Liquibase changeset | Schema validated via `mvn liquibase:validate` in CI |
| New correlation rule YAML | Manual verification in dev environment logged in PR description |

## CI Integration

Current PR pipeline has **no test execution step**. Tests are a local-only gate today.

When adding tests, also update `.github/workflows/pr-checks.yml` to run them:
```yaml
- run: cd backend && mvn -s settings.xml test
- run: cd frontend && npm test -- --single-run
- run: cd agent-manager && go test ./...
```

## Do / Don't

- **DO** write tests in the same PR as the code change — not in a follow-up
- **DO** use `@Disabled` / `xit` only with a comment referencing a tracking issue
- **DO** keep tests deterministic — no sleeps, no external network calls, no shared mutable state
- **DON'T** introduce Protractor E2E tests — it is deprecated; use Cypress or Playwright if E2E is needed
- **DON'T** skip testing auth, RBAC, or input validation paths — these are the highest-risk paths in the codebase
