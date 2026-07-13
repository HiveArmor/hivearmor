# Requirements Document

## Introduction

UTMStack v11 currently exposes all REST endpoints under a single flat `/api/` prefix with no version
segment. Every consumer — the Angular 7 frontend, third-party API key callers, and inter-service calls
using the `Utm-Internal-Key` header — is tightly coupled to this unversioned contract. Any breaking
change to a request or response shape requires a simultaneous, coordinated deployment of every
dependent consumer, with no mechanism for advance notice or a transition window.

This feature introduces a safe, incremental API versioning strategy for UTMStack v11. The strategy
adds a `/api/v1/` URL prefix for all stable, consumer-facing REST endpoints while keeping every
existing `/api/<resource>` URL active and behaviorally identical throughout a mandatory dual-routing
transition window. Deprecated legacy URLs return RFC 8594 `Deprecation` and `Sunset` response headers
so callers can migrate on a documented timeline. The gRPC agent protocol, `INTERNAL_KEY`,
`REPLACE_KEY`, `Utm-Internal-Key`, the `utmauth` cookie, OpenSearch index names, and Liquibase
changesets are explicitly out of scope and must not be altered.

The work also establishes the test foundation required before the first versioned endpoint ships:
`backend/src/test/` does not yet exist, and contract tests covering both the legacy and versioned
URL of every migrated endpoint must be written as part of the same pull request that introduces
the versioning infrastructure.

---

## Glossary

- **API_Router**: The Spring Boot component (`SecurityConfiguration`, `@RequestMapping`) that maps
  incoming HTTP requests to controller handlers.
- **Contract_Test**: A `@SpringBootTest` + `MockMvc` integration test that asserts a specific HTTP
  request to a specific URL returns an expected status code, response body shape, and headers.
- **Deprecation_Header**: The `Deprecation: true` HTTP response header defined in RFC 8594, signalling
  that the target URL is scheduled for removal.
- **Dual_Routing_Period**: The release window during which both `/api/<resource>` (legacy) and
  `/api/v1/<resource>` (versioned) URLs are simultaneously active and return identical responses.
- **External_API_Caller**: Any third party authenticating with an API key via `ApiKeyFilter` and
  calling `/api/` endpoints directly.
- **Frontend**: The Angular 7 single-page application served by nginx. All API calls are constructed
  using the `SERVER_API_URL` constant defined in `frontend/src/app/app.constants.ts`.
- **Legacy_URL**: An existing URL under the `/api/` prefix with no version segment (e.g.
  `/api/utm-alerts`).
- **Release_Cycle**: One tagged production release of UTMStack v11 (e.g. `v11.x.y`).
- **Security_Configuration**: `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java` —
  the single source of truth for all HTTP security rules, role constraints, and public endpoint
  declarations.
- **Sunset_Header**: The `Sunset: <HTTP-date>` response header defined in RFC 8594, stating the date
  after which a deprecated URL will no longer be available.
- **Versioned_URL**: A URL under the `/api/v1/` prefix (e.g. `/api/v1/utm-alerts`).
- **Version_Adapter**: A Spring `@Configuration` class that registers `/api/v1/**` request mappings
  and delegates to the same service layer as the corresponding legacy controllers, with no business
  logic duplication.
- **High_Risk_Endpoint**: An endpoint whose incorrect migration would directly impact authentication,
  alert triage, incident management, or SOAR command execution. Catalog defined in Requirement 11.
- **JHipster_Pagination**: The query-parameter convention (`page`, `size`, `sort`) and response-header
  convention (`X-Total-Count`) inherited from JHipster 7.3.1 scaffolding.
- **Problem_JSON**: The Zalando Problem RFC-7807 error envelope (`application/problem+json`) returned
  by all backend error responses.

---

## Requirements

### Requirement 1: Non-Regression — Legacy URL Preservation

**User Story:** As an External_API_Caller or Frontend user, I want every existing `/api/` URL to
continue working exactly as it does today after the versioning infrastructure is deployed, so that
no integration breaks before I have had time to migrate.

#### Acceptance Criteria

