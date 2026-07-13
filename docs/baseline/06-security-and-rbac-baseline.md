# 06 — Security and RBAC Baseline

## Authentication Mechanisms

| Mechanism | Used By | Implementation |
|---|---|---|
| JWT (HMAC-SHA512) | Frontend → Backend | `TokenProvider.java`, `JWTFilter.java` |
| SAML2 SSO | Frontend → Backend (via IdP) | Spring Security SAML2, `Saml2LoginSuccessHandler` |
| API Keys | External systems → Backend | `ApiKeyFilter.java`, `utm_api_keys` table |
| Internal API Key | Backend services ↔ EventProcessor | `InternalApiKeyFilter.java`, `INTERNAL_KEY` env var |
| gRPC mTLS + REPLACE_KEY | Agent/Collector → AgentManager | TLS 1.3, ldflags-embedded secret |
| gRPC internal-key | Backend → AgentManager | `INTERNAL_KEY` env var in metadata |
| gRPC connection-key | New agent → AgentManager (register) | Panel connection key validated against backend |

---

## JWT Token Flow

```
1. POST /api/authenticate
   → Returns temp JWT (5 min, role=PRE_VERIFICATION_USER) if TFA enabled
   
2. POST /api/tfa/verify-code (if TFA required)
   → Returns full JWT (24h / 30d if remember-me) with real roles
   
3. All subsequent API calls
   → Authorization: Bearer <JWT> header (injected by AuthInterceptor)
   
4. Token stored in: sessionStorage + localStorage + utmauth cookie
   Key name: <HOSTNAME_UPPERCASE>_AUTH_TOKEN
   
5. On 401/403:
   → AuthExpiredInterceptor forces logout, clears token
```

**JWT Signing Key**: Ephemeral per process instance (generated at startup via `CipherUtil.generateSafeToken()`). **Rotates on every restart** — all sessions invalidated on redeploy.

---

## Role-Based Access Control (RBAC)

### Roles

| Role | Description |
|---|---|
| `ROLE_ADMIN` | Full access including user management, system config, all API endpoints |
| `ROLE_USER` | Read/write to alerts, incidents, dashboards, integrations, SOAR |
| `PRE_VERIFICATION_USER` | Temporary role — TFA pending, can only call TFA verify/enrollment endpoints |

### Frontend Route Guard

`UserRouteAccessService` — checks `AccountService.hasAnyAuthority(route.data.authorities)`.

| Route | Required Role |
|---|---|
| `/management` | ADMIN only |
| `/utm-incident-jobs/**` | ADMIN only |
| All other protected routes | USER or ADMIN |

### Backend Method Security

`@PreAuthorize` and `@Secured` annotations via `@EnableGlobalMethodSecurity(prePostEnabled=true, securedEnabled=true)`.

**Key restrictions**:
- `/api/utm-incident-jobs/**` → `ROLE_ADMIN` (HTTP security layer)
- `/api/custom-reports/**` → `denyAll` (completely blocked)
- System correlation rules → cannot be modified/deleted unless `forcedSystemMode` flag active

### Enterprise Feature Gating

`HasEnterpriseLicenseDirective` and `IsEnterpriseModuleDirective` in the frontend hide UI elements that require enterprise license. `EnterpriseRouteAccessService` gates routes.

---

## Two-Factor Authentication

| Method | Implementation |
|---|---|
| TOTP | `TotpTfaService`, `dev.samstevens.totp` library |
| Email OTP | `EmailTfaService` / `EmailTotpService` |
| Cache | Caffeine in-memory cache (`TfaCacheConfig`) — short TTL |
| Setup | QR code via Google ZXing + `com.warrenstrange:googleauth` |

**Enforcement**: Controlled by `ENV_TFA_ENABLE` environment variable. Defaults to **enabled** if not set. Can be disabled via `APP_TFA_ENABLED=false` (visible in docker-compose).

---

## SAML2 SSO

- Spring Security `saml2Login()` configuration
- IdP metadata fetched from configured URL or uploaded XML
- On SAML2 login success: `Saml2LoginSuccessHandler` issues a UTMStack JWT
- Multiple IdPs supported (stored in `idp_config` table)
- SAML2 metadata endpoint exposed for SP metadata exchange

---

## API Key Security

- API keys stored as **hash** in `utm_api_keys.key_hash`; raw value shown only at creation
- Authenticated via `ApiKeyFilter` — custom filter chain
- Usage logged via `ApiKeyUsageLoggingService`
- Admin-only management via `/api/utm-api-keys`

---

## Agent Authentication Security

### REPLACE_KEY (Build-time Secret)
- Injected via Go ldflags at compile time
- Embedded into the agent/collector binary
- Used as the shared secret for initial connection authentication
- **Risk**: Secret embedded in binary — extractable via reverse engineering. Mitigated by binary signing.

