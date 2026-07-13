# Phase 7 — Hibernate 6 JPQL Audit

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: Low — no query logic changed; only configuration and annotation updates  

## Audit Results

### JPQL Query Patterns — All Clean

Scanned all 39 `QueryService` subclasses and all `@Query` annotations across the backend.

**No implicit `FROM` queries found.** Every JPQL query uses an explicit `SELECT`, `UPDATE`, or `DELETE`  
keyword — the Hibernate 5 implicit `FROM Entity` shorthand was never used in this codebase.

Total `@Query` JPQL statements audited: **~50**  
Issues found: **0**

### Changes Made

#### 1. `application.yml` — Naming strategy classes updated

Spring Boot 3.x removed `SpringPhysicalNamingStrategy` and `SpringImplicitNamingStrategy` from  
`org.springframework.boot.orm.jpa.hibernate`. Replaced with the Hibernate 6 native equivalents:

| Before | After |
|---|---|
| `org.springframework.boot.orm.jpa.hibernate.SpringPhysicalNamingStrategy` | `org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy` |
| `org.springframework.boot.orm.jpa.hibernate.SpringImplicitNamingStrategy` | `org.hibernate.boot.model.naming.ImplicitNamingStrategyJpaCompliantImpl` |

The `CamelCaseToUnderscoresNamingStrategy` is the direct equivalent — it maps `assetName` → `asset_name`,  
preserving all existing column mappings without any schema change.

#### 2. `application.yml` — Removed deprecated Hibernate property

`hibernate.id.new_generator_mappings: true` was removed from `jpa.properties`.  
This property was deprecated in Hibernate 5.x and removed in Hibernate 6 — it is always `true`  
by default and the property is no longer recognized.

#### 3. `pom.xml` — Liquibase referenceUrl updated

The Liquibase diff URL referenced the old naming strategy class names. Updated to match the  
new Hibernate 6 names so `mvn liquibase:diff` generates correct changesets.

## Hibernate 6 Migration Summary (Phases 6b + 7 combined)

All Hibernate 5 → 6 breaking changes resolved:

| Category | Count | Status |
|---|---|---|
| `javax.*` → `jakarta.*` imports | 360 lines / 214 files | ✅ Fixed in Phase 6b |
| `@Type(type="text")` removed | 1 entity | ✅ Fixed in Phase 6b |
| `TypedParameterValue(XxxType, val)` → `TypedParameterValue(StandardBasicTypes.XXX, val)` | 7 usages | ✅ Fixed in Phase 6b |
| `QueryHints.HINT_PASS_DISTINCT_THROUGH` moved | 1 usage | ✅ Fixed in Phase 6b |
| `BooleanType/LongType/StringType` removed | 3 types | ✅ Fixed in Phase 6b |
| `IdentityGenerator.generate()` signature changed | 1 class | ✅ Rewritten in Phase 6b |
| `@GenericGenerator(strategy=...)` → `type=` | 21 entities | ✅ Fixed in Phase 6b |
| `hibernate-jpamodelgen` group change | pom.xml | ✅ Fixed in Phase 6b |
| `jackson-datatype-hibernate5` → `hibernate6` | 2 files | ✅ Fixed in Phase 6b |
| Implicit `FROM` queries | 0 found | ✅ No action needed |
| Naming strategy classes | application.yml | ✅ Fixed in Phase 7 |
| `hibernate.id.new_generator_mappings` removed | application.yml | ✅ Fixed in Phase 7 |
| `org.hibernate.jpa.TypedParameterValue` package move | 2 files | ✅ Fixed in Phase 6b |
| `org.hibernate.jpa.HibernateHints` moved | 1 file | ✅ Fixed in Phase 6b |

## Final Verification

```
mvn -s settings.xml -B clean compile -DskipTests   → BUILD SUCCESS ✅
mvn -s settings.xml test -Dtest=TokenProviderTest,UserJWTControllerTest → 14/14 PASS ✅
```

## What's Next — Phase 8

Go module updates: `go get -u ./... && go mod tidy` in each Go module  
(`agent/`, `agent-manager/`, `plugins/*/`, `utmstack-collector/`, `as400/`, `installer/`)