1. THE API_Router SHALL serve every Legacy_URL that exists at deployment time of the versioning
   infrastructure without changing its HTTP method, response body schema, status codes, or
   JHipster_Pagination headers.

2. WHEN a request is made to any Legacy_URL with a valid JWT, THEN THE API_Router SHALL return the
   same HTTP status code and response body structure it returned before the versioning infrastructure
   was introduced.

3. WHEN a request is made to any Legacy_URL without authentication credentials, THEN THE API_Router
   SHALL return `401 Unauthorized` for endpoints that require authentication and `200 OK` for
   endpoints that are public, identical to pre-versioning behavior.

4. THE API_Router SHALL preserve the `X-Total-Count`, `X-UtmStack-alert`, `X-UtmStack-error`, and
   `X-UtmStack-params` response headers on all Legacy_URL responses that currently produce those
   headers.

5. THE API_Router SHALL preserve the `application/problem+json` (Problem_JSON) error envelope for
   all error responses on Legacy_URLs.

6. WHEN the `page`, `size`, or `sort` query parameters are supplied to a Legacy_URL that supports
   JHipster_Pagination, THE API_Router SHALL apply them with identical semantics to pre-versioning
   behavior.

7. THE Security_Configuration SHALL remain the sole authority for all HTTP security rules during
   and after the Dual_Routing_Period; no RBAC rules, `@PreAuthorize` annotations, or role
   constraints SHALL be modified as part of introducing versioning.


---

### Requirement 2: Versioning Strategy — `/api/v1/` URL Prefix

**User Story:** As a Security Engineer or Platform Admin, I want a stable, versioned URL namespace
so that future breaking changes can be introduced without affecting consumers still on the previous
version.

#### Acceptance Criteria

1. THE Version_Adapter SHALL register Versioned_URLs matching the pattern `/api/v1/<resource>` for
   every endpoint group selected for migration, delegating to the same service-layer classes used
   by the corresponding legacy controllers.

2. THE Version_Adapter SHALL not duplicate business logic; all service calls, repository calls, and
   domain transformations SHALL be shared between the legacy controller and the Version_Adapter
   through the existing service layer.

3. WHERE a new breaking-change endpoint is introduced in a future release, THE Version_Adapter SHALL
   register it under `/api/v2/` or higher, leaving `/api/v1/` endpoints unchanged.

4. THE API_Router SHALL reject requests to `/api/v0/` or any version prefix that has not been
   explicitly registered by returning `404 Not Found`; this rejection SHALL occur as a routing
   decision and does not require authentication or role checks to be evaluated first.

5. WHEN a request is received on any `/api/**` or `/api/v1/**` path, THE API_Router SHALL apply
   the full authentication filter chain order (JWT → Internal API Key → External API Key → SAML2)
   regardless of whether the path uses a versioned or unversioned URL prefix.

6. WHEN a new `/api/v1/<resource>` endpoint is added to the Security_Configuration, THE
   Security_Configuration SHALL mirror the exact role constraint (`permitAll`, `ROLE_USER`,
   `ROLE_ADMIN`, or `denyAll`) that applies to the corresponding `/api/<resource>` Legacy_URL.

7. THE Version_Adapter SHALL not expose a `/api/v1/custom-reports/**` path; that path SHALL remain
   `denyAll` at all version prefixes unless a dedicated security review approves it.


---

### Requirement 3: Dual-Routing Period

**User Story:** As an External_API_Caller or Frontend developer, I want both the Legacy_URL and the
Versioned_URL for each migrated endpoint to be simultaneously active and identical in behavior for
at least two Release_Cycles, so that I can migrate my integrations without a forced cutover.

#### Acceptance Criteria

1. WHILE the Dual_Routing_Period is active, THE API_Router SHALL serve both
   `/api/<resource>` and `/api/v1/<resource>` for every endpoint that has been migrated,
   returning identical HTTP status codes, response body schemas, and response headers for
   equivalent requests.

2. WHILE the Dual_Routing_Period is active, THE API_Router SHALL apply the same business logic,
   service calls, and data-layer queries to requests arriving at either the Legacy_URL or the
   Versioned_URL for the same resource.

