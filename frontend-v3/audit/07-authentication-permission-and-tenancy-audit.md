# 07 — Authentication, Permission, and Tenancy Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** auth.store.ts, AuthGuard.tsx, apiClient.ts, router/index.tsx, backend-to-ui-capability-matrix.md, tenant-and-mssp-ux-specification.md

---

## 1. Authentication Flows

### 1.1 Credential Authentication (POST /api/authenticate)
**Status: COMPLIANT**

- LoginPage.tsx handles username + password submission
- Successful response stores JWT in `localStorage["hivearmor_auth_token"]` (auth.store.ts:45)
- auth.store.ts:44-47: `setUser(user, token)` persists token and sets `isAuthenticated: true`
- apiClient.ts:68-77: reads token on every request and injects `Authorization: Bearer <token>` header

### 1.2 Two-Factor Authentication
**Status: COMPLIANT**

- TfaPage.tsx at `/login/tfa` confirmed in router/index.tsx:74-76
- `APP_TFA_ENABLED=false` in local dev — TFA is bypassed locally

### 1.3 SSO / SAML
**Status: MISSING (FRONTEND_READY_BACKEND_MISSING)**

- No SSO route in router — no `/login?sso=<provider>` handler
- Backend `/api/ha-providers` endpoint exists but is UNPROTECTED (SEC-GAP-11) — returns all IdP configurations without authentication
- GAP-SEC-11 must be resolved before this flow can be safely implemented

### 1.4 Backup Codes
**Status: MISSING**

- No backup code overlay in LoginPage.tsx
- Backend endpoint exists for backup code verification
- Risk: Users locked out of MFA-protected accounts have no recovery path

### 1.5 Account Locked State (HTTP 423)
**Status: MISSING**

- LoginPage.tsx does not handle `HTTP 423 Locked` response
- Users see generic error message rather than "Account locked" with instructions
- Brute-force protection UX absent

---

## 2. Session Management

### 2.1 Token Storage
**Status: COMPLIANT**

- JWT stored exclusively in `localStorage["hivearmor_auth_token"]` (apiClient.ts:9, auth.store.ts:45)
- Token NOT stored in React state directly (auth.store holds the value but reads/writes localStorage)
- Token NOT in URL params
- Token NOT in sessionStorage

### 2.2 Auto-Logout on 401
**Status: COMPLIANT**

```
apiClient.ts:95-99:
  if (response.status === 401) {
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new ApiError(401, { status: 401, message: 'Session expired' });
  }
```

- Hard page redirect on 401 — clears all in-memory state
- Limitation: No graceful session-expired overlay (user loses unsaved work)

### 2.3 Token Expiry Handling
**Status: PARTIALLY_IMPLEMENTED**

- 401 auto-logout covers expired tokens
- No proactive token expiry check before requests (no decoding of JWT exp claim)
- No refresh token mechanism (backend generates ephemeral non-refreshable JWTs)

### 2.4 DEBT-14: Ephemeral JWT Key
**Status: MISSING (P0)**

- Backend `JwtKeyService` generates a new secret on every application restart
- All existing sessions are immediately invalidated on backend restart
- Frontend cannot mitigate this — it correctly handles the resulting 401
- **Impact:** Every backend deployment (planned or emergency) logs out all active users
- **Required Action:** Backend must persist JWT signing key across restarts (e.g., in database or env var)

### 2.5 Auth Bootstrap
**Status: COMPLIANT**

- `auth.store.ts:41`: `isLoading: true` initial state
- AuthGuard.tsx:30-53: spinner rendered during bootstrap
- Prevents redirect-before-bootstrap loop

---

## 3. Permission Enforcement Chain

### 3.1 Frontend Role Model

Roles defined in auth.store.ts via user.roles string array:
- `ROLE_ADMIN`
- `ROLE_SOC_MANAGER`
- `ROLE_ANALYST`
- `ROLE_THREAT_HUNTER` (spec-defined; not confirmed in router guards)
- `ROLE_READ_ONLY`
- `ROLE_USER` (JHipster default)

### 3.2 AuthGuard Role Enforcement

AuthGuard.tsx checks `hasAnyRole(allowedRoles)`:
```typescript
if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
  return <AccessDeniedPage />;
}
```

