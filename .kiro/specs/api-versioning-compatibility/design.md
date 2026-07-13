# Design Document — API Versioning and Compatibility

## Overview

This design introduces a `/api/v1/` URL namespace for UTMStack v11's REST API while leaving
every existing `/api/` URL behaviorally identical throughout a mandatory dual-routing transition
window. The implementation adds three new source files, modifies two existing files
(`SecurityConfiguration.java` and the JHipster CORS YAML), and establishes the test directory
that currently does not exist. No Liquibase changesets are created. No gRPC, OpenSearch, or
agent code is touched.

The strategy is deliberate minimalism: instead of a new routing framework or an API gateway,
the versioning is achieved by a single Spring `@Configuration` class that registers additional
`@RequestMapping` prefixes delegating to the **existing service layer**, plus a
`OncePerRequestFilter` that injects deprecation headers on the way out.

### Key design decisions

| Decision | Rationale |
|---|---|
| Single `VersioningConfiguration.java` — no new controllers | Keeps all business logic in one place; v1 handlers are thin forwarding wrappers that call the same service beans |
| In-memory `Map` for deprecation registry | No DB, no restart required to add an entry; safe to roll back with a Docker image swap |
| `OncePerRequestFilter` for headers — not `HandlerInterceptor` | Filter runs before Spring MVC dispatch; guaranteed to fire even on 4xx/5xx error paths that bypass `DispatcherServlet` |
| `antMatchers` in `SecurityConfiguration` — not `@PreAuthorize` | `SecurityConfiguration` is the single source of truth per team conventions; method-level annotations would scatter security rules |
| `jqwik` for property-based tests | JUnit 5 compatible (JHipster 7 already uses JUnit 5); no extra test runner needed |

---

## Architecture

### Request routing — before and after

Before this feature all traffic flows:

```
Browser → nginx → backend:8080
  → CorsFilter → JWTFilter → InternalApiKeyFilter → ApiKeyFilter
  → DispatcherServlet
  → /api/<resource>  →  *Resource.java  →  *Service.java
```

After this feature:

```
Browser → nginx → backend:8080
  → CorsFilter → JWTFilter → InternalApiKeyFilter → ApiKeyFilter
  → DeprecationHeaderFilter  (new — fires on deprecated /api/** paths only)
  → DispatcherServlet
  → /api/<resource>       →  *Resource.java (unchanged)
         ↗
  → /api/v1/<resource>    →  VersioningConfiguration.java (new, delegates to same *Service.java)
```

The `DeprecationHeaderFilter` is registered **after** the `CorsFilter` but **before** `DispatcherServlet`
via Spring Boot's `FilterRegistrationBean` ordering. This guarantees deprecation headers appear on
every response — including error responses — without requiring changes to any controller.

### Component diagram

```
com.park.utmstack/
├── config/
│   ├── SecurityConfiguration.java          ← MODIFIED (new /api/v1/** antMatchers only)
│   ├── WebConfigurer.java                  ← MODIFIED (CORS exposedHeaders only)
│   └── versioning/                         ← NEW PACKAGE
│       ├── VersioningConfiguration.java    ← new @Configuration (Phase 0)
│       ├── DeprecationHeaderFilter.java    ← new OncePerRequestFilter (Phase 0)
│       └── DeprecationRegistry.java        ← new value-object / registry holder (Phase 0)
└── web/rest/                               ← UNCHANGED — all existing controllers stay as-is
```

---

## Components and Interfaces

### 1. `VersioningConfiguration.java`

**Package:** `com.park.utmstack.config.versioning`
**Type:** `@Configuration` class

This class is the Version_Adapter. It does **not** contain any business logic. Each inner
handler method accepts the same parameters and calls the same service bean as the corresponding
legacy `*Resource.java` controller. The `@RequestMapping` prefix `/api/v1` is declared at
the class level on each nested `@RestController` inner class.

**Structural sketch:**

```java
package com.park.utmstack.config.versioning;

import com.park.utmstack.service.UtmAlertService;
// ... other service imports
import org.springframework.context.annotation.Configuration;
import org.springframework.web.bind.annotation.*;

@Configuration
public class VersioningConfiguration {

    // ── Alerts ──────────────────────────────────────────────────────────────

    @RestController
    @RequestMapping("/api/v1")
    static class AlertsV1 {
        private final UtmAlertService utmAlertService;
        // ... other services injected via constructor

        AlertsV1(UtmAlertService utmAlertService) {
            this.utmAlertService = utmAlertService;
        }

        @PostMapping("/utm-alerts/status")
        ResponseEntity<Void> updateAlertStatus(
                @RequestBody UpdateAlertStatusRequestBody rq) throws IOException {
            // identical body to UtmAlertResource.updateAlertStatus — calls same service
            utmAlertService.updateStatus(rq.getAlertIds(), rq.getStatus(),
                                         rq.getStatusObservation());
            return ResponseEntity.ok().build();
        }

        @GetMapping("/utm-alerts/count-open-alerts")
        ResponseEntity<Long> countOpenAlerts() {
            return ResponseEntity.ok(alertUtil.countAlertsByStatus(2));
        }
        // ... other alert methods
    }

    // ── Additional resource groups added in later phases ──────────────────
    // @RestController @RequestMapping("/api/v1") static class DashboardsV1 { ... }
    // @RestController @RequestMapping("/api/v1") static class ComplianceV1 { ... }
}
```

**Important:** `VersioningConfiguration` must never:
- Import `Repository` classes directly — go through the service layer only
- Contain `@Scheduled` methods
- Contain any OpenSearch query logic

### 2. `DeprecationRegistry.java`

**Package:** `com.park.utmstack.config.versioning`
**Type:** Spring `@Component` (singleton)

Holds an in-memory, thread-safe map of deprecated legacy path patterns to their deprecation
metadata. The map is populated at startup and never mutated at runtime, so it needs only
read-side thread safety (immutable after construction).

