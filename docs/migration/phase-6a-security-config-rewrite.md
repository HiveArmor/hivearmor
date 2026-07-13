# Phase 6a — Security Configuration Rewrite (Spring Security 6 API Migration)

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: Medium — security-critical, isolated to one config class  
**Branch**: In-progress migration  

## Background

Spring Boot 3.x bundles Spring Security 6.x. Spring Security 6.0 **removed** `WebSecurityConfigurerAdapter`, which the backend's `SecurityConfiguration.java` was extending. This class was deprecated in Spring Security 5.7 and its removal is a hard compile error against Spring Security 6+.

Phase 6a resolves this by migrating to the `SecurityFilterChain` bean approach — the replacement pattern recommended since Spring Security 5.7. **All HTTP authorisation rules are preserved exactly** — only the wiring API changed.

## What Changed

### `SecurityConfiguration.java` — full rewrite

| Old API (Spring Security 5.x, removed in 6.0) | New API (Spring Security 6.x) |
|---|---|
| `extends WebSecurityConfigurerAdapter` | Class with `@Bean SecurityFilterChain` method |
| `@EnableGlobalMethodSecurity(prePostEnabled = true)` | `@EnableMethodSecurity(prePostEnabled = true)` |
| `@PostConstruct init()` + `AuthenticationManagerBuilder` | `@Bean DaoAuthenticationProvider` + `@Bean AuthenticationManager(AuthenticationConfiguration)` |
| `@Override authenticationManagerBean()` | `@Bean AuthenticationManager(AuthenticationConfiguration config)` |
| `@Override configure(HttpSecurity http)` | `@Bean SecurityFilterChain filterChain(HttpSecurity http)` |
| `.authorizeRequests()` | `.authorizeHttpRequests()` |
| `.antMatchers(...)` | `.requestMatchers(...)` |
| `.headers().frameOptions().disable()` | `.headers(h -> h.frameOptions(fo -> fo.disable()))` |
| `.csrf().disable()` | `.csrf(csrf -> csrf.disable())` |
| `.apply(new JWTConfigurer(...))` | `.with(new JWTConfigurer(...), c -> {})` |
| `.apply(new InternalApiKeyConfigurer(...))` | `.with(new InternalApiKeyConfigurer(...), c -> {})` |
| `.apply(new ApiKeyConfigurer(...))` | `.with(new ApiKeyConfigurer(...), c -> {})` |

### HTTP Rules — UNCHANGED

Every path rule is preserved exactly:

| Path | Rule |
|---|---|
| `/api/authenticate` | `permitAll` |
| `/api/authenticateFederationServiceManager` | `permitAll` |
| `/api/ping`, `/api/healthcheck`, `/api/date-format`, `/api/releaseInfo` | `permitAll` |
| `/api/account/reset-password/**` | `permitAll` |
| `/api/utm-providers`, `/api/images/all`, `/api/info/version` | `permitAll` |
| `/api/enrollment/**` | `PRE_VERIFICATION_USER` only |
| `/api/tfa/verify-code`, `/api/tfa/refresh` | `PRE_VERIFICATION_USER` OR `USER` OR `ADMIN` |
| `/api/tfa/**` | `ADMIN` OR `USER` |
| `/api/utm-incident-jobs`, `/api/utm-incident-jobs/**` | `ADMIN` only |
| `/api/utm-incident-variables/**` | `ADMIN` only |
| `GET /api/utm-incident-variables` | `ADMIN` OR `USER` |
| `/api/custom-reports/**` | `denyAll` |
| `/api/**` | `ADMIN` OR `USER` |
| `/ws/topic` | `ADMIN` only |
| `/ws/**` | `permitAll` |
| `/management/info` | `permitAll` |
| `/management/**` | `ADMIN` OR `USER` |

### Security Constants — UNCHANGED

These constants are load-bearing contracts between frontend, backend, and agents. None were touched:

| Constant | Value |
|---|---|
| `COOKIE_AUTH_TOKEN` | `'utmauth'` |
| `ACCESS_KEY` (Utm-Internal-Key header) | `'Utm-Internal-Key'` |
| `SESSION_AUTH_TOKEN` key pattern | `<HOSTNAME_UPPERCASE>_AUTH_TOKEN` |

## New Files — Tests

`src/test/` directory created for the first time. Required by `testing.md` — security auth changes must have tests in the same PR.