**Gaps found:**
- Routes with NO `allowedRoles`: /command, /alerts, /alerts/severity, /hunt, /investigations, /investigations/:id, /posture/assets, /posture/identities, /posture/exposure, /compliance, /dashboards, /dashboards/:id, /reports/* — these allow ANY authenticated user including READ_ONLY
- Spec minimum role for most of these is ANALYST or VIEWER — some under-restriction, some intentional

### 3.3 Internal Role Constants Exposed to Users
**Status: COMPLIANT**

- No `ROLE_*` string constants found in any rendered UI text (grep confirms)
- HiveIntelligencePage.tsx:16-19 uses `hasAnyRole()` check but renders only "Access Denied" message, not the role name
- Auth store uses internal constants for logic only; UI copy uses human labels

### 3.4 getDefaultLanding() Routing
**Status: PARTIALLY_IMPLEMENTED**

auth.store.ts:68-73:
```typescript
getDefaultLanding: () => {
  if (!user) return '/login';
  if (user.roles.includes('ROLE_ADMIN')) return '/admin/users';
  return '/queue';
}
```

- ADMIN users land on `/admin/users` (correct)
- All other roles land on `/queue` — including READ_ONLY (who may not have access to queue)
- Spec requires role-specific landing pages for SOC_MANAGER, ANALYST, READ_ONLY
- READ_ONLY should land on `/command` or `/dashboards`

---

## 4. P0 Blockers — Endpoints Missing @PreAuthorize

The following endpoints have confirmed missing `@PreAuthorize` and are P0 security issues:

| SEC-GAP-ID | Endpoint(s) | Risk | Frontend Action Required |
|---|---|---|---|
| SEC-GAP-02 | GET/POST/PUT/DELETE /api/authority/* | CRITICAL — any authenticated user can create/delete roles | Disable ResponseAuthorityPage in prod navigation |
| SEC-GAP-03 | GET /api/ha-clients — clientPass in plaintext | CRITICAL — credentials exposed | Never render clientPass; disable TenantsPage data in prod |
| SEC-GAP-05 | PUT /api/offenses/{id} — Groovy injection | CRITICAL — RCE via status field | Status control correctly disabled; do not re-enable |
| SEC-GAP-06 | POST /api/edr/* (incl. kill-process) | CRITICAL — unauthenticated process termination | EDR actions disabled; do not re-enable |
| SEC-GAP-13 | WS @MessageMapping /command/{hostname} | HIGH — any role can dispatch agent commands | Agent command terminal not built; do not build until fixed |
| SEC-GAP-01 | All alert mutation endpoints | HIGH — unauthenticated status/note/tag changes | Alert mutations partially wired; add warnings |
| SEC-GAP-17 | /api/ha-incidents/* main CRUD | HIGH — incident data exposed without role check | Incident pages work but unprotected |
| SEC-GAP-04 | /api/mitre/exportCoverage | HIGH — no auth at all | Export button must not exist in UI until fixed |

---

## 5. Tenant Isolation Chain

### 5.1 Frontend: X-Tenant-ID Header
**Status: PARTIALLY_IMPLEMENTED**

apiClient.ts:79-83:
```typescript
const { selectedTenantId } = useAuthStore.getState();
if (selectedTenantId !== null) {
  requestHeaders['X-Tenant-ID'] = String(selectedTenantId);
}
```

- Header IS injected when `selectedTenantId` is set
- `selectedTenantId` is initially `null` and has no UI to set it (no tenant selector)
- **Consequence:** Header is NEVER sent in practice — `selectedTenantId` is always null

### 5.2 Backend: Tenant Header Enforcement
**Status: MISSING (FULL_STACK_DEVELOPMENT_REQUIRED)**

- No backend filter reads `X-Tenant-ID`
- `clientPrefix` defined in `UtmClient` but unused in all service queries
- OpenSearch queries have no tenant filter injection
- PostgreSQL entities (`UtmIncident`, `UtmAlert`, etc.) have no `tenant_prefix` column
- **Consequence:** Even if the frontend sent the header, the backend would ignore it

### 5.3 Verified Absent Tenant Filters (from spec audit 2026-07-22)

| Domain | Tenant Column | Tenant Filter |
|---|---|---|
| UtmIncident (PostgreSQL) | None | No |
| UtmAlert (OpenSearch) | None | No |
| UtmEvidenceItem | None | No |
| InvestigationSession | None | No |
| UtmDashboard | None | No |
| UtmReport | None | No |
| AlertSseResource (SSE) | None | No |
| LiveEpsResource (SSE) | None | No |

### 5.4 MSSP Mode B Requirements
**Status: FULL_STACK_DEVELOPMENT_REQUIRED across all 14 items**

From `tenant-and-mssp-ux-specification.md` Section 8:

| Requirement | Classification | Est. Effort |
|---|---|---|
| Masthead tenant selector UI | FULL_STACK — blocked on user-tenant backend | Large |
| Tenant-scoped data (PG schema migration) | FULL_STACK | Very Large |
| Tenant-scoped OpenSearch queries | FULL_STACK | Large |
| X-Tenant-Prefix backend enforcement filter | FULL_STACK | Medium |
| SSE per-tenant isolation | FULL_STACK | Medium |
| Cross-tenant permission (CROSS_TENANT_READ) | FULL_STACK | Large |
| Audit event tenant recording | FULL_STACK | Medium |
| Per-tenant localStorage key namespacing | Frontend only | Small |
| Tenant switch UX (cache clear, guard) | Frontend only | Small |

**P0 Rule:** Frontend-only tenant isolation (header without backend enforcement) is a critical security gap. Do not ship any tenant selector until backend enforcement is complete.

---

## 6. MSSP Requirements — Masthead Selector

**From spec:** Masthead must show tenant dropdown between logo and notification bell.

**Current state:** HaMasthead.tsx renders:
- HaWordmark (logo)
- LiveEpsBadge
- HelpButton
- NotificationsBell
- UserAvatarMenu

**Missing:** TenantSelectorDropdown component — not built.

**Required when Mode B is ready:**
- Dropdown with `aria-label="Active tenant"`
- Shows `clientName` (never `clientPrefix`)
- Hides when user has access to exactly 1 tenant (renders as static badge)
- "All Tenants" option only for `CROSS_TENANT_READ` permission holders
- Triggers `queryClient.clear()` on switch + reloads grid states

---

## 7. Summary Risk Classification

| Area | Status | Risk Level | Blocks Prod? |
|---|---|---|---|
| Credential auth | COMPLIANT | LOW | NO |
| TFA | COMPLIANT | LOW | NO |
| SSO | MISSING | MEDIUM | Blocks enterprise customers |
| Backup codes | MISSING | MEDIUM | Blocks MFA rollout |
| JWT storage | COMPLIANT | LOW | NO |
| Auto-logout | COMPLIANT | LOW | NO |
| DEBT-14 (ephemeral key) | NOT FIXED | HIGH | Operational risk |
| @PreAuthorize gaps (18 endpoints) | NOT FIXED | CRITICAL | Blocks security certification |
| Tenant isolation | MISSING | CRITICAL | Blocks MSSP deployments |
| MSSP tenant selector | MISSING | HIGH | Blocks MSSP product |