```java
package com.park.utmstack.config.versioning;

import org.springframework.stereotype.Component;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class DeprecationRegistry {

    public record DeprecationInfo(String sunsetDate, String successorPath) {}

    // Key: exact legacy path prefix (e.g. "/api/utm-alerts")
    // Populated by VersioningConfiguration @PostConstruct or directly here.
    private final Map<String, DeprecationInfo> registry;

    public DeprecationRegistry() {
        Map<String, DeprecationInfo> m = new LinkedHashMap<>();
        // Entries are added here, one line per deprecated path, as each phase ships.
        // Phase 1 example (not populated until Phase 1 PR):
        // m.put("/api/utm-configuration-parameters",
        //       new DeprecationInfo("Sat, 31 Dec 2026 00:00:00 GMT",
        //                          "/api/v1/utm-configuration-parameters"));
        this.registry = Collections.unmodifiableMap(m);
    }

    /** Returns null if the path is not registered for deprecation. */
    public DeprecationInfo lookup(String requestPath) {
        return registry.entrySet().stream()
            .filter(e -> requestPath.startsWith(e.getKey()))
            .map(Map.Entry::getValue)
            .findFirst()
            .orElse(null);
    }

    public Map<String, DeprecationInfo> allEntries() {
        return registry;
    }
}
```

### 3. `DeprecationHeaderFilter.java`

**Package:** `com.park.utmstack.config.versioning`
**Type:** `OncePerRequestFilter`

Intercepts every response. For requests whose path matches a deprecated legacy path (i.e., starts
with `/api/` but NOT `/api/v1/`), and whose path is registered in `DeprecationRegistry`, it sets
the three RFC 8594 headers before the response is committed.

**Negative-match strategy:** The filter checks `requestPath.startsWith("/api/v1/")` first and
returns immediately (no header injection) if true. This is the only guard needed — it is cheaper
and more explicit than a regex pattern.

```java
package com.park.utmstack.config.versioning;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@Component
public class DeprecationHeaderFilter extends OncePerRequestFilter {

    private final DeprecationRegistry registry;

    public DeprecationHeaderFilter(DeprecationRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Only inject on /api/** — never on /api/v1/**
        if (path.startsWith("/api/") && !path.startsWith("/api/v1/")) {
            DeprecationRegistry.DeprecationInfo info = registry.lookup(path);
            if (info != null) {
                response.setHeader("Deprecation", "true");
                response.setHeader("Sunset", info.sunsetDate());
                response.setHeader("Link",
                    "<" + info.successorPath() + ">; rel=\"successor-version\"");
            }
        }

        chain.doFilter(request, response);
    }
}
```

**Thread safety:** `DeprecationRegistry.registry` is an `UnmodifiableMap` set in the constructor.
The filter itself has no mutable state. Both beans are Spring singletons. Concurrent requests are
safe with no synchronization needed.

**Filter ordering:** Registered via `FilterRegistrationBean` in `VersioningConfiguration` with
`order = Ordered.LOWEST_PRECEDENCE - 10` — this places it after the `CorsFilter` (which runs early)
but before `DispatcherServlet` processes the request. Since headers are set on the **response**
object (not the request), calling `chain.doFilter(...)` first and setting headers after would risk
the response being committed; therefore headers are set **before** `chain.doFilter(...)`.

**Registration sketch inside `VersioningConfiguration`:**

```java
@Bean
public FilterRegistrationBean<DeprecationHeaderFilter> deprecationFilterRegistration(
        DeprecationHeaderFilter filter) {
    FilterRegistrationBean<DeprecationHeaderFilter> bean = new FilterRegistrationBean<>(filter);
    bean.addUrlPatterns("/api/*");
    bean.setOrder(Ordered.LOWEST_PRECEDENCE - 10);
    return bean;
}
```

### 4. `SecurityConfiguration.java` changes

**File:** `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java`
**Change type:** Append-only — no existing line is deleted or reordered

The existing `configure(HttpSecurity http)` method currently contains these rules in this order
(lines are quoted verbatim from the source):

```java
.antMatchers("/api/authenticate").permitAll()
.antMatchers("/api/authenticateFederationServiceManager").permitAll()
.antMatchers("/api/ping").permitAll()
.antMatchers("/api/date-format").permitAll()
.antMatchers("/api/healthcheck").permitAll()
.antMatchers("/api/releaseInfo").permitAll()
.antMatchers("/api/account/reset-password/init").permitAll()
.antMatchers("/api/account/reset-password/finish").permitAll()
.antMatchers("/api/utm-providers").permitAll()
.antMatchers("/api/images/all").permitAll()
.antMatchers("/api/info/version").permitAll()
.antMatchers("/api/enrollment/**").hasAnyAuthority(PRE_VERIFICATION_USER)
.antMatchers("/api/tfa/verify-code").hasAnyAuthority(PRE_VERIFICATION_USER, USER, ADMIN)
.antMatchers("/api/tfa/refresh").hasAnyAuthority(PRE_VERIFICATION_USER, USER, ADMIN)
.antMatchers("/api/tfa/**").hasAnyAuthority(ADMIN, USER)
.antMatchers("/api/utm-incident-jobs").hasAuthority(ADMIN)
.antMatchers("/api/utm-incident-jobs/**").hasAuthority(ADMIN)
.antMatchers("/api/utm-incident-variables/**").hasAuthority(ADMIN)
.antMatchers(HttpMethod.GET, "/api/utm-incident-variables").hasAnyAuthority()
.antMatchers("/api/custom-reports/**").denyAll()
.antMatchers("/api/**").hasAnyAuthority(ADMIN, USER)
```

The new rules are inserted **immediately before** `.antMatchers("/api/**").hasAnyAuthority(ADMIN, USER)`
and in the same grouping as their legacy counterpart. The precise diff:

```diff
+// --- /api/v1/** public endpoints (mirrors above permitAll block) ---
+.antMatchers("/api/v1/authenticate").permitAll()
+.antMatchers("/api/v1/ping").permitAll()
+.antMatchers("/api/v1/date-format").permitAll()
+.antMatchers("/api/v1/healthcheck").permitAll()
+.antMatchers("/api/v1/releaseInfo").permitAll()
+.antMatchers("/api/v1/account/reset-password/init").permitAll()
+.antMatchers("/api/v1/account/reset-password/finish").permitAll()
+.antMatchers("/api/v1/utm-providers").permitAll()
+.antMatchers("/api/v1/images/all").permitAll()
+.antMatchers("/api/v1/info/version").permitAll()
+// --- /api/v1/** restricted endpoints (mirrors above restricted block) ---
+.antMatchers("/api/v1/enrollment/**").hasAnyAuthority(PRE_VERIFICATION_USER)
+.antMatchers("/api/v1/tfa/verify-code").hasAnyAuthority(PRE_VERIFICATION_USER, USER, ADMIN)
+.antMatchers("/api/v1/tfa/refresh").hasAnyAuthority(PRE_VERIFICATION_USER, USER, ADMIN)
+.antMatchers("/api/v1/tfa/**").hasAnyAuthority(ADMIN, USER)
+.antMatchers("/api/v1/utm-incident-jobs").hasAuthority(ADMIN)
+.antMatchers("/api/v1/utm-incident-jobs/**").hasAuthority(ADMIN)
+.antMatchers("/api/v1/utm-incident-variables/**").hasAuthority(ADMIN)
+.antMatchers(HttpMethod.GET, "/api/v1/utm-incident-variables").hasAnyAuthority()
+// --- denyAll block — /api/v1/custom-reports adjacent to /api/custom-reports ---
+.antMatchers("/api/custom-reports/**").denyAll()            // ← EXISTING (kept verbatim)
+.antMatchers("/api/v1/custom-reports/**").denyAll()         // ← NEW, adjacent
+// --- catch-all for all remaining /api/v1/** paths ---
+.antMatchers("/api/v1/**").hasAnyAuthority(ADMIN, USER)
 .antMatchers("/api/**").hasAnyAuthority(ADMIN, USER)
```

**Notes on ordering:**
- The `/api/v1/**` catch-all must appear **before** the `/api/**` catch-all. Spring Security
  evaluates `antMatchers` in declaration order; a catch-all earlier in the chain would shadow it.
- `/api/v1/authenticateFederationServiceManager` is intentionally **omitted** per Requirement 11.5
  until a dedicated security review approves it.
- The `denyAll` pair is placed together so a code reviewer scanning the file can see both in one
  glance — this satisfies Requirement 8.3.

### 5. CORS `exposedHeaders` change

**File:** `backend/src/main/resources/config/application-dev.yml` and `application-prod.yml`
**Change:** Extend `exposed-headers` only — no other CORS setting is touched

Current value in both files:
```yaml
exposed-headers: 'Authorization,Link,X-Total-Count,X-UtmStack-alert,X-UtmStack-error,X-UtmStack-params'
```

New value (same in both files — diff is identical):
```yaml
exposed-headers: 'Authorization,Link,X-Total-Count,X-UtmStack-alert,X-UtmStack-error,X-UtmStack-params,Deprecation,Sunset'
```

`Link` is already exposed (it is used by pagination). `Deprecation` and `Sunset` are appended.

`WebConfigurer.corsFilter()` also registers CORS for `/api/**` only. Since `/api/v1/**` is under
`/api/**` lexically, the existing `source.registerCorsConfiguration("/api/**", config)` call
already covers versioned paths. No change to `WebConfigurer.java` is needed.

---

## Data Models

There are no new database tables, columns, or Liquibase changesets for this feature. All state
is held in source code and documentation:

| State | Location | Type |
|---|---|---|
| Deprecation schedule | `DeprecationRegistry.java` constructor | Java `Map` literal (source code) |
| Deprecation inventory (human-readable) | `docs/baseline/03-backend-api-inventory.md` | Markdown table |
| Migration order and phase assignments | This design document | Section: Frontend migration |
| Per-endpoint deprecation dates | `DeprecationRegistry.java` and `03-backend-api-inventory.md` | Both updated simultaneously |

**Why no database state?** Requirement 10.4 is explicit: "THE Version_Adapter SHALL not write any
versioning state to the PostgreSQL database." Rollback safety requires that a `docker service
update --image <previous-tag> backend` restores the previous behavior with no DB cleanup step.
An in-memory map in source code satisfies both requirements simultaneously.

---

## Frontend Migration Sequencing

Migration proceeds **one Angular feature module at a time**. Each module migration is a separate
PR. The migration order is lowest-impact first, highest-risk last.

### `SERVER_API_URL` pattern

The Angular `AuthInterceptor` (`frontend/src/app/blocks/interceptor/auth.interceptor.ts`) attaches
the `Authorization: Bearer` header to any request whose URL starts with `SERVER_API_URL`. Because
`SERVER_API_URL` evaluates to the base URL (e.g. `http://localhost:8080`), any service file that
constructs its URL as:

```typescript
return this.http.get<T>(`${SERVER_API_URL}api/utm-alerts`);
```

is migrated to:

```typescript
return this.http.get<T>(`${SERVER_API_URL}api/v1/utm-alerts`);
```

The interceptor will automatically attach the JWT. No change to `AuthInterceptor` is needed for
this feature. The `AuthExpiredInterceptor` already handles all URLs — no path-specific logic.

### Migration order (one PR per module)

