# Phase 4 — Java 17 + Spring Boot 3.3 (user-auditor and web-pdf)

**Status:** ✅ COMPLETE (code changes applied — runtime verification requires Docker CI build)
**Date:** 2026-06-29

---

## Changes Made

### user-auditor

| File | Change |
|---|---|
| `user-auditor/pom.xml` | Spring Boot 2.7.14 → **3.3.6**; `java.version` 11 → **17**; compiler source/target 11 → **17** |
| `model/Audit.java` | `javax.persistence.*` → `jakarta.persistence.*` (duplicate import also cleaned) |
| `model/Base.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/User.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/UserAttribute.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/UserSource.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/SourceFilter.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/SourceScan.java` | `javax.persistence.*` → `jakarta.persistence.*` |
| `model/audit/AuditListener.java` | `javax.persistence.*` → `jakarta.persistence.*` |

**`javax.net.ssl.*`** in `ElasticsearchConnectionCheck.java` — **NOT changed**. This is from Java SE (`javax.net.ssl`) which is NOT renamed in the Jakarta EE migration. It stays as `javax.net.ssl` correctly.

### web-pdf

| File | Change |
|---|---|
| `web-pdf/pom.xml` | Spring Boot 2.7.14 → **3.3.6**; `java.version` 11 → **17**; Selenium 4.5.0 → **4.20.0** |
| `web-pdf/pom.xml` | **Removed** `spring-boot-devtools` (inappropriate in production Docker containers) |

**Zero Java source file changes in web-pdf** — the existing code uses only `org.springframework.*` and `org.openqa.selenium.*` which are not affected by the javax→jakarta migration.

### CI / Docs

| File | Change |
|---|---|
| `.github/workflows/v11-deployment-pipeline.yml` | `java_version: '11'` → `'17'` for both user-auditor and web-pdf build jobs |
| `AGENTS.md` | Updated `user-auditor` and `web-pdf` Java version references: 11 → 17 |

---

## Verification

### Structural checks (no JDK installed locally)

| Check | Result |
|---|---|
| `user-auditor/pom.xml` valid XML | ✅ Confirmed |
| `web-pdf/pom.xml` valid XML | ✅ Confirmed |
| `javax.persistence` remaining in user-auditor | ✅ **0 occurrences** |
| `javax.net.ssl` remains (correct — Java SE, not Jakarta EE) | ✅ 3 occurrences as expected |
| `javax.*` in web-pdf | ✅ 0 occurrences |
| Spring Boot version in both poms | ✅ 3.3.6 |
| Java version in both poms | ✅ 17 |
| Selenium in web-pdf | ✅ 4.20.0 |
| `spring-boot-devtools` in web-pdf | ✅ Removed |
| CI pipeline both use `java_version: '17'` | ✅ Confirmed |

### Runtime verification (requires Docker CI build — cannot do locally without JDK)

The full Phase 4 release readiness checklist (`docs/migration/09-release-readiness-checklist.md`)
requires:
- [ ] `user-auditor` Docker image builds with Java 17
- [ ] `web-pdf` Docker image builds with Java 17
- [ ] `user-auditor` health check: `curl http://localhost:8080/actuator/health` → healthy
- [ ] User login creates audit record
- [ ] PDF report generates for at least one template type

These will be verified when the CI pipeline runs on the next push to `release/v11*`.

---

## Why `javax.net.ssl` Was NOT Migrated

The Jakarta EE migration only renames packages that were part of the `javax.*` → `jakarta.*`
transition (JPA, Servlet, Validation, Mail, etc.). The `javax.net.ssl` package is part of
**Java SE** (the JDK standard library) and was never part of Jakarta EE. It does not change
between Java 11 and Java 17. Renaming it would be incorrect and would break compilation.

---

## Spring Boot 3.x Auto-Configuration Notes

Spring Boot 3.3.6 requires:
- **Hibernate 6.x** (auto-managed — no explicit version pin needed for user-auditor, which has none)
- **Liquibase 4.x** (auto-managed by Boot 3.3.x parent)
- **Jakarta namespace** for all JPA/Servlet/Validation annotations ✅ done

The user-auditor service has no explicit Hibernate version pin, so Boot 3.3.6 will supply
Hibernate 6.x automatically — this is the correct behavior.

---

## Rollback Procedure

```bash
# Roll back user-auditor
docker service update \
  --image ghcr.io/utmstack/utmstack/user-auditor:<previous-tag> \
  user-auditor

# Roll back web-pdf
docker service update \
  --image ghcr.io/utmstack/utmstack/web-pdf:<previous-tag> \
  web-pdf
```

Audit trail and PDF generation will resume on the previous images with no data loss.
No Liquibase changesets were added — rollback requires only Docker image swap.

---

## Next Step: Phase 5

**Phase 5:** Angular 7 → 17 (multi-step — largest change in the migration)
**Prerequisite:** T-004 (auth guard tests) and T-005 (interceptor tests) must be written on
Angular 7 first, then the incremental upgrade begins: 7→12→16→17.
**Duration:** 3–6 weeks | **Risk:** High

Awaiting approval to proceed.