3. THE Dual_Routing_Period SHALL span a minimum of two consecutive Release_Cycles from the release
   in which a Legacy_URL first receives a Deprecation_Header.

4. WHEN a Legacy_URL is removed after the Dual_Routing_Period ends, THE API_Router SHALL return
   `410 Gone` (not `404 Not Found`) for requests to that URL for one additional Release_Cycle,
   with a response body that includes the Versioned_URL replacement path.

5. THE API_Router SHALL not remove any Legacy_URL that is used by the `POST /api/authenticate`,
   `POST /api/tfa/verify-code`, or `GET /api/enrollment/**` flows during the Dual_Routing_Period,
   because the Angular 7 frontend and active browser sessions depend on these paths directly.


---

### Requirement 4: Deprecation Signaling per RFC 8594

**User Story:** As an External_API_Caller, I want deprecated Legacy_URLs to carry machine-readable
deprecation headers in every response, so that my monitoring tooling can detect and alert on
imminent endpoint removal without manual changelog scanning.

#### Acceptance Criteria

1. WHEN a response is returned from a Legacy_URL that has been superseded by a Versioned_URL, THE
   API_Router SHALL include a `Deprecation: true` response header on that response.

2. WHEN a response is returned from a Legacy_URL that has been superseded by a Versioned_URL, THE
   API_Router SHALL include a `Sunset: <HTTP-date>` response header whose value is the planned
   removal date, formatted as an RFC 7231 HTTP-date string (e.g. `Sat, 31 Dec 2026 00:00:00 GMT`).

3. WHEN a response is returned from a Legacy_URL that has been superseded by a Versioned_URL, THE
   API_Router SHALL include a `Link: <versioned-url>; rel="successor-version"` response header
   pointing to the corresponding Versioned_URL.

4. THE API_Router SHALL not add Deprecation_Header, Sunset_Header, or `Link` successor headers to
   Versioned_URLs or to Legacy_URLs that have not yet been scheduled for deprecation.

5. IF the planned removal date recorded in the Sunset_Header is more than two Release_Cycles in the
   future from the current release, THEN THE API_Router SHALL not remove the corresponding
   Legacy_URL in that release.

6. THE API_Router SHALL expose `Deprecation`, `Sunset`, and `Link` as CORS-accessible response
   headers by adding them to the existing `exposedHeaders` list in the CORS configuration without
   altering any other CORS setting.


---

### Requirement 5: Frontend Migration — Module-by-Module Cutover

**User Story:** As a Frontend developer, I want to migrate the Angular 7 frontend from Legacy_URLs
to Versioned_URLs one feature module at a time, so that the risk surface of each change is bounded
and individually testable without a big-bang deployment.

#### Acceptance Criteria

1. THE Frontend SHALL update `SERVER_API_URL`-relative API call paths to use `/api/v1/` prefixes
   one Angular feature module at a time, in the migration order defined in the design document, not
   in a single commit touching all modules simultaneously.

2. WHEN a Frontend module has been migrated to call Versioned_URLs, THE Frontend SHALL not revert
   to calling any Legacy_URL for the resources owned by that module.

3. THE Frontend SHALL not require changes to `AUTH_TOKEN` storage keys, the `utmauth` cookie name,
   the `Utm-Internal-Key` header name, or the `Authorization: Bearer` header format as part of the
   URL migration.

4. WHEN a Frontend module calls a Versioned_URL that returns a `Deprecation: true` header, THE
   Frontend SHALL log a browser console warning identifying the URL and its Sunset_Header date.

5. THE Frontend AuthInterceptor SHALL attach the `Authorization: Bearer <token>` header to all
   requests to `/api/v1/**` paths using the same logic already applied to `/api/**` paths; this
   requirement is permanent and SHALL remain in force after the full migration is complete and
   regardless of any future refactoring of the AuthInterceptor.

6. THE Frontend AuthExpiredInterceptor SHALL treat `401` and `403` responses from `/api/v1/**`
   paths identically to the same responses from `/api/**` paths, triggering logout and clearing
   stored tokens.

