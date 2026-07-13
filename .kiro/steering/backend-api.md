---
inclusion: fileMatch
fileMatchPattern: "backend/**"
---

# Backend API Conventions

## Stack

| Component | Version / Detail |
|---|---|
| Java | 17 |
| Spring Boot | 3.3.5 |
| Spring Security | 6.3.x (bundled with Boot 3.3.5) |
| JHipster scaffolding | 8.8.0 (JHipster 8 — Spring Boot 3.x support) |
| ORM | Hibernate **6.x** (managed by Spring Boot 3.3 BOM — Hibernate 5 pin removed in Phase 6b) |
| OpenSearch client | `com.hivearmor.opensearch.*` (internal — replaces private `opensearch-connector:1.0.5`) |
| DB migrations | Liquibase **4.27.0** — 200+ changesets |
| gRPC | io.grpc 1.65.1, protobuf-java 4.29.3 |
| Build output | WAR: `target/hivearmor.war` |

Build: `mvn -B -Pprod clean package -s settings.xml`  
Requires: `$MAVEN_TK` env var (GitHub PAT `read:packages`) for GitHub Packages  
⚠️ Do not use `mvn jib:build` — the base image in pom.xml has been updated to `eclipse-temurin:17-jre-jammy`

## Package Layout

```
com.hivearmor/
├── config/            @Configuration classes (Security, gRPC, WebSocket, DB, SAML2, TFA cache)
├── domain/            JPA entities, 30+ sub-packages
├── repository/        Spring Data JPA repos (mirror of domain/)
├── service/           Business logic + @Scheduled workers
├── security/          JWT, SAML2, API Key, Internal API Key filter chains
├── web/rest/          REST controllers — naming: *Resource.java, *Controller.java
└── event_processor/   gRPC stubs + DTOs for EventProcessor communication
```

## REST API Conventions

- **No versioning**: all endpoints at `/api/`. Breaking changes require coordinated frontend+backend deployment.
- **Naming**: `@RequestMapping("/api/ha-<entity>")` — match existing `*Resource.java` pattern
- **Pagination**: `page`, `size`, `sort` query params; `X-Total-Count` response header (JHipster standard)
- **Filtering**: JHipster criteria spec — `name.contains=`, `status.equals=`, `id.greaterThan=`, etc.
- **Error format**: Zalando Problem RFC-7807 (`application/problem+json`) — do not return raw strings on error
- **Public endpoints** (no auth required): `/api/authenticate`, `/api/ping`, `/api/healthcheck`, `/api/info/version`, `/api/ha-providers`, `/api/images/all`, `/api/account/reset-password/**`
- **Blocked path**: `/api/custom-reports/**` is `denyAll` in `SecurityConfiguration.java` — do not create endpoints there

## Security Configuration

`SecurityConfiguration.java` uses the **Spring Security 6 `SecurityFilterChain` bean pattern** (Phase 6a — migrated from the removed `WebSecurityConfigurerAdapter`).

Key points:
- `@EnableMethodSecurity(prePostEnabled = true)` replaces the removed `@EnableGlobalMethodSecurity`
- `DaoAuthenticationProvider` bean replaces the old `@PostConstruct AuthenticationManagerBuilder` pattern
- `.authorizeHttpRequests()` + `.requestMatchers()` replace `.authorizeRequests()` + `.antMatchers()`
- Custom filter chains (`JWTConfigurer`, `InternalApiKeyConfigurer`, `ApiKeyConfigurer`) use `.with(configurer, c -> {})` instead of `.apply()`
- All HTTP path rules are unchanged — see `docs/migration/phase-6a-security-config-rewrite.md`

## Authentication Layers (evaluated in this order)

1. **JWT** (`JWTFilter`) — `Authorization: Bearer <token>`
2. **Internal API Key** (`InternalApiKeyFilter`) — `Utm-Internal-Key` header — service-to-service only
3. **External API Key** (`ApiKeyFilter`) — third-party integrations
4. **SAML2** — `saml2Login()` block; issues UTMStack JWT on success

Every new endpoint must explicitly appear in one of:
- `SecurityConfiguration.java` HTTP rules (public or role-constrained)
- `@PreAuthorize("hasRole('ROLE_ADMIN')")` / `@PreAuthorize("isAuthenticated()")` on the method

## Roles

- `ROLE_ADMIN` — full platform access
- `ROLE_USER` — operational access (alerts, incidents, dashboards, SOAR)
- `PRE_VERIFICATION_USER` — transient TFA-pending role; only `/api/tfa/**` and `/api/enrollment/**` are allowed

## Liquibase Migration Rules

Location: `backend/src/main/resources/config/liquibase/`  
Master: `master.xml` — include new files here in date order

```
changelog/YYYYMMDDNNN_short_description.xml    # e.g. 20260701001_add_alert_source_field.xml
```

- **Never edit a shipped changeset.** Add a new one.
- **Add-only**: new columns, new tables, new indexes. No `DROP COLUMN`, `RENAME COLUMN`, or table removal without a 2-release deprecation notice.
- Run `mvn -s settings.xml liquibase:validate` locally before merging.
- Migrations run automatically on startup — there is no separate pre-deploy migration step.

## Scheduled Workers

Do not change intervals or disable these without understanding downstream impact:

| Service class | Interval | What it does |
|---|---|---|
| `UtmAlertTagRuleService` | 30 s | Applies auto-tagging rules to new alerts in OpenSearch |
| `UtmAlertResponseRuleService` | 30 s | Evaluates SOAR automated response rules |
| `UtmLogstashPipelineService` | 20 s | Syncs pipeline config to eventprocessor |
| `ElasticsearchService` | 60 s | OpenSearch cluster health check; sends email alert if degraded |
| `UtmComplianceReportScheduleService` | 5 s | Runs pending scheduled compliance report jobs |
| `UserService` | daily 01:00 | Cleans up expired activation keys and tokens |

Use `@Scheduled(fixedDelay = <ms>, initialDelay = <ms>)` — match the existing pattern.

## OpenSearch Access

All OpenSearch queries go through `ElasticsearchService` / `OpensearchClientBuilder`.  
Use the existing `SearchUtil` DSL builders for query construction.  
**Never build OpenSearch query strings via string concatenation with user input.**

## Key Service References

| Class | Location | Notes |
|---|---|---|
| `TokenProvider` | `security/jwt/` | JWT sign/verify; key is ephemeral — rotates on restart |
| `SecurityConfiguration` | `config/` | Full HTTP security rules; start here for auth questions |
| `UtmCorrelationRulesService` | `service/correlation/rules/` | System rule protection logic |
| `SocAIService` | `service/soc_ai/` | OkHttp call to eventprocessor SOC AI endpoint |
| `MailService` | `service/mail/` | Thymeleaf-rendered emails |
| `OpensearchClientBuilder` | `service/elasticsearch/` | Singleton; self-heals on connection loss |

## Build Commands

```bash
cd backend
mvn -s settings.xml -B                               # run dev server (port 8080)
mvn -B -Pprod clean package -s settings.xml          # production WAR
mvn -s settings.xml liquibase:validate               # validate migration scripts
mvn -s settings.xml test                             # run tests (once src/test/ exists)
```