### Agent Registration Flow
1. New agent calls `RegisterAgent` using `connection-key` (Panel connection key)
2. Agent-manager validates the connection key against the backend (`/api/authenticateFederationServiceManager`)
3. On success, agent-manager generates UUID key pair, stores in PostgreSQL + memory cache
4. Agent stores received key locally (SQLite)
5. Subsequent calls use `key/id/type` metadata headers
6. `subtle.ConstantTimeCompare` used for key comparison (timing-safe)

---

## Input Validation Concerns

**Observed risks** (not verified as exploitable, for investigation):
1. **Password in query param**: `GET /api/check-credentials?password=<encoded>&checkUUID=<uuid>` — password in URL will appear in server access logs
2. **CORS `allowed-origins: '*'`** in both dev and prod configs — broad exposure
3. **gRPC InsecureTrustManagerFactory**: Backend→AgentManager gRPC uses no cert verification (`InsecureTrustManagerFactory`) — MITM risk within the Docker network
4. **SOC AI TrustAll TLS**: `SocAIService` uses OkHttp with trust-all SSL client — MITM risk
5. **No rate limiting**: Beyond login attempt tracking (fail2ban-style), no global API rate limiting observed
6. **File upload**: `UtmFileUploadComponent` exists — file type validation relies on `tika-core` (server-side), but client-side validation only visible in UI
7. **Web-PDF Selenium**: Headless Chrome accepts user-provided URL — potential SSRF if URL is user-controlled

---

## Audit Logging

| Component | What is Logged | Where |
|---|---|---|
| Backend Spring Audit | All JPA persistence events via `@EntityListeners(AuditingEntityListener)` | `jhi_persistent_audit_event` |
| Alert state changes | All alert status/tag changes with user | `utm_alert_log` |
| Incident history | All incident state changes | `utm_incident_history` |
| User session/activity | Login, logout, actions | `userauditor` PostgreSQL + OpenSearch |
| Correlation rule changes | Rule history | Implicit via `rule_last_update` |
| Agent commands | All commands sent + results | `agent_commands` (agentmanager DB) |
| API key usage | API calls using API keys | `ApiKeyUsageLoggingService` |
| MDC trace IDs | HTTP request trace IDs | `TraceIdFilter` / `MdcCleanupFilter` |

---

## Secrets Inventory

| Secret | How Provided | Used By |
|---|---|---|
| `DB_PASS` | Environment variable | Backend, AgentManager, UserAuditor |
| `ELASTICSEARCH_PASSWORD` | Environment variable | Backend, UserAuditor |
| `INTERNAL_KEY` | Environment variable (installer generated) | Backend ↔ AgentManager ↔ EventProcessor |
| `ENCRYPTION_KEY` | Environment variable (installer generated) | Backend, AgentManager |
| `AGENT_SECRET_PREFIX` (REPLACE_KEY) | GitHub Secret → ldflags | Agent, Collector, AS400 binaries |
| `POSTGRES_PASSWORD` | Environment variable | All services connecting to PostgreSQL |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | Environment variable | OpenSearch cluster |
| `CM_ENCRYPT_SALT` | GitHub Secret → ldflags | Installer binary |
| `CM_SIGN_PUBLIC_KEY` | GitHub Secret → ldflags | Installer binary |
| JWT signing key | Ephemeral (generated at startup) | Backend (in-memory only) |
| `MAVEN_TK` | CI/CD environment | Maven (GitHub Packages auth) |

---

## Tenant Isolation

UTMStack is currently a **single-tenant** deployment model. Each installation serves one organization. The data model has tenant/client fields (`utm_client`) but there is no multi-tenant data isolation at the application layer.

**`utm_tenant_config`** and `Tenant` concept in the correlation engine refer to asset grouping and impact scoring — not multi-tenant customer isolation.

---

## Known Security Gaps

| # | Issue | Severity |
|---|---|---|
| 1 | CORS `allowed-origins: '*'` in prod config | Medium |
| 2 | JWT rotates on restart — no token revocation list | Medium |
| 3 | Password passed as URL query parameter (`/api/check-credentials`) | Medium |
| 4 | gRPC InsecureTrustManagerFactory (backend→agentmanager) | Medium |
| 5 | SOC AI TrustAll TLS client | Medium |
| 6 | No API rate limiting beyond login fail2ban | Medium |
| 7 | REPLACE_KEY embedded in binary (extractable) | Medium |
| 8 | SMTP credentials stored as plaintext in DB config | Low |
| 9 | TFA codes in Caffeine memory cache (plaintext) | Low |
| 10 | Agent keys stored as plaintext UUIDs in PostgreSQL | Low |
| 11 | Web-PDF Selenium accepts user-provided URLs (SSRF potential) | High |
| 12 | `DEBUG_INFO_ENABLED: true` in both dev and prod environments | Low |
| 13 | Node 14.16.1 EOL — frontend build dependency chain has unpatched CVEs | High |
| 14 | Angular 7.2.0 EOL — no security patches since 2019 | High |