7. WHEN all Frontend modules have been migrated to Versioned_URLs, THE Frontend SHALL have zero
   remaining references to Legacy_URLs in service files, except for the three auth endpoints
   (`/api/authenticate`, `/api/tfa/verify-code`, `/api/tfa/refresh`) which SHALL be migrated only
   after the Dual_Routing_Period for those endpoints is confirmed complete.


---

### Requirement 6: Agent and gRPC Contract Isolation

**User Story:** As a Platform Admin responsible for deployed agents, I want the versioning work to
have zero impact on gRPC protocols, agent authentication, and agent binary behavior, so that no
agent reinstall is required when the backend versioning is deployed.

#### Acceptance Criteria

1. THE Version_Adapter SHALL not modify any gRPC proto definitions, generated `.pb.go` stubs, or
   gRPC service implementations in `agent-manager/`.

2. THE Version_Adapter SHALL not modify the `INTERNAL_KEY` environment variable usage, the
   `Utm-Internal-Key` header name, or the `InternalApiKeyFilter` configuration.

3. THE Version_Adapter SHALL not modify the `REPLACE_KEY` ldflags injection or any agent
   registration or authentication logic in `agent-manager/agent/interceptor.go`.

4. THE Version_Adapter SHALL not modify the gRPC metadata keys (`key`, `id`, `type`) used by
   agents during authentication with `agent-manager`.

5. WHEN the backend is redeployed with the versioning infrastructure active, THE agent SHALL
   continue to communicate with `agent-manager` over gRPC using its existing stored keys without
   any re-registration step.

6. THE Version_Adapter SHALL not add any HTTP REST endpoint under `/api/v1/` that proxies or
   duplicates existing gRPC agent command functionality, because SOAR commands are routed
   exclusively through the gRPC bidirectional stream.


---

### Requirement 7: External API Key Caller Notice Period

**User Story:** As an External_API_Caller authenticating with an API key, I want at least two full
Release_Cycles of advance notice before any Legacy_URL I depend on is removed, so that I have
sufficient time to update my integration without an emergency code change.

#### Acceptance Criteria

1. THE API_Router SHALL not remove any Legacy_URL that is accessible via the `ApiKeyFilter`
   authentication path until at least two Release_Cycles have elapsed since that URL first carried
   a Deprecation_Header and Sunset_Header in production.

2. WHEN a Legacy_URL is first marked for deprecation, THE Sunset_Header value SHALL be set to a
   date that is at least two full Release_Cycle durations in the future from the release date of
   the deprecation.

3. THE API_Router SHALL record the deprecation schedule for every deprecated Legacy_URL in the
   `docs/baseline/03-backend-api-inventory.md` document, including the first-deprecated release
   version and the planned removal release version.

4. IF a Legacy_URL is found to be actively used by an External_API_Caller in the two Release_Cycles
   before its planned removal, THEN THE API_Router SHALL extend the Sunset_Header date by one
   additional Release_Cycle and update the inventory document accordingly.

5. WHEN a Legacy_URL is removed after the notice period, THE Version_Adapter SHALL include a
   migration guide entry in the release changelog identifying the removed URL, the replacement
   Versioned_URL, and the required request/response changes (if any).


---

### Requirement 8: Security Configuration Preservation

**User Story:** As a Platform Admin, I want the security rules, role constraints, and public endpoint
declarations in `SecurityConfiguration.java` to remain unchanged by the versioning work, so that
the RBAC model is not inadvertently altered during an infrastructure change.

#### Acceptance Criteria

1. THE Security_Configuration SHALL preserve every existing `.antMatchers(...)` rule verbatim;
   the versioning work SHALL only append new rules for `/api/v1/**` paths — no existing rules
   shall be modified, reordered, or removed.

2. WHEN a `/api/v1/<resource>` path is added to the Security_Configuration, THE Security_Configuration
   SHALL place its `.antMatchers(...)` rule at the same precedence position as the corresponding
   Legacy_URL rule relative to the catch-all `.antMatchers("/api/**")` rule.

3. THE Security_Configuration SHALL preserve `.antMatchers("/api/custom-reports/**").denyAll()`;
   THE Version_Adapter SHALL add a corresponding `.antMatchers("/api/v1/custom-reports/**").denyAll()`
   rule immediately adjacent to it.

