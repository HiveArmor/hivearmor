# Phase 6b — Spring Boot 3.1.5 → 3.3.5 + Jakarta EE 10 Migration

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: High — BOM-level change, full javax→jakarta sweep, Hibernate 6  
**Branch**: In-progress migration  

## Background

Spring Boot 3.x requires the full Jakarta EE 10 namespace. All `javax.*` packages from Jakarta EE
(persistence, validation, servlet, transaction, mail, activation, annotation lifecycle) must become
`jakarta.*`. Java SE stdlib packages (`javax.net`, `javax.crypto`, `javax.sql`, `javax.imageio`)
are unchanged — they are not part of Jakarta EE.

JHipster 7.x only supports Spring Boot 2.x. Upgrading to Boot 3.3 required upgrading
`jhipster-dependencies` from 7.3.1 → 8.8.0 (JHipster 8 BOM manages Spring Boot 3.3).

## What Changed

### `pom.xml` — all dependency updates

| Before | After | Reason |
|---|---|---|
| `jhipster-dependencies:7.3.1` | `jhipster-dependencies:8.8.0` | Boot 3.x only supported by JHipster 8 |
| `spring-boot.version:3.1.5` | `spring-boot.version:3.3.5` | Phase 6 objective |
| `hibernate.version:5.4.32.Final` (pinned) | **removed** — Boot 3.3 BOM manages Hibernate 6 | Hibernate 5 pin was a known mismatch |
| `javassist.version:3.27.0-GA` | **removed** — only needed for Hibernate 5 | No longer required |
| `liquibase-hibernate5:4.5.0` | `liquibase-hibernate6:4.27.0` | Hibernate 6 compatibility |
| `liquibase.version:4.24.0` | `liquibase.version:4.27.0` | Latest compatible with Hibernate 6 |
| `validation-api.version:2.0.1.Final` | **removed** — `jakarta.validation-api` in Boot BOM | Jakarta EE migration |
| `javax.annotation-api` | **removed** — provided by Jakarta EE 10 in Boot 3.3 BOM | Jakarta EE migration |
| `jackson-datatype-hibernate5` | `jackson-datatype-hibernate6` | Hibernate 6 Jackson module |
| `elasticsearch-rest-high-level-client:7.12.1` | **removed** | EOL; use `opensearch-connector` exclusively |
| `problem-spring-web` | `problem-spring-web-starter:0.29.1` | Boot 3.x artifact rename |
| `springdoc-openapi-ui:1.6.15` | `springdoc-openapi-starter-webmvc-ui:2.6.0` | Boot 3.x artifact (v1→v2) |
| `org.hibernate:hibernate-jpamodelgen` | `org.hibernate.orm:hibernate-jpamodelgen` | Hibernate 6 group change |
| `org.hibernate:hibernate-core` | `org.hibernate.orm:hibernate-core` | Hibernate 6 group change |
| `jaxb-runtime:2.3.3` | `jaxb-runtime:4.0.5` | Jakarta EE 10 JAXB |
| `jib-maven-plugin.image:eclipse-temurin:11-jre-focal` | `eclipse-temurin:17-jre-jammy` | Java 17 base image |

### Java source migration — `javax` → `jakarta`

**Script used**: `.cursor-audit/javax-to-jakarta.py`  
**Files changed**: 214 source files

| Package | Direction | Files |
|---|---|---|
| `javax.persistence.*` | → `jakarta.persistence.*` | 87 files |
| `javax.validation.*` | → `jakarta.validation.*` | 149 files |
| `javax.servlet.*` | → `jakarta.servlet.*` | 21 files |
| `javax.transaction.*` | → `jakarta.transaction.*` | 2 files |
| `javax.mail.*` | → `jakarta.mail.*` | 5 files |
| `javax.activation.*` | → `jakarta.activation.*` | 1 file |
| `javax.annotation.PostConstruct` | → `jakarta.annotation.PostConstruct` | 2 files |
| `javax.annotation.PreDestroy` | → `jakarta.annotation.PreDestroy` | 1 file |
| `javax.net.*` | **unchanged** — Java SE stdlib | 0 |
| `javax.crypto.*` | **unchanged** — Java SE stdlib | 0 |
| `javax.sql.*` | **unchanged** — Java SE stdlib | 0 |
| `javax.imageio.*` | **unchanged** — Java SE stdlib | 0 |
| `javax.annotation.Nullable/Nonnull` | **unchanged** — JSR-305, not Jakarta EE | 0 |

### SpringDoc v1 → v2 import changes (11 files)

| Old import | New import |
|---|---|
| `org.springdoc.api.annotations.ParameterObject` | `org.springdoc.core.annotations.ParameterObject` |
| `org.springdoc.core.customizers.OpenApiCustomiser` | `org.springdoc.core.customizers.OpenApiCustomizer` |

### Stale import removed

- `UtmLogstashPipelineService.java`: removed unused `import org.elasticsearch.search.aggregations.Aggregations` (last reference to the removed `elasticsearch-rest-high-level-client`)

## What Did NOT Change

- No Liquibase changesets were added or modified — schema is identical
- No REST endpoint paths changed
- No security rules changed
- No agent/collector code changed
- No frontend code changed
- JWT signing key generation unchanged
- All auth constants (`utmauth`, `Utm-Internal-Key`, token key pattern) unchanged

## Phase 7 — Hibernate 6 JPQL Audit (next step)

Hibernate 6 requires explicit `select` in all JPQL queries. The implicit form `from Entity` is
no longer valid. Phase 7 will audit all `@Query` annotations and `EntityManager.createQuery()`
calls across the backend for Hibernate 6 compliance.

Known at-risk patterns (from static scan):
- Any JPQL with `FROM` as first token (no `SELECT`)
- Any `QueryService` criteria specifications referencing removed Hibernate 5 APIs

## Verification (requires Maven + Java 17 on build machine)

```bash
cd backend
mvn -s settings.xml -B -Pprod clean package -DskipTests
mvn -s settings.xml test -Dtest=TokenProviderTest,UserJWTControllerTest
```

## Rollback

```bash
git revert HEAD  # reverts pom.xml and all javax→jakarta changes
```

No database schema changes — rollback is safe at any point.
