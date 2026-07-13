# 04 — Risk Register

> Risk classification: **Low / Medium / High / Critical**
> Critical = can break authentication, tenant isolation, data ingestion, detection, alerting, or production deployment.

---

## RISK-001: Spring Security Config Rewrite (WebSecurityConfigurerAdapter removal)

**Risk level:** 🔴 CRITICAL  
**Trigger:** Spring Boot 3.x removes `WebSecurityConfigurerAdapter`. Backend's `SecurityConfiguration.java` extends it.  
**Impact:** If the security config is rewritten incorrectly, authentication will fail for ALL users. RBAC rules could be dropped, exposing protected endpoints. SAML2 SSO, JWT, API keys, and internal key auth all flow through this class.  
**Affected:** Login, all authenticated API calls, SAML2 SSO, TFA flow, SOAR agent commands, compliance reports  
**Mitigation:** Rewrite security config to `SecurityFilterChain` bean pattern BEFORE upgrading Spring Boot 3.x in backend. Test all 4 auth mechanisms (JWT, SAML2, API key, internal key) independently.  
**Rollback:** Docker image swap to previous tag.

---

## RISK-002: Hibernate 5→6 ORM Behavior Differences

**Risk level:** 🔴 CRITICAL  
**Trigger:** Removing the Hibernate 5 pin allows Spring Boot 3.1 to use Hibernate 6.x.  
**Impact:** JPQL/HQL queries that relied on Hibernate 5 implicit behaviors may silently return different results (wrong data, missing records, extra records). This could cause incorrect alert displays, missing incidents, corrupt compliance evaluations.  
**Affected:** All JPA entities (30+ domain classes), all Spring Data repositories, all JPQL queries  
**Mitigation:** Full JPQL audit before upgrade. Run query-output comparison tests (same inputs, compare results before/after).  
**Rollback:** Restore Hibernate version pin in `pom.xml`. Deploy previous backend Docker image.

---

## RISK-003: Angular Upgrade Breaks Authentication Flow

**Risk level:** 🔴 CRITICAL  
**Trigger:** Angular 7→17 upgrade; route guard API changes, interceptor API changes.  
**Impact:** If `UserRouteAccessService`, `AuthInterceptor`, or `AuthExpiredInterceptor` break, all protected routes become either inaccessible (all users locked out) or unprotected (auth bypassed).  
**Affected:** All 18 active routes; login flow; TFA flow; session management  
**Mitigation:** Upgrade guards and interceptors first; test login/logout cycle before touching other modules.  
**Rollback:** Redeploy previous frontend Docker image.

---

## RISK-004: node-sass Compilation Failure

**Risk level:** 🔴 CRITICAL (to build pipeline)  
**Trigger:** Node upgrade without prior node-sass → sass migration.  
**Impact:** Entire frontend build fails. No styles rendered. All UI screens completely unstyled.  
**Affected:** Frontend build pipeline; all UI screens  
**Mitigation:** Migrate to dart-sass BEFORE upgrading Node. Validate SCSS compilation on Node 14 with sass before changing Node version.  
**Rollback:** Restore `node-sass` in `package.json`; rebuild.

---

## RISK-005: Spring Boot 2.7 → 3.x javax→jakarta Migration Incomplete

**Risk level:** 🟠 HIGH  
**Trigger:** `user-auditor` or `web-pdf` Spring Boot 3.x upgrade with missed `javax.*` → `jakarta.*` imports.  
**Impact:** Service fails to start with `ClassNotFoundException: javax.persistence.*`. User audit trail goes down. PDF report generation fails.  
**Affected:** User session auditing (compliance requirement); compliance PDF reports  
**Mitigation:** Use IntelliJ's built-in "Migrate to Jakarta EE 9" tool or equivalent. Run full service startup test after migration.  
**Rollback:** Deploy previous service Docker image.

---

## RISK-006: ECharts 4→5 Chart Option API Changes

**Risk level:** 🟠 HIGH  
**Trigger:** ECharts 5 has renamed or restructured option keys for several chart types.  
**Impact:** Charts silently render incorrectly or throw runtime errors. SIEM dashboards show blank widgets or wrong data. Analysts lose visibility during incident response.  
**Affected:** All custom dashboards, visualization builder, geographic views, threat intelligence feeds  
**Mitigation:** Run visual regression tests on every chart type before deploying. Use ECharts 5 migration guide.  
**Rollback:** Revert `echarts` version in `package.json`; rebuild frontend.

---

## RISK-007: gRPC Protocol Compatibility During Upgrade

**Risk level:** 🟠 HIGH  
**Trigger:** Any gRPC version change between backend and agent-manager without regenerating stubs.  
**Impact:** Agent registration fails. No logs ingested. No SOAR commands dispatched. Agents report disconnected.  
**Affected:** Log ingestion pipeline, agent management, SOAR execution  
**Mitigation:** Backend and agent-manager gRPC version must be upgraded together in the same deployment. Regenerate `.pb.go` and `.java` stubs from the same proto definition.  
**Rollback:** Coordinated Docker image rollback for both backend and agent-manager.

---

## RISK-008: Bootstrap 4→5 Form Class Removal

**Risk level:** 🟠 HIGH  
**Trigger:** Bootstrap 5 removes `form-group` and changes many utility class names.  
**Impact:** All forms across the SIEM UI lose their layout and spacing styles. Login form, alert status forms, incident creation, correlation rule editor, user management forms all affected.  
**Affected:** All forms in the application (50+ form components)  
**Mitigation:** Complete Bootstrap migration guide; automated find/replace for class names; visual regression testing.  
**Rollback:** Revert Bootstrap version in `package.json`; rebuild.