| Phase | Module | Service files | Angular module directory | Risk |
|---|---|---|---|---|
| 1a | System configuration | `utm-configuration-parameter.service.ts`, `utm-configuration-section.service.ts` | `admin/` | Low |
| 1b | Application modules | `utm-modules.service.ts`, `utm-module-groups.service.ts` | `app-module/` | Low |
| 1c | Dashboards | `utm-dashboard.service.ts`, `utm-visualization.service.ts` | `graphic-builder/` | Low |
| 1d | Getting started | `getting-started.service.ts` | `getting-started/` | Low |
| 2a | Alerts (read-only GETs) | `utm-alert.service.ts` (GET only) | `data-management/` | Medium |
| 2b | Incidents | `utm-incident.service.ts`, `utm-incident-history.service.ts` | `incident/` | Medium |
| 2c | Compliance | `utm-compliance-*.service.ts` | `compliance/` | Medium |
| 2d | Correlation rules | `utm-correlation-rules.service.ts` | `rule-management/` | Medium |
| 2e | Log search | `elasticsearch.service.ts` (search POST) | `log-analyzer/` | Medium-High |
| 3a | Alert writes (status, tags) | `utm-alert.service.ts` (PUT/POST) | `data-management/` | High |
| 3b | SOAR | `utm-alert-response-rules.service.ts`, `utm-incident-jobs.service.ts` | `incident-response/` | High |
| 3c | Auth endpoints | `auth-jwt.service.ts` | `core/auth/` | High — last |

**Auth endpoints (phase 3c) special rule:** `/api/authenticate`, `/api/tfa/verify-code`,
`/api/tfa/refresh` are migrated **only after** the Dual_Routing_Period for those endpoints has
been confirmed complete (≥ 2 releases with both URLs active and tested). Per Requirement 3.5,
these Legacy_URLs must never be removed during an active Dual_Routing_Period.

### Per-module migration pattern

For each module migration PR:
1. Update every `api/<resource>` path to `api/v1/<resource>` in the module's service files
2. Add an Angular spec test (`*.spec.ts`) that mocks the HTTP response and asserts the new URL
3. Verify the module renders correctly in the local dev stack with the dual-routing backend
4. Open the PR with the checklist from the High-Risk Endpoint section (if applicable)

### Deprecation console warning

A new `DeprecationInterceptor` is added in the frontend alongside the existing interceptors in
`frontend/src/app/blocks/interceptor/`. It reads the `Deprecation` response header and calls
`console.warn` with the URL and `Sunset` date. This gives Frontend developers who call legacy
URLs a browser-visible signal.

```typescript
// frontend/src/app/blocks/interceptor/deprecation.interceptor.ts
@Injectable()
export class DeprecationInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          const dep = event.headers.get('Deprecation');
          const sunset = event.headers.get('Sunset');
          if (dep === 'true') {
            console.warn(
              `[UTMStack] Deprecated API called: ${req.url}. ` +
              `Scheduled removal: ${sunset}. Migrate to the /api/v1/ equivalent.`
            );
          }
        }
      })
    );
  }
}
```

This interceptor is registered in `AppModule`'s `HTTP_INTERCEPTORS` provider array, after
`AuthExpiredInterceptor`.

---

## Migration Phases with Release Schedule

### Phase 0 — Test foundation + infrastructure (Release `v11.x.0`)

No endpoint is deprecated yet. No `Deprecation` header is emitted. This phase ships the
infrastructure required before any versioned endpoint can be tested.

**Deliverables:**
- `mkdir -p backend/src/test/java/com/park/utmstack/` (DEBT-01 resolved)
- `AbstractApiVersioningTest.java` base test class (see Testing Strategy)
- `VersioningConfiguration.java` (empty inner controller stubs for Phase 1 endpoints)
- `DeprecationRegistry.java` (empty map at startup)
- `DeprecationHeaderFilter.java`
- `SecurityConfiguration.java` — append `/api/v1/**` rules (no deprecated paths yet)
- `application-dev.yml` and `application-prod.yml` — extended `exposed-headers`
- `.github/workflows/pr-checks.yml` — add `cd backend && mvn -s settings.xml test` step
- `DeprecationInterceptor.ts` in frontend

**Dual-routing period:** Not yet started. All `/api/v1/**` paths registered return the same
response as their legacy counterpart, but no legacy paths carry deprecation headers yet.

### Phase 1 — Low-risk read-only endpoints (Release `v11.x.1`)

Deprecation headers begin on the Phase 1 endpoint group. The `Sunset` date is set to
**at least two release cycles** from `v11.x.1`. The `DeprecationRegistry` map gains its
first entries.

**Endpoint groups deprecated (legacy path → versioned path):**
- `/api/utm-configuration-parameters` → `/api/v1/utm-configuration-parameters`
- `/api/utm-configuration-sections` → `/api/v1/utm-configuration-sections`
- `/api/utm-modules` → `/api/v1/utm-modules`
- `/api/utm-module-groups` → `/api/v1/utm-module-groups`
- `/api/utm-dashboards` → `/api/v1/utm-dashboards`
- `/api/utm-visualizations` → `/api/v1/utm-visualizations`
- `/api/utm-dashboard-visualizations` → `/api/v1/utm-dashboard-visualizations`
- `/api/getting-started` → `/api/v1/getting-started`

**Frontend migration:** Phase 1a–1d modules (admin, app-module, graphic-builder, getting-started)

### Phase 2 — Medium-risk write endpoints (Release `v11.x.2`)

**Endpoint groups deprecated:**
- `/api/utm-alerts` (GET) → `/api/v1/utm-alerts`
- `/api/utm-incidents` → `/api/v1/utm-incidents`
- `/api/utm-incident-alerts` → `/api/v1/utm-incident-alerts`
- `/api/utm-incident-history` → `/api/v1/utm-incident-history`
- `/api/utm-compliance-*` → `/api/v1/utm-compliance-*`
- `/api/utm-correlation-rules` → `/api/v1/utm-correlation-rules`

**Frontend migration:** Phase 2a–2d modules

### Phase 3 — High-risk endpoints (Release `v11.x.3` or later)

High-risk endpoints are migrated only after Phases 1 and 2 have operated in production for at
least one full release cycle with zero regression reports.

