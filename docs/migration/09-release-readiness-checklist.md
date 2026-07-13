# 09 — Release Readiness Checklist

> Complete this checklist before deploying each migration phase to production. Every item must be checked or explicitly documented as waived with a reason.

---

## Pre-Migration Checklist (All Phases)

### Environment
- [ ] Full local stack is running (`docker compose up -d`) and all services are healthy
- [ ] Baseline test run saved: `npm test -- --single-run` results and `mvn package -DskipTests` confirm green
- [ ] Backup of current Docker image tags documented in this document
- [ ] Rollback command written and tested in staging before production deploy
- [ ] Deploy window scheduled during low-traffic period (off-hours)
- [ ] On-call engineer designated for the deploy window

### Documentation
- [ ] PR description includes: what changed, how to test, rollback instructions
- [ ] `docs/migration/` files updated to reflect this phase's status
- [ ] Steering files in `.kiro/steering/` updated if any conventions changed
- [ ] AGENTS.md updated if build requirements changed

---

## Phase 1: node-sass → sass

- [ ] `npm install` completes without errors on Node 14
- [ ] `npm run build` completes, bundle sizes within 5% of baseline
- [ ] `npm test -- --single-run` — same pass rate as baseline
- [ ] Visual check: login page, dashboard, alert list all styled correctly
- [ ] No `node-sass` references remain in package.json or angular.json
- [ ] CI build passes in a test PR

---

## Phase 2: Node.js 14 → 20

- [ ] `npm install` clean on Node 20
- [ ] `npm run build` clean on Node 20, bundle sizes within 5%
- [ ] `npm test -- --single-run` passes on Node 20
- [ ] reusable-node.yml updated and CI pipeline passes
- [ ] AGENTS.md updated: "Node 14.16.1 required" → "Node 20 LTS required"

---

## Phase 3: TSLint → ESLint

- [ ] `npm run lint` produces no blocking errors
- [ ] `npm run build` still succeeds
- [ ] `tslint.json` deleted
- [ ] `codelyzer` removed from dependencies
- [ ] `.eslintrc.json` committed
- [ ] CI lint step updated

---

## Phase 4: Java 17 + Spring Boot 3.3 (user-auditor, web-pdf)

- [ ] `user-auditor` Docker image builds with Java 17
- [ ] `web-pdf` Docker image builds with Java 17
- [ ] Zero `javax.persistence.*` imports in user-auditor sources (grep check)
- [ ] Zero `javax.persistence.*` imports in web-pdf sources (grep check)
- [ ] `user-auditor` health check: `curl http://localhost:8080/actuator/health` → healthy
- [ ] User login creates audit record (manual verification)
- [ ] Audit records queryable via API
- [ ] PDF report generates for at least one template type
- [ ] PDF content is correct (logos, data, formatting)
- [ ] CI pipeline java_version updated to '17' for both services

---

## Phase 5: Angular 7 → 17

### Sub-phase 5a — Test foundations
- [ ] T-004 (auth guard tests) written and passing on Angular 7
- [ ] T-005 (interceptor tests) written and passing on Angular 7

### Sub-phase 5b — Angular 7 → 12
- [ ] Build succeeds
- [ ] All 18 active routes load without errors
- [ ] Login/logout cycle works
- [ ] T-004 and T-005 tests still pass

### Sub-phase 5c — Angular 12 → 16
- [ ] Build succeeds
- [ ] ng-bootstrap 14 modal opens/closes correctly (test at least 3 modals)
- [ ] Alert list loads and displays data
- [ ] Real-time alert notification badge connects (WebSocket)

### Sub-phase 5d — Angular 16 → 17
- [ ] Build succeeds
- [ ] TypeScript 5.4 — zero type errors
- [ ] Full auth flow: login → TFA → dashboard → logout
- [ ] All 18 routes accessible
- [ ] All T-004 and T-005 tests pass
- [ ] No Angular deprecation errors in console
- [ ] Charts render (at least one dashboard with charts)
- [ ] Monaco editor loads in log analyzer
- [ ] STOMP/WebSocket connects (real-time notifications)
- [ ] String-based lazy loading syntax fully replaced
- [ ] `entryComponents` removed from all modules

---

## Phase 6: Spring Boot 3.3 + Security Config (Backend)

**⚠️ Highest risk phase — all items mandatory**