---

## RISK-009: JWT Ephemeral Key — Sessions Lost on Deployment

**Risk level:** 🟠 HIGH (pre-existing, not caused by upgrade)  
**Trigger:** Any backend redeployment (including upgrades).  
**Impact:** All active user sessions are invalidated. SOC analysts mid-investigation lose their sessions.  
**Affected:** All authenticated users  
**Mitigation:** Persist JWT signing key in database (planned in migration plan). Coordinate backend deploys with low-activity windows.  
**Note:** This is pre-existing technical debt, not introduced by any upgrade.

---

## RISK-010: ng-bootstrap 4→14 Modal/Popover API Changes

**Risk level:** 🟡 MEDIUM  
**Trigger:** Angular upgrade requires corresponding ng-bootstrap upgrade.  
**Impact:** Modal dialogs throughout the application (confirmation dialogs, alert detail panels, config modals) may not open/close correctly or display incorrectly.  
**Affected:** ~30 modal usage points throughout all modules  
**Mitigation:** Audit all `NgbModal.open()` calls; test modal workflows in each major module.  
**Rollback:** Revert ng-bootstrap version.

---

## RISK-011: Selenium Chrome Driver Version Mismatch (web-pdf)

**Risk level:** 🟡 MEDIUM  
**Trigger:** Selenium upgrade or Chrome version change in container.  
**Impact:** PDF report generation fails silently or generates blank/corrupted PDFs. Compliance reports, scheduled reports, and dashboard exports fail.  
**Affected:** Compliance reports, dashboard PDF exports  
**Mitigation:** Pin Chrome version in Dockerfile; test all report templates after Selenium upgrade.  
**Rollback:** Deploy previous web-pdf Docker image.

---

## RISK-012: SAML2 SSO Configuration Compatibility

**Risk level:** 🟡 MEDIUM  
**Trigger:** Spring Security 6 (Spring Boot 3.x) has SAML2 API changes.  
**Impact:** SAML2 SSO login breaks for enterprise customers using Okta, Azure AD, etc. Those users cannot authenticate at all.  
**Affected:** Enterprise SSO authentication  
**Mitigation:** Test SAML2 flow with a test IdP before production upgrade. Verify `Saml2LoginSuccessHandler` and `Saml2LoginFailureHandler` with new API.  
**Rollback:** Deploy previous backend Docker image.

---

## RISK-013: Moment.js Replacement Breaks Date Formatting

**Risk level:** 🟡 MEDIUM  
**Trigger:** Replacing moment.js with date-fns across all components.  
**Impact:** Date/time formatting inconsistencies in alert timestamps, compliance report dates, log analyzer time ranges, incident timelines.  
**Affected:** All date/time display throughout the application  
**Mitigation:** Replace incrementally, one component at a time. Test each date format against known values.  
**Rollback:** Restore moment.js imports in changed files.

---

## RISK-014: Correlation Rule YAML Files (filters/ and rules/)

**Risk level:** 🟢 LOW (not affected by software upgrades)  
**Trigger:** Not triggered by any upgrade. Rules are YAML files loaded at runtime.  
**Note:** The YAML-based correlation rules and log filters are independent of the software version stack. They are not affected by any of the planned upgrades. The config plugin polls PostgreSQL every 30s and writes to the event processor working directory — this mechanism is unaffected.

---

## RISK-015: OpenSearch Index Naming Pattern

**Risk level:** 🟢 LOW (not affected by software upgrades)  
**Trigger:** Not triggered by any upgrade. The `v11-<type>-YYYY.MM.DD` pattern is locked in the event processor, backend queries, and plugin code.  
**Note:** None of the planned upgrades touch OpenSearch index names. Alert deduplication, severity integers (1–5), and data type strings are stable across all planned migrations.

---

## Risk Summary Matrix

| Risk ID | Description | Level | Migration Phase |
|---|---|---|---|
| RISK-001 | Security config rewrite (WebSecurityConfigurerAdapter) | 🔴 CRITICAL | Phase 6 |
| RISK-002 | Hibernate 5→6 query behavior | 🔴 CRITICAL | Phase 7 |
| RISK-003 | Angular upgrade breaks auth flow | 🔴 CRITICAL | Phase 5 |
| RISK-004 | node-sass compilation failure | 🔴 CRITICAL | Phase 1 |
| RISK-005 | javax→jakarta incomplete migration | 🟠 HIGH | Phase 4 |
| RISK-006 | ECharts chart option API changes | 🟠 HIGH | Phase 5 |
| RISK-007 | gRPC protocol compatibility | 🟠 HIGH | Phase 8 |
| RISK-008 | Bootstrap 4→5 form classes | 🟠 HIGH | Phase 5 |
| RISK-009 | JWT ephemeral key (pre-existing) | 🟠 HIGH | Phase 6 |
| RISK-010 | ng-bootstrap modal API changes | 🟡 MEDIUM | Phase 5 |
| RISK-011 | Selenium Chrome driver mismatch | 🟡 MEDIUM | Phase 4 |
| RISK-012 | SAML2 SSO API changes | 🟡 MEDIUM | Phase 6 |
| RISK-013 | Moment.js replacement | 🟡 MEDIUM | Phase 5 |
| RISK-014 | Correlation rules (not affected) | 🟢 LOW | N/A |
| RISK-015 | OpenSearch index names (not affected) | 🟢 LOW | N/A |