**Endpoint groups deprecated (per Requirement 11 catalog):**
- `PUT /api/utm-alerts` (status writes) → `/api/v1/utm-alerts`
- `POST /api/elasticsearch/search` → `/api/v1/elasticsearch/search`
- `GET/POST /api/utm-alert-response-rules` → `/api/v1/utm-alert-response-rules`
- `POST /api/utm-incident-jobs` → `/api/v1/utm-incident-jobs`
- Auth endpoints (`/api/authenticate`, `/api/tfa/**`, `/api/enrollment/**`) — migrated last,
  after their dedicated dual-routing confirmation release

**Frontend migration:** Phase 2e, 3a–3c modules

### Dual-routing period definition

A Legacy_URL's dual-routing period begins in the release where it first receives a
`Deprecation` header and ends no earlier than **two releases after that**. The `Sunset` date
in the header encodes the planned removal date, which is the release after the dual-routing
period ends (a third release), giving an extra buffer.

Example timeline for a Phase 1 endpoint:
```
v11.x.1  — Deprecation header added; Sunset = "Sat, 31 Dec 2026 00:00:00 GMT"
v11.x.2  — Both URLs active; external callers migrate
v11.x.3  — Both URLs still active (minimum 2-release window honored)
v11.x.4  — Legacy URL removed; /api/<resource> returns 410 Gone for one release
v11.x.5  — 410 handler removed; path no longer responds
```

The `410 Gone` response is implemented as a static `ResponseEntity.status(410)` handler
registered in `VersioningConfiguration` for the removed path, with a JSON body:

```json
{ "message": "This endpoint has been removed. Please use /api/v1/<resource>.",
  "successorUrl": "/api/v1/<resource>" }
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is well-suited for property-based testing because:
- The versioning infrastructure applies uniform rules across a large, enumerable input space
  (the set of all migrated endpoint paths)
- Properties like "both URLs return the same status code" naturally quantify over arbitrary
  valid inputs (JWT tokens, request bodies, pagination parameters)
- The mocked service layer makes 100 iterations fast and deterministic

The PBT library is **`jqwik` 1.8.x** — JUnit 5 compatible, no extra test runner needed.

---

### Property 1: URL Symmetry

*For any* migrated endpoint path `r`, HTTP method `m`, and valid JWT token `t`, a request to the
Legacy_URL `/api/{r}` and an equivalent request to the Versioned_URL `/api/v1/{r}` must return
the same HTTP status code and the same response body schema (field names and types, not values).

**Validates: Requirements 1.1, 1.2, 2.1, 3.1, 3.2, 9.2**

---

### Property 2: Deprecation Header Idempotence

*For any* deprecated Legacy_URL `u` and any number `n ≥ 1` of requests, every response from
`u` must carry `Deprecation: true`, a stable `Sunset` date value, and a `Link` header pointing
to the successor URL. The header values must be identical across all `n` calls.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 3: Security Constraint Preservation

*For any* migrated endpoint path `r`, a request carrying a `ROLE_USER`-scoped JWT must receive
the same HTTP status code (200 or 403) from `/api/{r}` and from `/api/v1/{r}`. The same holds
for `ROLE_ADMIN`-scoped tokens.

**Validates: Requirements 2.6, 8.2, 8.4, 8.5, 8.6**

---

### Property 4: Pagination Contract Invariant

*For any* paginated endpoint path `r`, and any `page ≥ 0`, `size ∈ [1..200]`, `sort` string,
the `X-Total-Count` response header value and the body array length returned by `/api/{r}` must
equal those returned by `/api/v1/{r}` for the same query parameters.

**Validates: Requirements 1.4, 1.6, 9.5**

---

### Property 5: Error Envelope Format Invariant

*For any* endpoint path `r` and any invalid request body `b` (missing required field, wrong
type, or null where not permitted), both `/api/{r}` and `/api/v1/{r}` must return a response
with `Content-Type: application/problem+json` containing `title`, `status`, and `detail` fields
per RFC 7807.

**Validates: Requirements 1.5, 9.6, 11.3**

---

### Property 6: No Versioned-URL Deprecation Headers

*For any* Versioned_URL path `/api/v1/{r}` with an active registration, a valid authenticated
request must return a response where the `Deprecation` header is absent and the `Sunset` header
is absent.

**Validates: Requirements 4.4, 9.4**

---

### Property 7: Unauthenticated Access Uniformity

*For any* endpoint path `r` that requires authentication, a request with no credentials (no
`Authorization` header, no `Utm-Internal-Key`, no API key) must return HTTP 401 from both
`/api/{r}` and `/api/v1/{r}`, regardless of the request body or query parameters.

**Validates: Requirements 1.3, 2.5, 9.3**

---

## Error Handling

### Routing errors

| Scenario | Behavior |
|---|---|
| Request to `/api/v0/**` or any unregistered version prefix | Spring MVC `DispatcherServlet` returns `404 Not Found` automatically — no handler registered, no explicit code needed |
| Request to `/api/v1/custom-reports/**` | Returns `403 Forbidden` (denyAll in SecurityConfiguration) |
| Request to removed legacy path (post dual-routing period) | Returns `410 Gone` with JSON body pointing to versioned URL (registered as a static handler in `VersioningConfiguration`) |
| Request to `/api/v1/authenticateFederationServiceManager` | Returns `404 Not Found` — not registered in `VersioningConfiguration` until security review approves |

### Filter errors

`DeprecationHeaderFilter` wraps `chain.doFilter(request, response)`. If the underlying chain
throws, the exception propagates normally to Spring's `DefaultHandlerExceptionResolver`. The
filter does not swallow exceptions.

If `DeprecationRegistry.lookup()` throws (should never happen given it reads an immutable map),
the filter logs the error at `WARN` level and continues the chain without setting headers — a
degraded-graceful approach where callers lose deprecation signal but don't get a 500.

### Service layer delegation errors

Because `VersioningConfiguration`'s inner controllers call the exact same service methods as
the legacy controllers, error handling is identical. Zalando `ProblemHandling` (`@ControllerAdvice`
in the `web/rest/errors/` package) catches unhandled exceptions from both legacy and versioned
handlers and returns `application/problem+json`. No changes to error handling are required.

---

## Testing Strategy

### Directory structure (Phase 0 — to be created)

```
backend/src/test/java/com/park/utmstack/
├── AbstractApiVersioningTest.java          ← shared MockMvc setup + JWT helpers
├── versioning/
│   ├── UrlSymmetryPropertyTest.java        ← Property 1 (jqwik)
│   ├── DeprecationHeaderPropertyTest.java  ← Properties 2 & 6 (jqwik)
│   ├── SecurityConstraintPropertyTest.java ← Property 3 (jqwik)
│   ├── PaginationPropertyTest.java         ← Property 4 (jqwik)
│   ├── ErrorEnvelopePropertyTest.java      ← Property 5 (jqwik)
│   ├── UnauthenticatedAccessPropertyTest.java ← Property 7 (jqwik)
│   ├── ContractExampleTest.java            ← Example-based contract tests
│   └── SecurityNegativeTest.java           ← denyAll, 410 Gone examples
└── [future test packages mirroring src/main/java structure]
```

### `AbstractApiVersioningTest.java` — base class

```java
package com.park.utmstack;

import com.park.utmstack.security.jwt.TokenProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

@SpringBootTest
@AutoConfigureMockMvc
public abstract class AbstractApiVersioningTest {

    @Autowired protected MockMvc mockMvc;
    @Autowired protected TokenProvider tokenProvider;

    protected String adminJwt() {
        return tokenProvider.createToken(
            new UsernamePasswordAuthenticationToken("admin", null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))),
            false, true);
    }

    protected String userJwt() {
        return tokenProvider.createToken(
            new UsernamePasswordAuthenticationToken("user", null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))),
            false, true);
    }
}
```

### Property test pattern (jqwik)

Each property test uses `@Property(tries = 100)` and generates inputs via `@ForAll` arbitraries.
Service-layer beans are mocked with `@MockBean` to return deterministic responses.

```java
// Feature: api-versioning-compatibility, Property 1: URL Symmetry
@Property(tries = 100)
void urlSymmetry_sameStatusCode(@ForAll("migratedGetPaths") String path,
                                @ForAll @StringLength(min = 1) String jwtSuffix) throws Exception {
    // jwtSuffix is used to parameterize token creation — all tokens are valid admin tokens
    String jwt = adminJwt();

    MvcResult legacy = mockMvc.perform(get("/api/" + path)
            .header("Authorization", "Bearer " + jwt))
        .andReturn();

    MvcResult versioned = mockMvc.perform(get("/api/v1/" + path)
            .header("Authorization", "Bearer " + jwt))
        .andReturn();

    assertThat(versioned.getResponse().getStatus())
        .isEqualTo(legacy.getResponse().getStatus());
}

@Provide
Arbitrary<String> migratedGetPaths() {
    return Arbitraries.of(
        "utm-configuration-parameters",
        "utm-modules",
        "utm-dashboards",
        // ... full Phase 1 + Phase 2 list populated as phases ship
    );
}
```

Tag format for all property tests:
```java
// Feature: api-versioning-compatibility, Property N: <property title>
```

### Contract (example-based) tests

`ContractExampleTest.java` covers the non-PBT cases:
- `GET /api/v0/utm-alerts` → 404
- `GET /api/v1/custom-reports/anything` (with ADMIN JWT) → 403
- `GET /api/utm-alerts` (deprecated, with registration active) → response contains
  `Deprecation: true`, `Sunset: ...`, `Link: ... rel="successor-version"`
- `GET /api/v1/utm-alerts` → response does NOT contain `Deprecation` header
- `POST /api/authenticate` (no JWT needed) → 200 during dual-routing period

### CI integration (`pr-checks.yml` addition)

```yaml
# Add to .github/workflows/pr-checks.yml
- name: Run backend tests
  run: cd backend && mvn -s settings.xml test
  env:
    MAVEN_TK: ${{ secrets.MAVEN_TK }}
```

This step is added in Phase 0 and becomes a required gate for all subsequent PRs.

### PBT library dependency additions to `pom.xml`

```xml
<!-- Add to <dependencies> in backend/pom.xml (test scope) -->
<dependency>
    <groupId>net.jqwik</groupId>
    <artifactId>jqwik</artifactId>
    <version>1.8.5</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Frontend property tests (Angular / Karma + Jasmine)

Two additional behavioral properties are tested at the frontend level in the interceptor spec
files:

**FP1 — AuthInterceptor attaches Bearer to `/api/v1/**` requests**
In `auth.interceptor.spec.ts`: for a randomized sample of `/api/v1/<resource>` URL strings with
a mock token in sessionStorage, assert that the outgoing `HttpRequest` carries
`Authorization: Bearer <token>`.

**FP2 — AuthExpiredInterceptor triggers logout on 401/403 from `/api/v1/**`**
In `auth-expired.interceptor.spec.ts`: mock HTTP responses with 401 and 403 status codes for
`/api/v1/` URLs, assert that the logout service is called and stored tokens are cleared.

Both specs use `HttpClientTestingModule` + `TestBed.configureTestingModule` per the conventions
in `testing.md`.

### Rollback acceptance test (Property 8 — manual)

Property 8 (Rollback Idempotence) cannot be unit-tested; it is validated manually:

1. Deploy versioned image on local Docker Swarm
2. Confirm `GET /api/utm-configuration-parameters` returns `Deprecation: true`
3. Run `docker service update --image <previous-tag> backend`
4. Confirm `GET /api/utm-configuration-parameters` returns `200` with no `Deprecation` header
5. Confirm `GET /api/v1/utm-configuration-parameters` returns `404`
6. Record result in the Phase 0 PR description

This test must pass before Phase 0 merges.

---

## Rollback Design

### Mechanism

The only rollback mechanism is Docker image swap:

```bash
docker service update --image ghcr.io/utmstack/utmstack/backend:<previous-tag> backend
```

Docker Swarm will drain the old task, start a new task with the previous image, and route
traffic within ~30 seconds for a single-replica service. The SLA from Requirement 10.5 is
"under 5 minutes" — this is met by the Swarm rolling update even on constrained hardware.

### Why no DB migrations means rollback is safe

All versioning state lives in:
- Java source code (`VersioningConfiguration.java`, `DeprecationRegistry.java`) — reverted
  by image swap
- YAML configuration (`application.yml` `exposed-headers`) — reverted by image swap
- `SecurityConfiguration.java` new `antMatchers` rules — reverted by image swap
- Documentation (`03-backend-api-inventory.md`) — not rolled back (documentation is kept for
  audit purposes; it does not affect runtime behavior)

Since no Liquibase changesets are added, there is no schema state that lags behind the code.
The rollback is a pure binary swap with no DB cleanup step.

### What rollback restores

After rollback to the pre-versioning image:
- All `/api/v1/**` paths return `404 Not Found` (no Spring handler registered)
- All `/api/**` paths return their original responses with no `Deprecation` headers
- The `DeprecationHeaderFilter` is gone (not in the old image)
- Active frontend sessions are unaffected because the JWT signing key rotates on restart —
  **but this is a pre-existing behavior** (DEBT-14), not introduced by this feature

### `410 Gone` implementation

When a Legacy_URL is removed (post dual-routing period), a static handler is registered in
`VersioningConfiguration` rather than deleting the `antMatchers` rule immediately:

```java
@GetMapping("/api/utm-old-resource")
@PostMapping("/api/utm-old-resource")
ResponseEntity<Map<String, String>> oldResourceGone() {
    return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
        "message", "This endpoint has been removed. Please use the versioned URL.",
        "successorUrl", "/api/v1/utm-old-resource"
    ));
}
```

This handler lives in `VersioningConfiguration` for exactly one release cycle, then is removed.
The `SecurityConfiguration` `antMatchers` rule for that path is also kept for that extra release
(otherwise the request would be blocked before reaching the 410 handler).

---

## High-Risk Endpoint Migration Checklist

Per Requirement 11, the following endpoints require a sign-off gate before their Phase 3
migration PR merges. Each checklist is a required section in the PR description.

### `POST /api/authenticate` / `POST /api/v1/authenticate`

- [ ] `LoginResponseDTO` field names (`token`, `method`, `success`, `tfaConfigured`,
  `forceTfa`, `tfaExpiresInSeconds`, `firstLogin`) are identical in legacy and versioned response
- [ ] HTTP status is `200 OK` in both happy-path cases (TFA enabled and disabled)
- [ ] TFA flow: frontend session is not broken after migration (test in dev environment with TFA enabled)
- [ ] `utmauth` cookie name unchanged
- [ ] `SESSION_AUTH_TOKEN` localStorage key unchanged
- [ ] Contract test covers: login success, wrong password (`401`), TFA-required response shape
- [ ] Security reviewer sign-off (Kbayero or osmontero)

### `POST /api/tfa/verify-code` / `POST /api/v1/tfa/verify-code`

- [ ] `id_token` field present and identical in both responses
- [ ] `authenticated` boolean field present and identical
- [ ] `401` vs `403` semantics preserved (invalid code → `401`, wrong role → `403`)
- [ ] `PRE_VERIFICATION_USER` scoping confirmed in `SecurityConfiguration` entry
- [ ] Dual-routing period confirmed complete before auth migrated
- [ ] Security reviewer sign-off

### `PUT /api/utm-alerts` (status writes) / `PUT /api/v1/utm-alerts`

- [ ] Alert status integer values `1`–`5` (per `AlertStatus` enum) are not remapped in the v1 handler
- [ ] `@AuditEvent` annotation present on v1 handler (writes to `utm_alert_log`)
- [ ] `addFalsePositiveTag` conditional logic preserved identically
- [ ] `updateStatusAndTag` vs `updateStatus` branching is identical to legacy handler
- [ ] Contract test covers: status update to each of `1`–`5`, invalid status → `400`

### `POST /api/elasticsearch/search` / `POST /api/v1/elasticsearch/search`

- [ ] Raw OpenSearch DSL passthrough is unchanged — no field name transformation applied
- [ ] `SearchUtil` DSL builders used — no string concatenation with user input
- [ ] Response field names used by frontend log search (`log-analyzer`) are unaltered
- [ ] Contract test covers: valid DSL body → `200`, malformed DSL → `400`

### `GET/POST /api/utm-alert-response-rules` / `GET/POST /api/v1/utm-alert-response-rules`

- [ ] `UtmAlertResponseRuleService` 30-second scheduler reads rules from DB (not from request);
  the versioned endpoint only affects the REST CRUD layer, not the scheduler
- [ ] Rule evaluation loop is not triggered by the migration
- [ ] SOAR: gRPC dispatch path is unchanged (not called from the REST handler)
- [ ] Contract test covers: rule creation, rule retrieval, invalid body → `400`

### `POST /api/utm-incident-jobs` / `POST /api/v1/utm-incident-jobs`

- [ ] `ROLE_ADMIN` constraint confirmed in new `antMatchers` entry — not accidentally downgraded
- [ ] Job trigger idempotency preserved (service-layer behavior unchanged)
- [ ] gRPC command dispatch path not modified
- [ ] Contract test covers: ADMIN token → job triggered; USER token → `403`

### Immutable contracts checklist (all high-risk PRs)

The following items are verified as unchanged in every Phase 3 PR:

- [ ] `utmauth` cookie name (`COOKIE_AUTH_TOKEN = 'utmauth'` in `app.constants.ts`)
- [ ] `SESSION_AUTH_TOKEN` localStorage key pattern
- [ ] `ACCESS_KEY = 'Utm-Internal-Key'` header constant
- [ ] `INTERNAL_KEY` and `REPLACE_KEY` environment variables (not referenced in versioning code)
- [ ] OpenSearch index pattern `v11-<type>-YYYY.MM.DD` (no queries modified)
- [ ] Alert status integers `1`–`5` and severity strings `Low`, `Medium`, `High`
- [ ] All Liquibase changesets (zero new files for this feature)

---

## File and Package Impact Map

Files are grouped by phase. Files marked ⚠️ require an additional reviewer (security or senior
engineer) before merge.

### Phase 0 — Infrastructure (all new unless marked MODIFIED)

| File | Action | Notes |
|---|---|---|
| `backend/src/main/java/com/park/utmstack/config/versioning/VersioningConfiguration.java` | CREATE | New `@Configuration` class; inner `@RestController` stubs only |
| `backend/src/main/java/com/park/utmstack/config/versioning/DeprecationRegistry.java` | CREATE | Singleton component; empty registry at startup |
| `backend/src/main/java/com/park/utmstack/config/versioning/DeprecationHeaderFilter.java` | CREATE | `OncePerRequestFilter` |
| `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java` ⚠️ | MODIFY | Append `/api/v1/**` antMatchers rules only — no deletions |
| `backend/src/main/resources/config/application-dev.yml` | MODIFY | Append `Deprecation,Sunset` to `exposed-headers` |
| `backend/src/main/resources/config/application-prod.yml` | MODIFY | Same — append `Deprecation,Sunset` to `exposed-headers` |
| `backend/src/test/java/com/park/utmstack/AbstractApiVersioningTest.java` | CREATE | Base test class; establishes `src/test/` directory |
| `backend/src/test/java/com/park/utmstack/versioning/UrlSymmetryPropertyTest.java` | CREATE | Property 1 |
| `backend/src/test/java/com/park/utmstack/versioning/DeprecationHeaderPropertyTest.java` | CREATE | Properties 2 & 6 |
| `backend/src/test/java/com/park/utmstack/versioning/SecurityConstraintPropertyTest.java` | CREATE | Property 3 |
| `backend/src/test/java/com/park/utmstack/versioning/PaginationPropertyTest.java` | CREATE | Property 4 |
| `backend/src/test/java/com/park/utmstack/versioning/ErrorEnvelopePropertyTest.java` | CREATE | Property 5 |
| `backend/src/test/java/com/park/utmstack/versioning/UnauthenticatedAccessPropertyTest.java` | CREATE | Property 7 |
| `backend/src/test/java/com/park/utmstack/versioning/ContractExampleTest.java` | CREATE | Example-based tests |
| `backend/src/test/java/com/park/utmstack/versioning/SecurityNegativeTest.java` | CREATE | denyAll, 410 Gone examples |
| `backend/pom.xml` | MODIFY | Add `jqwik` + `spring-boot-starter-test` test-scoped deps |
| `.github/workflows/pr-checks.yml` | MODIFY | Add `cd backend && mvn -s settings.xml test` step |
| `frontend/src/app/blocks/interceptor/deprecation.interceptor.ts` | CREATE | Console-warn on Deprecation header |
| `frontend/src/app/app.module.ts` | MODIFY | Register `DeprecationInterceptor` in `HTTP_INTERCEPTORS` |
| `docs/baseline/03-backend-api-inventory.md` | MODIFY | Add versioning column to endpoint tables |

### Phase 1 (one PR per endpoint group)

| File | Action | Notes |
|---|---|---|
| `backend/src/main/java/com/park/utmstack/config/versioning/VersioningConfiguration.java` | MODIFY | Add Phase 1 inner controller implementations |
| `backend/src/main/java/com/park/utmstack/config/versioning/DeprecationRegistry.java` | MODIFY | Populate registry map entries for Phase 1 paths |
| `frontend/src/app/admin/*.service.ts` | MODIFY | Update URLs: `api/` → `api/v1/` |
| `frontend/src/app/app-module/*.service.ts` | MODIFY | Update URLs |
| `frontend/src/app/graphic-builder/*.service.ts` | MODIFY | Update URLs |
| `frontend/src/app/getting-started/*.service.ts` | MODIFY | Update URLs |
| `docs/baseline/03-backend-api-inventory.md` | MODIFY | Add deprecation schedule for Phase 1 endpoints |

### Phases 2 and 3 (per-module PRs — same pattern)

Each phase PR touches:
- `VersioningConfiguration.java` — add handlers for the phase's endpoint group
- `DeprecationRegistry.java` — add registry entries for the phase's paths
- Corresponding Angular service files in `frontend/src/app/`
- `03-backend-api-inventory.md` — update deprecation schedule

### Files that must NEVER be touched by this feature

| File | Reason |
|---|---|
| `agent-manager/agent/*.go` | gRPC agent contracts — frozen |
| `agent-manager/agent/interceptor.go` | REPLACE_KEY / agent auth |
| `backend/src/main/java/com/park/utmstack/security/internalApiKey/InternalApiKeyFilter.java` | Utm-Internal-Key contract |
| `backend/src/main/resources/config/liquibase/**` | No changesets for this feature |
| Any `*.pb.go` file | Generated gRPC stubs |
| `frontend/src/app/app.constants.ts` (COOKIE_AUTH_TOKEN, ACCESS_KEY values) | utmauth cookie, Utm-Internal-Key header |

---

*Design complete. The requirements.md correctness properties (Properties 1–8) are directly
addressed: Properties 1–7 are covered by the jqwik property tests above; Property 8
(Rollback Idempotence) is covered by the manual acceptance test procedure documented in the
Testing Strategy section.*
