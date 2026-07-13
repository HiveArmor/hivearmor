# 13 — Known Issues and Technical Debt

## Critical Issues (Must Address Before Major Changes)

### DEBT-01: Zero Automated Test Coverage
- **What**: No `src/test/` in backend. No verified frontend or Go test files. No test stage in CI pipeline.
- **Impact**: Any change can silently break detection, auth, or core SIEM workflows with no regression signal.
- **Files**: All source code
- **Action**: Build test foundations before any significant refactoring

### DEBT-02: Angular 7.2.0 (EOL 2019)
- **What**: Angular 7.2.0 — 6 major versions behind. No security patches since 2020. String-based lazy loading (`loadChildren: './module#Class'`) deprecated since Angular 12.
- **Impact**: Security vulnerabilities, blocked from modern features, incompatible with current Angular ecosystem.
- **Files**: All `frontend/src/app/**`
- **Action**: Plan incremental upgrade path: 7→12→16→17+ (requires fixing each migration guide)

### DEBT-03: Node 14.16.1 EOL Dependency Chain
- **What**: `node-sass@4` requires Node 14 (EOL April 2023). Cannot upgrade Node without first migrating from node-sass to dart-sass.
- **Impact**: All frontend build dependencies (including transitive) have unpatched CVEs.
- **Files**: `frontend/package.json`, `frontend/angular.json`
- **Action**: Migrate `node-sass` → `sass` (dart-sass) as first step

### DEBT-04: Hibernate 5.4.32 Pinned in Spring Boot 3.1
- **What**: Spring Boot 3.1 includes Hibernate 6.x, but `pom.xml` forcibly pins Hibernate 5.4.32.
- **Impact**: Silent compatibility issues; missing Hibernate 6 performance improvements; potential query/mapping bugs.
- **Files**: `backend/pom.xml`
- **Action**: Carefully upgrade Hibernate to 6.x; audit JPA queries for API changes

### DEBT-05: jib-maven-plugin Wrong Base Image
- **What**: `pom.xml` sets `jib-maven-plugin.image=eclipse-temurin:11-jre-focal` but the backend requires Java 17. The actual `Dockerfile` correctly uses Java 17.
- **Impact**: Any Jib-based build (`mvn jib:build`) produces a broken container image.
- **Files**: `backend/pom.xml` line `<jib-maven-plugin.image>eclipse-temurin:11-jre-focal</jib-maven-plugin.image>`
- **Action**: Change to `eclipse-temurin:17-jre-jammy`

---

## High Priority Issues

### DEBT-06: Password in GET Query Parameter
- **What**: `GET /api/check-credentials?password=<encoded_password>&checkUUID=<uuid>` — password appears in server access logs, proxy logs, browser history.
- **Files**: `backend/web/rest/AccountResource.java`, `frontend/core/auth/account.service.ts`
- **Action**: Change to `POST /api/check-credentials` with JSON body

### DEBT-07: CORS Wildcard in Production Config
- **What**: `application-prod.yml` sets `allowed-origins: '*'` with `allow-credentials: false`.
- **Impact**: Allows any origin to call the API (mitigated by `allow-credentials: false` for cookie-auth, but API key or token-based calls are unprotected cross-origin).
- **Files**: `backend/src/main/resources/config/application-prod.yml`
- **Action**: Set `allowed-origins` to the actual frontend hostname

### DEBT-08: Mixed Java Versions (17/11)
- **What**: Backend uses Java 17. `user-auditor` and `web-pdf` use Java 11 with Spring Boot 2.7 (EOL November 2023).
- **Impact**: Security exposure, maintenance burden, incompatible library versions.
- **Files**: `user-auditor/pom.xml`, `web-pdf/pom.xml`
- **Action**: Upgrade both to Java 17 + Spring Boot 3.x

### DEBT-09: No Environment Variable Documentation
- **What**: No `.env.example` or `.env.template` file. All required environment variables must be reverse-engineered from `compose.go` or `docker-compose.yml`.
- **Files**: Repo root
- **Action**: Create `local-dev/.env.example` with all required variables and descriptions

### DEBT-10: compliance-orchestrator Not Deployed
- **What**: `plugins/compliance-orchestrator/` exists and builds, but is not in `event_processor.Dockerfile`.
- **Impact**: Compliance automation feature appears built but is silently inactive.
- **Files**: `event_processor.Dockerfile`, `plugins/compliance-orchestrator/`
- **Action**: Either add to Dockerfile or document as work-in-progress

---

## Medium Priority Issues

