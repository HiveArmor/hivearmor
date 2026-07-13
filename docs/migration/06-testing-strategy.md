# 06 — Testing Strategy

> The current state has near-zero automated test coverage (no `backend/src/test/`, no Go test files, minimal Karma specs). This document defines what tests must be added BEFORE high-risk migrations proceed, and what tests must pass AFTER each migration.

---

## Current Baseline Test Commands

```bash
# Frontend — lint + unit tests (Karma)
cd frontend
npm run lint
npm test -- --single-run

# Backend — compile check only (no tests exist)
cd backend
mvn -s settings.xml -B -Pprod clean package -DskipTests

# Go — build check only (no test files)
cd agent && go build .
cd agent-manager && go build .

# YAML rule validation (manual)
# No automated rule tests exist
```

---

## Tests That Must Be Created Before High-Risk Migrations

### T-001: Backend Auth Flow Tests (Required before Phase 6)

**Why:** Phase 6 rewrites `SecurityConfiguration.java`. Without these tests, a broken auth config is undetectable until production.

**Required tests:**
```java
// backend/src/test/java/com/park/utmstack/security/

// AuthenticationFlowTest.java
- testJwtLogin_success()                     // POST /api/authenticate → 200 + token
- testJwtLogin_wrongPassword()               // POST /api/authenticate → 401
- testJwtLogin_tfa_required()                // POST /api/authenticate → returns TFA method
- testTfaVerify_correctCode()                // POST /api/tfa/verify-code → 200 + full JWT
- testTfaVerify_wrongCode()                  // POST /api/tfa/verify-code → 401
- testProtectedEndpoint_noAuth()             // GET /api/utm-alerts → 401
- testProtectedEndpoint_userRole()           // GET /api/utm-alerts → 200 with USER role
- testProtectedEndpoint_adminOnly()          // GET /api/utm-incident-jobs → 403 with USER role
- testProtectedEndpoint_adminRole()          // GET /api/utm-incident-jobs → 200 with ADMIN role
- testPublicEndpoint_noAuth()               // GET /api/ping → 200
- testDenyAllEndpoint()                     // GET /api/custom-reports/x → 403
- testInternalApiKey_valid()                // Request with Utm-Internal-Key header → 200
- testInternalApiKey_invalid()              // Request with wrong key → 403
- testApiKey_valid()                        // Request with valid API key → 200
- testApiKey_invalid()                      // Request with invalid API key → 401
```

### T-002: RBAC Baseline Tests (Required before Phase 6)

```java
// RbacBaselineTest.java
- testUserRoleCannotAccessAdminEndpoints()
- testAdminRoleCanAccessAllEndpoints()
- testPreVerificationUserCanOnlyAccessTfaEndpoints()
- testAllRouteConstraintsMatch_userVsAdminExpectations()
```

### T-003: Alert Query Baseline Tests (Required before Phase 7 — Hibernate)

```java
// AlertQueryBaselineTest.java  
// These capture CURRENT query results to compare against post-Hibernate-upgrade results

- testGetAlertsByStatus_returnsCorrectCount()
- testGetAlertsByStatusAndSeverity()
- testPaginatedAlertQuery_firstPage()
- testPaginatedAlertQuery_totalCount()
- testAlertsByDateRange()
- testOpenAlertsCount()  // Used by dashboard KPI
```

### T-004: Frontend Auth Guard Tests (Required before Phase 5 — Angular)

```typescript
// user-route-access-service.spec.ts
- should_allow_authenticated_user_with_required_role()
- should_deny_unauthenticated_user()
- should_redirect_to_login_when_unauthenticated()
- should_deny_user_accessing_admin_route()
- should_allow_admin_accessing_admin_route()
```

### T-005: Frontend Interceptor Tests (Required before Phase 5)

```typescript
// auth.interceptor.spec.ts  
- should_attach_bearer_token_to_api_requests()
- should_not_modify_external_requests()
- should_attach_internal_key_header_when_present()

// auth-expired.interceptor.spec.ts
- should_logout_on_401_response()
- should_logout_on_403_response()
- should_cancel_pending_requests_on_auth_failure()
```

---

## Per-Phase Test Gates

### Phase 1 Gate: node-sass → sass

| Test | Command | Must pass |
|---|---|---|
| SCSS compilation | `npm run build` | ✅ Zero build errors |
| Lint | `npm run lint` | ✅ No new errors |
| Unit tests | `npm test -- --single-run` | ✅ Same pass rate as before |
| Visual check | Manual — load app, verify styles | ✅ All screens visually identical |

---

### Phase 2 Gate: Node.js 14 → 20

| Test | Command | Must pass |
|---|---|---|
| npm install | `nvm use 20 && npm install` | ✅ Zero blocking errors |
| Build | `NODE_OPTIONS=--max_old_space_size=8192 npm run build` | ✅ Success |
| Lint | `npm run lint` | ✅ Same result as Node 14 |
| Unit tests | `npm test -- --single-run` | ✅ Same pass rate |

---

### Phase 3 Gate: TSLint → ESLint

| Test | Command | Must pass |
|---|---|---|
| ESLint runs | `npm run lint` | ✅ No blocking errors |
| Build still works | `npm run build` | ✅ Success |
| Unit tests | `npm test -- --single-run` | ✅ No regressions |

---

### Phase 4 Gate: Java 17 + Spring Boot 3.3 (user-auditor, web-pdf)

| Test | Check | Must pass |
|---|---|---|
| Service startup | `docker compose up user-auditor` → healthcheck | ✅ Service starts |
| Audit write | Login action → audit record created in DB | ✅ Record present |
| Audit read | GET `/api/utm-auditor-users` → returns records | ✅ 200 with data |
| PDF generation | POST PDF request → valid PDF returned | ✅ Non-empty PDF |
| PDF content | Open PDF → report content visible | ✅ Logos and data correct |
| javax→jakarta | grep for remaining `javax.` imports | ✅ Zero results |