4. THE Security_Configuration SHALL preserve `.antMatchers("/api/utm-incident-jobs").hasAuthority(ADMIN)`
   and the corresponding `/api/utm-incident-jobs/**` rule; THE Version_Adapter SHALL apply identical
   `ROLE_ADMIN` constraints to `/api/v1/utm-incident-jobs` and `/api/v1/utm-incident-jobs/**`.

5. THE Security_Configuration SHALL preserve all `permitAll()` declarations for the public endpoints
   `/api/authenticate`, `/api/ping`, `/api/healthcheck`, `/api/info/version`, `/api/utm-providers`,
   `/api/images/all`, `/api/account/reset-password/**`, `/api/date-format`, and `/api/releaseInfo`;
   the corresponding `/api/v1/` paths SHALL carry identical `permitAll()` declarations when migrated.

6. IF a code review identifies that a versioned endpoint's Security_Configuration entry differs in
   role constraint from its Legacy_URL counterpart, THEN THE pull request SHALL be blocked until
   the discrepancy is resolved.


---

### Requirement 9: Test Strategy and Test Foundation

**User Story:** As a developer or release engineer, I want every migrated endpoint to be covered by
contract tests that assert behavioral identity between the Legacy_URL and the Versioned_URL, so that
regressions introduced during migration are caught before they reach production.

#### Acceptance Criteria

1. THE Test_Suite SHALL create the `backend/src/test/java/com/park/utmstack/` directory and
   establish the Spring Boot test infrastructure (`@SpringBootTest`, `MockMvc`, `MockitoExtension`)
   before any versioned endpoint is shipped, satisfying DEBT-01 from the technical debt register.

2. WHEN a Legacy_URL is given a Deprecation_Header (indicating a corresponding Versioned_URL now
   exists), THE Test_Suite SHALL contain at least one Contract_Test per HTTP method for that
   endpoint that: (a) sends the same request to the Legacy_URL and the Versioned_URL, and (b)
   asserts that both return identical HTTP status codes and response body structures.

3. THE Test_Suite SHALL include a Contract_Test for each migrated endpoint that sends a request
   without authentication credentials and asserts that both the Legacy_URL and the Versioned_URL
   return `401 Unauthorized` (or `200 OK` for public endpoints).

4. THE Test_Suite SHALL include a Contract_Test for the `Deprecation`, `Sunset`, and `Link` headers,
   asserting that (a) the Legacy_URL response contains all three headers and (b) the Versioned_URL
   response contains none of them.

5. THE Test_Suite SHALL include a Contract_Test for each paginated endpoint that asserts the
   `X-Total-Count` response header is present and has the same integer value when the same query
   is sent to both the Legacy_URL and the Versioned_URL.

6. THE Test_Suite SHALL include a Contract_Test that verifies error responses from both the Legacy_URL
   and the Versioned_URL use `Content-Type: application/problem+json` (Problem_JSON format).

7. WHEN a new Liquibase changeset is added as part of the versioning infrastructure, THE Test_Suite
   SHALL run `mvn -s settings.xml liquibase:validate` in the CI pipeline (`pr-checks.yml`) to
   confirm schema consistency.

8. THE pull request that introduces the Version_Adapter infrastructure SHALL update
   `.github/workflows/pr-checks.yml` to execute `cd backend && mvn -s settings.xml test` as a
   required CI check, ensuring the test gate is enforced for all subsequent PRs.


---

### Requirement 10: Rollback Safety

**User Story:** As a Platform Admin, I want the ability to roll back a versioned endpoint to its
previous behavior without requiring a database migration or agent reinstall, so that a buggy
migration can be reverted within one deployment cycle.

#### Acceptance Criteria

1. THE Version_Adapter SHALL be implemented without Liquibase changesets; no new database columns,
   tables, or indexes SHALL be required to activate or deactivate the versioning infrastructure.

2. THE Version_Adapter SHALL be deployable and reversible by Docker image replacement alone:
   `docker service update --image <previous-tag> backend` SHALL restore the previous state with
   no additional operator steps.