### DEBT-11: Report and Vulnerability Scanner Modules Disabled
- **What**: Routes commented out in `app-routing.module.ts`. Code exists in `frontend/src/app/report/`, `scanner/`, `vulnerability-scanner/`.
- **Impact**: Dead code adds maintenance burden; unclear if these features are planned for re-enablement.
- **Files**: `frontend/src/app/app-routing.module.ts`, `report/`, `scanner/`, `vulnerability-scanner/`
- **Action**: Either re-enable with testing or remove code with clear deprecation communication

### DEBT-12: TSLint Deprecated
- **What**: Frontend uses TSLint 5.11.0 which was deprecated in 2020 in favor of ESLint.
- **Impact**: No new rules, no security plugins, unmaintained.
- **Files**: `frontend/tslint.json`, `frontend/package.json`
- **Action**: Migrate to ESLint + `@typescript-eslint` during Angular upgrade

### DEBT-13: Protractor Deprecated for E2E
- **What**: `protractor:7.0.0` is the E2E framework — deprecated and removed from Angular 15+.
- **Files**: `frontend/package.json`, `frontend/e2e/`
- **Action**: Migrate to Cypress or Playwright

### DEBT-14: JWT Rotates on Restart
- **What**: JWT signing key is generated at startup (`CipherUtil.generateSafeToken()`), not persisted. Every restart invalidates all sessions.
- **Impact**: Users are logged out on every deployment.
- **Files**: `backend/security/jwt/TokenProvider.java`, `backend/config/DatabaseConfiguration.java`
- **Action**: Store signing key in database or vault; load on startup, regenerate only on explicit rotation

### DEBT-15: Hardcoded Dev Credentials in application-dev.yml
- **What**: SMTP username/password hardcoded in dev config: `username: test@domain.local`, `password: Admin123.`
- **Files**: `backend/src/main/resources/config/application-dev.yml`
- **Action**: Move to environment variables

### DEBT-16: gRPC InsecureTrustManagerFactory (Backend→AgentManager)
- **What**: `GrpcConfiguration.java` uses `InsecureTrustManagerFactory.INSTANCE` — no certificate verification.
- **Impact**: MITM risk within Docker network.
- **Files**: `backend/config/GrpcConfiguration.java`
- **Action**: Load AgentManager's CA certificate and verify TLS properly

### DEBT-17: SOC AI Trust-All TLS
- **What**: `SocAIService.java` creates OkHttp client that trusts all certificates.
- **Files**: `backend/service/soc_ai/SocAIService.java`
- **Action**: Use proper TLS verification with EventProcessor's certificate

### DEBT-18: No Rate Limiting
- **What**: Only login endpoint has fail2ban-style protection. No rate limiting on other API endpoints.
- **Impact**: API endpoints are vulnerable to scraping, brute-force of non-login endpoints.
- **Action**: Implement rate limiting at nginx or Spring Security level

### DEBT-19: File Browser Route Disabled
- **What**: `filebrowser` module exists with route commented out. External `filebrowser` service referenced in compose generation but not defined.
- **Files**: `frontend/src/app/filebrowser/`, `app-routing.module.ts`
- **Action**: Document status; remove or complete the feature

### DEBT-20: SAAS_DEFAULT_PASSWORD Exposed in Source
- **What**: `global.constant.ts` contains `export const SAAS_DEFAULT_PASSWORD = 'DefaultPa$$word!'` — a default password exposed in version-controlled source code.
- **Files**: `frontend/src/app/shared/constants/global.constant.ts`
- **Action**: Remove from source; move to runtime configuration or remove if unused

---

## Low Priority / Cosmetic

### DEBT-21: console.log('UTMStack 401') in Interceptors
- Branding string exposed in browser console on auth failure
- Files: `auth-expired.interceptor.ts`, `account.service.ts`

### DEBT-22: ADMIN_DEFAULT_EMAIL = 'admin@localhost' Hardcoded
- Used for first-login detection logic
- Files: `global.constant.ts`, `account.service.ts`

### DEBT-23: version: '0.0.1' in environment.ts
- Both dev and prod environments have `VERSION: '0.0.1'` hardcoded
- Actual version comes from build-time injection or API
- Files: `environment.ts`, `environment.prod.ts`

### DEBT-24: Missing favicon for different display sizes
- Only one `favicon.ico` — no Apple Touch Icons, PWA manifest icons

### DEBT-25: i18n Coverage Near Zero
- `en.json` covers only a tiny fraction of UI strings
- Most text hardcoded in templates — significant work to properly internationalize