---

### Phase 5 Gate: Angular 7 → 17

| Test | Command | Must pass |
|---|---|---|
| TypeScript compile | `npm run build` | ✅ Zero TS errors |
| ESLint | `npm run lint` | ✅ No blocking errors |
| Unit tests | `npm test -- --single-run` | ✅ All existing specs pass |
| Auth guard tests (T-004) | `npm test -- --single-run` | ✅ New auth guard specs pass |
| Interceptor tests (T-005) | `npm test -- --single-run` | ✅ New interceptor specs pass |
| Manual: Login | Open browser → login with valid credentials | ✅ Login succeeds |
| Manual: TFA | Login → TFA screen → enter code | ✅ Full auth flow works |
| Manual: Route guard | Authenticated user navigates to all 18 routes | ✅ All routes load |
| Manual: Admin-only | USER role tries /management → redirected | ✅ Access denied |
| Manual: Alert list | Navigate to /data/alert/view | ✅ Alerts display |
| Manual: Log search | Navigate to /discover → run query | ✅ Results return |
| Manual: Dashboard | Navigate to /dashboard/overview | ✅ Charts render |
| Manual: Modal | Open any modal dialog | ✅ Opens and closes |
| Manual: Real-time | Wait for alert notification badge | ✅ WebSocket connects |

---

### Phase 6 Gate: Spring Boot 3.3 (backend)

| Test | Command | Must pass |
|---|---|---|
| Backend startup | `docker compose up backend` → healthcheck | ✅ Starts healthy |
| Auth tests (T-001) | `mvn test` | ✅ All auth tests pass |
| RBAC tests (T-002) | `mvn test` | ✅ All RBAC tests pass |
| Login | Postman/curl POST /api/authenticate | ✅ Returns JWT |
| SAML2 SSO | Login via configured IdP | ✅ SSO login succeeds |
| API key auth | Request with API key header | ✅ Authenticates |
| Internal key | Backend→AgentManager gRPC | ✅ Connection established |
| Alert query | GET /api/utm-alerts | ✅ Returns data |
| Admin endpoint | GET /api/management/health | ✅ 200 |
| Deny all | GET /api/custom-reports/x | ✅ 403 |
| Agent connects | Start agent → verify in agent-manager | ✅ Connected |

---

### Phase 7 Gate: Hibernate 6

| Test | Command | Must pass |
|---|---|---|
| Alert query baseline | Compare results with T-003 baseline | ✅ Identical results |
| Backend startup | Service starts with Hibernate 6 | ✅ No ORM errors |
| Paginated queries | GET /api/utm-alerts?page=0&size=20 | ✅ Correct pagination |
| All entities load | Service startup — no metamodel errors | ✅ Zero errors in logs |
| Incident creation | POST /api/utm-incidents | ✅ Creates correctly |
| Rule query | GET /api/utm-correlation-rules | ✅ Returns rules |

---

### Phase 8 Gate: Go Updates

| Test | Command | Must pass |
|---|---|---|
| Build | `cd agent-manager && go build .` | ✅ Compiles |
| Agent registration | New agent → registers in agent-manager | ✅ Registered |
| Log streaming | Agent sends logs → logs appear in OpenSearch | ✅ Logs indexed |
| SOAR command | Send command to agent → receives result | ✅ Command executed |

---

### Phase 9 Gate: ECharts 5

| Test | Check | Must pass |
|---|---|---|
| Dashboard overview | Visual check of all KPI charts | ✅ All render |
| Bar chart | Visualization with bar chart | ✅ Correct data |
| Pie chart | Visualization with pie chart | ✅ Correct data |
| Geo map | Dashboard with Leaflet heatmap | ✅ Map loads |
| Word cloud | Threat intel word cloud | ✅ Renders |
| 3D chart | If any echarts-gl charts used | ✅ Renders |
| Chart builder | Create new chart in graphic-builder | ✅ Saves and displays |

---

### Phase 10 Gate: Bootstrap 5

| Test | Check | Must pass |
|---|---|---|
| Login form | Enter credentials and submit | ✅ Form submits |
| Alert filters | Use severity/status filters | ✅ Filters apply |
| Alert detail modal | Click on alert → modal opens | ✅ Modal appears |
| Incident creation | Create new incident modal | ✅ Form opens and saves |
| User management | Create/edit/delete user | ✅ Forms work |
| Rule editor | Open correlation rule editor | ✅ Form functional |
| Dropdown menus | All header/nav dropdowns | ✅ Open and close |
| Tables | Alert list, log list tables | ✅ Layout correct |
| Responsive | Resize to tablet width | ✅ No broken layout |

---

## Missing Tests: Must Be Added Before Each Phase

| Phase | Must-have tests before proceeding |
|---|---|
| Phase 5 | T-004 (auth guard), T-005 (interceptors) |
| Phase 6 | T-001 (auth flow), T-002 (RBAC) |
| Phase 7 | T-003 (alert query baseline) |

---

## Security Regression Tests (run after every migration)

```bash
# 1. Unauthenticated access returns 401
curl -X GET http://localhost:8080/api/utm-alerts   # expects 401

# 2. Protected endpoint denies wrong role
# USER token trying ADMIN-only endpoint → expects 403

# 3. denyAll endpoint returns 403
curl -X GET http://localhost:8080/api/custom-reports/x   # expects 403

# 4. Public endpoint accessible without auth
curl -X GET http://localhost:8080/api/ping   # expects 200

# 5. CORS headers present
curl -X OPTIONS http://localhost:8080/api/utm-alerts -H "Origin: http://test.com"
# Verify response headers
```