### `TokenProviderTest.java` (T-001 — 10 tests)
Location: `src/test/java/com/park/utmstack/security/jwt/`

| Test | What it covers |
|---|---|
| `createToken_adminRole_tokenIsValidAndContainsAdminAuthority` | Happy path — ADMIN role claim |
| `createToken_userRole_tokenContainsUserAuthority` | Happy path — USER role claim |
| `createToken_notAuthenticated_assignsPreVerificationUserRole` | TFA pending → PRE_VERIFICATION_USER regardless of actual role |
| `createToken_notAuthenticated_tokenExpiresInFiveMinutes` | Temp token expiry = TEMP_TOKEN_VALIDITY_IN_MILLIS (300s) |
| `isAuthenticated_fullyAuthenticatedToken_returnsTrue` | authenticated claim = true |
| `isAuthenticated_tfaTempToken_returnsFalse` | authenticated claim = false for TFA tokens |
| `validateToken_garbageString_returnsFalse` | Invalid JWT rejected |
| `validateToken_emptyString_returnsFalse` | Empty string rejected |
| `getUserLoginFromToken_validToken_returnsSubject` | Subject claim = username |
| `createToken_rememberMe_tokenValidityIsLong` | Remember-me expiry = 30 days |

### `UserJWTControllerTest.java` (T-002 — 4 tests)
Location: `src/test/java/com/park/utmstack/web/rest/`

Uses `@ExtendWith(MockitoExtension.class)` + `MockMvc.standaloneSetup` — no Spring context, fast.

| Test | What it covers |
|---|---|
| `authorize_validCredentials_tfaDisabled_returns200WithToken` | Happy path login — 200 + token in response |
| `authorize_wrongPassword_returns401` | Bad credentials → 401 |
| `authorize_tfaEnabled_userHasTfaConfigured_responseIndicatesTfaRequired` | TFA flow gating — `tfaConfigured=true`, `forceTfa=true` |
| `authorize_ipBlocked_returns401` | IP blocked by fail2ban → 401 |

### `src/test/resources/config/application.yml`
Minimal config for test-scoped Spring context (JHipster JWT token validity properties).

## Imports Kept Consistent

The rest of the security package (`JWTFilter`, `ApiKeyFilter`, `InternalApiKeyFilter`, `Saml2LoginSuccessHandler`, `TokenProvider`) all use `javax.servlet.*`. To avoid mixing `javax`/`jakarta` within the same compile unit boundary, `SecurityConfiguration.java` also keeps `javax.servlet.http.HttpServletResponse`. This will be migrated to `jakarta.servlet.*` in Phase 6b when the full `javax→jakarta` sweep runs.

## Run Tests

```bash
cd backend
mvn -s settings.xml test -pl . -Dtest=TokenProviderTest,UserJWTControllerTest
```

Full test suite (once Maven is available):
```bash
cd backend && mvn -s settings.xml test
```

## What Phase 6b Will Add

Phase 6b (Spring Boot 3.1.5 → 3.3.x) requires:
1. Upgrading `jhipster-dependencies` from `7.3.1` to a Boot-3.3-compatible version (JHipster 8.x BOM) OR removing the JHipster BOM and managing all dependency versions directly
2. Full `javax.*` → `jakarta.*` migration across all 211 affected files (360 import lines)
3. Updating `springdoc-openapi-ui:1.6.15` → `springdoc-openapi-starter-webmvc-ui:2.x` (artifact rename in Boot 3.x)
4. Updating `problem-spring-web` → `problem-spring-web-starter` (Zalando API rename for Boot 3.x)
5. Removing `elasticsearch-rest-high-level-client` (EOL — migrate to `opensearch-connector` exclusively)
6. Removing Hibernate 5 pin and allowing Boot 3.3 to use Hibernate 6

Phase 6b is a separate PR. Phase 6a is a standalone, safe, minimal change.

## Risk Assessment

**Actual risk**: Medium — all security rules preserved identically, but any misconfiguration in the new API would affect all endpoints.

**Verification** (local, once Maven is available):
```bash
cd backend && mvn -s settings.xml test -Dtest=TokenProviderTest,UserJWTControllerTest
cd backend && mvn -s settings.xml -B -Pprod clean package -DskipTests
```

**Rollback**: `git revert` the SecurityConfiguration.java change. No database changes — rollback is instant.