### Pre-deploy
- [ ] T-001 (auth flow tests) exist and passing on current codebase
- [ ] T-002 (RBAC tests) exist and passing on current codebase
- [ ] Security config rewrite reviewed by at least 2 engineers
- [ ] SAML2 SSO tested with a test IdP before this PR merges
- [ ] Deploy window communicated to all active users (sessions will be lost)

### Post-deploy validation
- [ ] Backend health check: `curl http://localhost:8080/api/healthcheck` → 200
- [ ] T-001 all pass against new deployment
- [ ] T-002 all pass against new deployment
- [ ] JWT login: `POST /api/authenticate` → returns token
- [ ] Wrong password: `POST /api/authenticate` → 401
- [ ] TFA flow: temp token → verify → full token
- [ ] USER role: protected endpoint → 200
- [ ] USER role: admin endpoint → 403
- [ ] ADMIN role: admin endpoint → 200
- [ ] Public endpoint: `GET /api/ping` → 200 without auth
- [ ] denyAll: `GET /api/custom-reports/x` → 403
- [ ] Internal key: service-to-service auth → working
- [ ] API key: external API key auth → working
- [ ] Agent connects and streams logs after backend restart
- [ ] SAML2 SSO tested end-to-end
- [ ] `WebSecurityConfigurerAdapter` — grep confirms zero remaining uses
- [ ] `@EnableGlobalMethodSecurity` — grep confirms zero remaining uses
- [ ] springdoc v2 artifact — Swagger UI accessible at `/v3/api-docs`

---

## Phase 7: Hibernate 6

- [ ] T-003 (alert query baseline) exists and passing on Hibernate 5
- [ ] Backend starts without Hibernate errors in logs
- [ ] Alert list: same count as before
- [ ] Paginated alert query: `X-Total-Count` matches baseline
- [ ] Incident list: returns correct results
- [ ] Correlation rules list: returns all active rules
- [ ] Compliance control data: loads correctly
- [ ] `elasticsearch-rest-high-level-client` removed — zero `org.elasticsearch.client.*` imports (grep check)
- [ ] No HQL implicit-FROM queries remaining (grep for queries missing SELECT)
- [ ] Hibernate 5 version pin removed from pom.xml

---

## Phase 8: Go Modules

- [ ] All Go modules compile: `go build .` in agent/, agent-manager/, collector/
- [ ] Agent registers with agent-manager after image update
- [ ] Log streaming: new events appear in OpenSearch within 60 seconds
- [ ] SOAR command: issued from UI → executed on agent → result recorded
- [ ] Agent-manager health check: gRPC port 9000 responding
- [ ] No agent binary naming convention changes (legacy names still present)

---

## Phase 9: ECharts 5

- [ ] Dashboard overview renders all KPI charts
- [ ] Bar chart renders with correct data
- [ ] Pie chart renders with correct data
- [ ] Line/area chart renders
- [ ] Geographic map renders (if used)
- [ ] Word cloud renders (if used)
- [ ] Chart builder: create new visualization and save
- [ ] echarts-gl 3D chart (if used): renders without errors
- [ ] No console errors during chart rendering

---

## Phase 10: Bootstrap 5

- [ ] Login form: submits correctly
- [ ] Alert management: filters apply, status changes work
- [ ] Incident creation modal: opens, form fills, saves
- [ ] Correlation rule editor: form renders and saves
- [ ] User management: create user, edit user, save
- [ ] Dropdown menus: all nav dropdowns open and close
- [ ] Tooltips: appear on hover
- [ ] Tables: layout correct, column widths reasonable
- [ ] jQuery removed from bundle: search for `window.jQuery` in production build — should be undefined
- [ ] No Bootstrap 4 class names in rendered HTML (`form-group`, `ml-*`, etc.)
- [ ] Responsive: resize to 768px width — no broken layout

---

## Post-All-Phases Final Checklist

### Security regression
- [ ] Unauthenticated access → 401 for all protected endpoints
- [ ] USER role cannot access ADMIN endpoints
- [ ] denyAll endpoints return 403 for all roles
- [ ] CORS headers present on API responses
- [ ] No sensitive data in error responses

### Performance baseline
- [ ] Frontend bundle size measured and documented
- [ ] Dashboard page load time measured
- [ ] Alert list query time measured
- [ ] Compliance report generation time measured

### SIEM core flows
- [ ] New log event ingested and appears in log analyzer within 60 seconds
- [ ] New alert generated for a matching rule appears in alert management
- [ ] Alert status change updates in real-time (WebSocket)
- [ ] Incident created from alert
- [ ] SOAR command executed from playbook
- [ ] Compliance report generated and emailed
- [ ] User audit record created for login