3. WHEN a versioned endpoint is rolled back by redeploying the previous Docker image, THE
   API_Router SHALL restore the exact behavior of the Legacy_URL without requiring any agent
   reinstall or gRPC reconnection.

4. THE Version_Adapter SHALL not write any versioning state (endpoint registry, migration status,
   or deprecation schedule) to the PostgreSQL database; all such metadata SHALL be maintained in
   source code and documentation.

5. THE Version_Adapter SHALL guarantee that rollback to the previous Docker image is achievable
   in under 5 minutes whenever a versioned endpoint causes `5xx` responses; this guarantee SHALL
   hold regardless of whether the current deployment mechanism supports easy reversibility, and
   any change to the deployment process that would prevent this rollback capability SHALL be
   rejected until the rollback path is restored.

6. THE Version_Adapter SHALL not alter any OpenSearch index schema, index name, or ISM policy;
   rollback of the versioning work SHALL have zero impact on data stored in OpenSearch.


---

### Requirement 11: High-Risk Endpoint Compatibility Catalog

**User Story:** As a Security Engineer, I want a catalog of the highest-risk endpoints identifying
their specific breaking-change surface, so that migration sequencing can prioritize safety and
reviewers know which endpoints need the most scrutiny.

#### Acceptance Criteria

1. THE compatibility catalog SHALL classify each endpoint in the following groups as High_Risk_Endpoint
   and document the specific breaking-change surface for each:

   | Endpoint group | Breaking-change surface |
   |---|---|
   | `POST /api/authenticate` | `token` / `id_token` field names; `forceTfa`, `method`, `tfaExpiresInSeconds` fields in response body; any status code change from `200` |
   | `POST /api/tfa/verify-code` | `id_token` field name; `authenticated` boolean; `401` vs `403` semantics |
   | `GET /api/enrollment/**` | TFA enrollment flow state; relies on `PRE_VERIFICATION_USER` role scoping |
   | `PUT /api/utm-alerts` | Alert status integer values (`1`–`5`); field rename in request body; audit record side effects |
   | `GET /api/utm-alerts` | JHipster_Pagination contract; OpenSearch field name changes in response |
   | `POST /api/utm-incident-jobs` | `ROLE_ADMIN` constraint; job trigger idempotency; gRPC command dispatch |
   | `POST /api/elasticsearch/search` | Raw OpenSearch DSL passthrough; field name assumptions in frontend log search |
   | `GET/POST /api/utm-alert-response-rules` | SOAR rule evaluation loop side effects; 30-second scheduler contract |

2. THE Version_Adapter SHALL migrate High_Risk_Endpoints last, after all lower-risk endpoint
   groups have been migrated, tested, and operated in production for at least one Release_Cycle.

3. THE Contract_Test for each High_Risk_Endpoint SHALL include a test case that sends a request
   with an invalid or missing required field and asserts that both the Legacy_URL and the Versioned_URL
   return `400 Bad Request` with a Problem_JSON body.

4. THE compatibility catalog SHALL document that the following items are immutable and SHALL NOT
   be altered by the versioning work under any circumstance:
   - The `utmauth` cookie name
   - The `SESSION_AUTH_TOKEN` / `ACCESS_KEY` localStorage key patterns
   - The `Utm-Internal-Key` header name
   - The `INTERNAL_KEY` and `REPLACE_KEY` environment variables
   - The OpenSearch index pattern `v11-<type>-YYYY.MM.DD`
   - Alert status integers `1`–`5` and severity strings `Low`, `Medium`, `High`
   - All Liquibase changesets already merged to the main branch

5. THE Version_Adapter SHALL not route `/api/v1/authenticateFederationServiceManager` until a
   dedicated security review approves it, because this endpoint is used for federation service
   manager authentication and is currently declared `permitAll`.


---

### Requirement 12: Immutable Protocol Contracts

**User Story:** As a Platform Admin, I want a single authoritative list of all contracts that must
not change during the versioning work, so that contributors can quickly determine whether a proposed
change is in or out of scope.

#### Acceptance Criteria

1. THE Version_Adapter SHALL not alter the gRPC proto definitions for `agent.proto`, `ping.proto`,
   or `common.proto` in `agent-manager/`.

