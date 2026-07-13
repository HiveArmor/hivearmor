# Deferred: Phase 6b Backend Build Verification

**Date deferred**: June 2026  
**Reason**: Local dev machine missing `MAVEN_TK` — single private GitHub Package dependency  
**Priority**: Complete before merging Phase 6b PR to `release/v11`

---

## What needs to be verified

Phase 6b made the following changes to `backend/pom.xml` and 214 Java source files.
The changes are structurally correct but the full compile has not been confirmed locally
because `opensearch-connector:1.0.5` requires a GitHub PAT to download.

### Changes made in Phase 6b (need compile verification)

1. `jhipster-dependencies` 7.3.1 → 8.8.0
2. `spring-boot.version` 3.1.5 → 3.3.5
3. Hibernate 5 pin removed → Hibernate 6 (managed by Boot 3.3 BOM)
4. `javax.*` → `jakarta.*` migration across 214 files
5. `springdoc-openapi-ui:1.6.15` → `springdoc-openapi-starter-webmvc-ui:2.6.0`
6. `problem-spring-web` → `problem-spring-web-starter:0.29.1`
7. `jackson-datatype-hibernate5` → `jackson-datatype-hibernate6`
8. `elasticsearch-rest-high-level-client` removed
9. `org.thymeleaf.spring5` → `org.thymeleaf.spring6` (MailService, PdfUtil)
10. `Java8TimeDialect` removed (built into Thymeleaf 3.1+)
11. `AngularCookieLocaleResolver` → Spring's `CookieLocaleResolver` (LocaleConfiguration)
12. `gson:2.11.0` added explicitly (dropped from JHipster 8 BOM)
13. `logstash-logback-encoder:8.0` added explicitly (optional in JHipster 8 framework)
14. `jjwt:0.11.5` pinned explicitly (dropped from JHipster 8 BOM)
15. `jakarta.validation-api:3.0.2` pinned in Liquibase plugin section
16. `revision` property default `11.0.0-SNAPSHOT` added
17. Shibboleth repository added to `settings.xml` (OpenSAML v4+ not on Maven Central)

---

## The Blocker

```
com.utmstack:opensearch-connector:1.0.5
Source: https://maven.pkg.github.com/utmstack/**
Auth:   MAVEN_TK env var (GitHub PAT, read:packages scope)
```

This is UTMStack's internal OpenSearch client wrapper. It is NOT on Maven Central.
It IS available in CI (GitHub Actions secret `MAVEN_TK` is already configured).

---

## How to complete verification

### Option A — On a machine with MAVEN_TK (recommended)

```bash
# 1. Set the token
export MAVEN_TK=<github_pat_with_read_packages>

# 2. Set Java 17
export JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.19  # macOS Apple Silicon
# or: export JAVA_HOME=$(java_home -v 17)                  # macOS
# or: export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # Linux

export PATH="$JAVA_HOME/bin:$PATH"

# 3. Verify Java and Maven
java -version   # must show 17.x
mvn -version    # must show Maven 3.9.x

# 4. Compile (no tests, just verify it compiles)
cd backend
mvn -s settings.xml -B clean compile -DskipTests

# 5. Run auth tests (T-001 and T-002)
mvn -s settings.xml test -Dtest=TokenProviderTest,UserJWTControllerTest

# 6. Full production WAR build (optional — slow)
mvn -B -Pprod clean package -s settings.xml -DskipTests
```

Expected output for step 4:
```
[INFO] BUILD SUCCESS
```

Expected output for step 5:
```
Tests run: 14, Failures: 0, Errors: 0
```

### Option B — In CI (GitHub Actions)

The existing CI pipeline already has `MAVEN_TK` configured. Push the Phase 6b
branch and check if the `reusable-java.yml` workflow passes. The workflow runs:
```yaml
- run: cd backend && mvn -s settings.xml -B -Pprod clean package
```

---

## Compile errors that are already fixed

These were found during partial local verification and fixed before deferral:

| Error | Fix applied |
|---|---|
| `${revision}` constant version error | Added `<revision>11.0.0-SNAPSHOT</revision>` property |
| `jjwt-api/impl/jackson` missing version | Pinned to `0.11.5` |
| `jakarta.validation-api` missing version in Liquibase plugin | Pinned to `3.0.2` |
| `tech.jhipster.config.locale.AngularCookieLocaleResolver` not found | Replaced with `CookieLocaleResolver` |
| `org.thymeleaf.spring5.SpringTemplateEngine` not found | Changed to `spring6` in MailService + PdfUtil |
| `org.thymeleaf.extras.java8time.dialect.Java8TimeDialect` not found | Removed (native in Thymeleaf 3.1+) |
| `net.logstash.logback.argument` not found | Added explicit `logstash-logback-encoder:8.0` dep |
| `com.google.gson.*` not found | Added explicit `gson:2.11.0` dep |
| OpenSAML 401 on download | Added Shibboleth repo to `settings.xml` |
| `org.hibernate:hibernate-jpamodelgen` in IDE profile | Changed to `org.hibernate.orm` group |

---

## Why this is safe to defer

- **CI already works** — GitHub Actions has `MAVEN_TK` and will validate the full compile
- **Runtime is unaffected** — the running Docker stack uses pre-built images, not local builds
- **Phases 7–11 are independent** — Hibernate JPQL audit, Go updates, ECharts, Bootstrap, and branding changes don't require the backend to compile locally
- **No security risk** — no auth code was changed in Phase 6b (that was Phase 6a)

---

## Checklist before merging Phase 6b PR

- [ ] `MAVEN_TK` obtained from GitHub (org admin or generate your own PAT)
- [ ] `mvn -s settings.xml -B clean compile -DskipTests` exits with `BUILD SUCCESS`
- [ ] `TokenProviderTest` — 10 tests pass
- [ ] `UserJWTControllerTest` — 4 tests pass
- [ ] No `javax.persistence`, `javax.validation`, `javax.servlet` imports remaining (zero count)
- [ ] Application starts and `/api/ping` responds 200
- [ ] Login flow (`POST /api/authenticate`) works end-to-end

---

## Token generation instructions

1. Go to: https://github.com/settings/tokens → "Generate new token (classic)"
2. Note: `UTMStack backend local build`
3. Expiration: 90 days (or no expiration for a shared dev machine)
4. Scope: ☑ `read:packages` only — nothing else needed
5. Click "Generate token" → copy the token value
6. `export MAVEN_TK=ghp_xxxxxxxxxxxxxxxxxxxx`
7. Add to `~/.zshrc` for persistence: `echo 'export MAVEN_TK=ghp_xxx' >> ~/.zshrc`

**Note**: If you're not a member of the `utmstack` GitHub org, ask an org admin to generate
the token or to publish `opensearch-connector` to Maven Central.
