---
inclusion: always
---

# Security, RBAC, and Tenant Isolation

## Authentication Mechanisms

| Mechanism | Path | Implementation file |
|---|---|---|
| JWT login | `POST /api/authenticate` | `UserJWTController`, `TokenProvider` |
| JWT verify | `Authorization: Bearer <token>` header | `JWTFilter` |
| TFA (TOTP) | `POST /api/tfa/verify-code` | `TfaService`, `TotpTfaService` |
| TFA (email OTP) | same endpoint | `EmailTfaService` |
| SAML2 SSO | `/saml2/authenticate/<registrationId>` | `Saml2LoginSuccessHandler` → issues JWT |
| External API Key | custom header | `ApiKeyFilter` |
| Inter-service | `Utm-Internal-Key` header | `InternalApiKeyFilter` |
| Agent gRPC | TLS 1.3 + `key/id/type` metadata | `agent-manager/agent/interceptor.go` |

## JWT Lifecycle

```
POST /api/authenticate
  → if TFA disabled: full JWT (24 h / 30 d remember-me), role = ROLE_ADMIN or ROLE_USER
  → if TFA enabled:  temp JWT (5 min), role = PRE_VERIFICATION_USER

POST /api/tfa/verify-code
  → full JWT issued, role = actual user role

Token key in storage: <window.hostname.toUpperCase()>_AUTH_TOKEN
Cookie:               utmauth
```

**The JWT signing key is ephemeral** — generated at startup in `TokenProvider.java`, never persisted. Every backend restart invalidates all sessions. This is a known issue (DEBT-14 in `docs/baseline/13-known-issues-and-technical-debt.md`).

## Roles (only these two operational roles exist)

| Role | What it allows |
|---|---|
| `ROLE_ADMIN` | Everything — including user CRUD, system config, agent commands |
| `ROLE_USER` | Alerts, incidents, dashboards, SOAR, compliance, log search |
| `PRE_VERIFICATION_USER` | TFA flow only — `/api/tfa/**`, `/api/enrollment/**` |

There is no multi-tenant isolation. Each HiveArmor deployment serves one organisation. `hive_tenant_config` is an asset registry, not a tenant boundary.

## Security Configuration Rules

Source of truth: `backend/src/main/java/com/hivearmor/config/SecurityConfiguration.java`

**Public endpoints** (no auth): `/api/authenticate`, `/api/ping`, `/api/healthcheck`, `/api/info/version`, `/api/ha-providers`, `/api/images/all`, `/api/account/reset-password/**`

**Hardcoded restrictions** — do not change without explicit review:
- `/api/custom-reports/**` → `denyAll`
- `/api/ha-incident-jobs/**` → `ROLE_ADMIN`
- `/management/**` → `ROLE_ADMIN` (Actuator endpoints)

## New Endpoint Checklist

Every new endpoint must satisfy all of these before merge:

- [ ] Has a `@PreAuthorize` annotation OR is listed in `SecurityConfiguration` HTTP rules
- [ ] If public: explicitly added to the public path list in `SecurityConfiguration`
- [ ] If it reads/writes user-provided data to OpenSearch: uses `SearchUtil` DSL builders only — no string concatenation
- [ ] If it accepts file uploads: server-side MIME validation via `tika-core`
- [ ] If it calls an external URL: URL is validated against an allowlist — no trust-all TLS
- [ ] Sensitive operations (password, key material) go in POST body, never URL query params

## Secrets and Keys — Immutable Contracts

Changing any of these has cascading deployment consequences:

| Secret/key | Where used | Consequence of change |
|---|---|---|
| `INTERNAL_KEY` env var | backend + agentmanager + eventprocessor | All three must redeploy simultaneously |
| `REPLACE_KEY` (ldflags) | agent, collector, as400 binaries | Every deployed agent must be reinstalled |
| `utmauth` cookie name | browser sessions | All active sessions are invalidated |
| `SESSION_AUTH_TOKEN` key pattern | localStorage/sessionStorage | All active sessions are invalidated |
| `Utm-Internal-Key` header name | frontend, backend, external integrations | Breaking change for all API callers |

**Never commit actual secret values.** Reference them by variable name only.

## Audit Trail (always maintain)

Any code path that changes the following must write an audit record:

| Entity changed | Audit table / service |
|---|---|
| Alert status or tags | `hive_alert_log` |
| Incident status, notes | `hive_incident_history` |
| User login/logout/activity | `user-auditor` service |
| Agent remote command | `agent_commands` (agentmanager DB) |
| API key usage | `ApiKeyUsageLoggingService` |

## Known Security Gaps (do not introduce additional instances)

- `GET /api/check-credentials?password=<value>` — password in URL, logged everywhere
- `CORS allowed-origins: '*'` in `application-prod.yml`
- Backend→AgentManager gRPC: `InsecureTrustManagerFactory` — no cert validation
- `SocAIService` OkHttp client: trust-all TLS
- No API rate limiting beyond login fail2ban

These are documented in `docs/baseline/06-security-and-rbac-baseline.md` and `docs/baseline/12-risk-register.md`. Do not replicate these patterns in new code.