2. THE Version_Adapter SHALL not alter the `INTERNAL_KEY` environment variable, the
   `Utm-Internal-Key` header name evaluated by `InternalApiKeyFilter`, or the
   `X-Internal-Key` header evaluated by the EventProcessor HTTP handler.

3. THE Version_Adapter SHALL not alter the `REPLACE_KEY` ldflags value, the agent binary
   compilation process, or the agent SQLite local-state schema.

4. THE Version_Adapter SHALL not alter the `utmauth` cookie name used by `CSRFService` in the
   frontend or by `web-pdf` for authenticated report rendering.

5. THE Version_Adapter SHALL not alter any OpenSearch index name, index pattern, ISM policy, or
   field mapping used by `ElasticsearchService`, `OpensearchClientBuilder`, or the EventProcessor
   `com.utmstack.alerts` plugin.

6. THE Version_Adapter SHALL not alter any Liquibase changeset already present in
   `backend/src/main/resources/config/liquibase/master.xml`.

7. THE Version_Adapter SHALL not alter the WebSocket (`/ws/**`) endpoint paths or the STOMP
   topic structure used for real-time alert notifications in the frontend.

8. THE Version_Adapter SHALL not alter the `/management/**` Actuator endpoint paths, the
   `/v3/api-docs` OpenAPI path, or the `/management/swagger-ui.html` Swagger UI path.


---

## Correctness Properties

These properties are suitable for property-based testing (PBT) using a framework such as
`jqwik` (Java) or `junit-quickcheck`. They focus on behavioral invariants of the versioning
infrastructure that hold across arbitrary valid inputs, not on specific examples. Properties
involving external infrastructure (OpenSearch, PostgreSQL) should use mocks so that 100 iterations
remain fast.

### Property 1: URL Symmetry (Round-Trip / Invariant)

For every migrated endpoint, a request sent to the Legacy_URL and an equivalent request sent to the
Versioned_URL must return the same HTTP status code and response body structure.

**Formal statement:** For all valid JWT tokens `t`, HTTP methods `m ∈ {GET, POST, PUT, DELETE}`,
resource paths `r` in the migrated set, and request bodies `b`:

```
response(Legacy_URL(r), m, t, b).statusCode
  == response(Versioned_URL(r), m, t, b).statusCode

AND

response(Legacy_URL(r), m, t, b).bodySchema
  == response(Versioned_URL(r), m, t, b).bodySchema
```

**Testing guidance:** Use `@Property` with randomly generated valid JWT tokens (from `TokenProvider`)
and randomly drawn resource paths from the migrated endpoint catalog. Mock the service layer to
return deterministic responses. This catches routing misconfigurations where one URL path reaches a
different controller method than its counterpart.

---

### Property 2: Deprecation Header Idempotence (Idempotence)

Calling a deprecated Legacy_URL any number of times must always return the same `Deprecation`,
`Sunset`, and `Link` headers — the headers must not change between calls or be absent on some calls.

**Formal statement:** For all `n ≥ 1` requests to a deprecated Legacy_URL `u`:

```
∀ i ∈ [1..n]: response(u, i).headers["Deprecation"] == "true"
AND ∀ i ∈ [1..n]: response(u, i).headers["Sunset"] == sunset_date(u)
AND ∀ i ∈ [1..n]: response(u, i).headers["Link"] contains successor_url(u)
```

**Testing guidance:** Generate random `n` between 1 and 100; assert header presence and value
stability across all calls. Catches thread-safety issues in the response-header injection filter.

---

### Property 3: Security Constraint Preservation (Invariant)

For every endpoint path `p` in the combined set of Legacy_URLs and Versioned_URLs, the required
authentication role must be identical between the two URL variants.

**Formal statement:** For all paths `r` in the migrated set and role sets `R`:

```
required_role(Legacy_URL(r)) == required_role(Versioned_URL(r))
```

**Testing guidance:** Enumerate all registered `antMatchers` patterns in `SecurityConfiguration`
via reflection or MockMvc; for each Legacy_URL, generate a request with a `ROLE_USER` token and
a `ROLE_ADMIN` token and assert that the Versioned_URL returns the same `200`/`403` outcome.
Catches cases where a new `antMatchers` entry was placed at the wrong precedence level.

---

### Property 4: Pagination Contract Invariant (Invariant)

For every paginated endpoint, the `X-Total-Count` value and page result set returned by the
Legacy_URL must equal those returned by the Versioned_URL for the same `page`, `size`, and `sort`
parameters.

**Formal statement:** For all `page ≥ 0`, `size ∈ [1..200]`, `sort` strings, and resource paths `r`
supporting JHipster_Pagination:

```
response(Legacy_URL(r), page, size, sort).header["X-Total-Count"]
  == response(Versioned_URL(r), page, size, sort).header["X-Total-Count"]

AND

response(Legacy_URL(r), page, size, sort).body.length
  == response(Versioned_URL(r), page, size, sort).body.length
```

**Testing guidance:** Use a mocked service layer returning a deterministic page of items. Randomize
`page` and `size` within valid ranges. Catches routing bugs where only one of the two URL variants
threads `Pageable` parameters through to the service.

---

### Property 5: Error Envelope Format Invariant (Invariant)

For every endpoint, an invalid request (missing required field, wrong type, unauthorized) must
produce a `Content-Type: application/problem+json` response body on both the Legacy_URL and the
Versioned_URL.

**Formal statement:** For all invalid request bodies `b_invalid` and paths `r`:

```
response(Legacy_URL(r), b_invalid).contentType == "application/problem+json"
AND
response(Versioned_URL(r), b_invalid).contentType == "application/problem+json"
```

**Testing guidance:** Generate random malformed request bodies (missing fields, wrong field types,
null required values). Assert `Content-Type` header and that the body contains `title`, `status`,
and `detail` fields per RFC-7807. Catches cases where a new controller method returns a raw string
or an unhandled exception bypasses the Zalando `ProblemHandling` advice.

---

### Property 6: No Versioned-URL Deprecation Headers (Negative Invariant)

Versioned_URLs must never return `Deprecation`, `Sunset`, or `Link` successor-version headers
(unless they are themselves subsequently deprecated in a future `v2` migration).

**Formal statement:** For all paths `r` with an active Versioned_URL:

```
response(Versioned_URL(r)).headers["Deprecation"] == absent
AND response(Versioned_URL(r)).headers["Sunset"] == absent
```

**Testing guidance:** Enumerate all registered `/api/v1/**` paths; for each, make a valid
authenticated request and assert the absence of both headers. Catches filter misconfigurations
where the deprecation filter matches too broadly on `/api/**` rather than only on specific
Legacy_URL patterns.

---

### Property 7: Unauthenticated Access Uniformity (Invariant)

For every endpoint that requires authentication, both the Legacy_URL and the Versioned_URL must
return `401 Unauthorized` when called without credentials, regardless of the request body or
query parameters.

**Formal statement:** For all paths `r` that are not public and all request bodies `b`:

```
response(Legacy_URL(r), no_credentials, b).statusCode == 401
AND
response(Versioned_URL(r), no_credentials, b).statusCode == 401
```

**Testing guidance:** Generate random request bodies and query parameter combinations. This is a
high-value property because a misconfigured `antMatchers` precedence for `/api/v1/**` could
accidentally expose a protected endpoint publicly.

---

### Property 8: Rollback Idempotence (Idempotence)

Deploying the pre-versioning Docker image after the versioning image has been active must restore
Legacy_URL behavior exactly, with no `Deprecation` headers and no `404` responses for any
Legacy_URL that existed before versioning was introduced.

**Formal statement:** For all Legacy_URL paths `r` active before versioning:

```
after_rollback: response(Legacy_URL(r)).statusCode != 404
AND after_rollback: response(Legacy_URL(r)).headers["Deprecation"] == absent
```

**Testing guidance:** This is an integration-level property; validate in a local Docker Swarm
environment using the `docker service update --image <old-tag>` rollback step documented in
`docs/baseline/14-change-readiness-plan.md`. Not suitable for unit-level PBT; document as a
manual acceptance test in the PR checklist.

