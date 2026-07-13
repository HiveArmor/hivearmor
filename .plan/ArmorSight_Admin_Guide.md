# ArmorSight SIEM — Administrator Technical Reference

**Version:** 0.1 (Local Dev Build)  
**Date:** 2026-07-07  
**Audience:** Platform administrators and DevOps engineers responsible for deploying, configuring, and maintaining the ArmorSight SIEM system.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Local Development Stack](#3-local-development-stack)
4. [First-Time Setup](#4-first-time-setup)
5. [Authentication & Security](#5-authentication--security)
6. [Frontend (ArmorSight UI)](#6-frontend-armorsight-ui)
7. [Backend API Reference](#7-backend-api-reference)
8. [Reports Module (F-02)](#8-reports-module-f-02)
9. [Known Issues & Workarounds](#9-known-issues--workarounds)
10. [Environment Variable Reference](#10-environment-variable-reference)

---

## 1. System Overview

ArmorSight is a branded fork of UTMStack — a full-stack SIEM (Security Information and Event Management) and XDR platform. It provides:

- Real-time alert ingestion, correlation, and streaming via Server-Sent Events (SSE)
- Compliance and custom security report generation (PDF via headless browser)
- Asset discovery and network scan tracking
- Incident management and MITRE ATT&CK mapping
- Agent-based endpoint monitoring via gRPC

The Next.js v2 frontend (`frontend-v2`) is a ground-up rewrite replacing the original Angular UI, built with React/Next.js 15, Tailwind CSS, and Zustand state management.

---

## 2. Architecture

```
Browser
  └── Next.js (port 3000 / dev: dynamic)
        ├── /api/* rewrites → Spring Boot :8088
        └── /api/sse/* proxy → Spring Boot :8088 (streaming)

Spring Boot (port 8088)
  ├── PostgreSQL :5438      — user data, config, compliance schedules
  ├── OpenSearch :9200      — alert/log index storage & search
  ├── Redis :6379           — SSE pub/sub for live alert streaming (prod)
  ├── Agent Manager :9000   — gRPC endpoint agent management
  └── Event Processor :9002 — log correlation engine
```

### Key design decisions

| Decision | Detail |
|---|---|
| Next.js `rewrites` vs route handler | Both exist. `rewrites` handles most `/api/*` traffic server-side. `/api/sse/[...path]/route.ts` is a dedicated streaming proxy that does not buffer. |
| `BACKEND_URL` env var | Server-side only (no `NEXT_PUBLIC_` prefix). Used by `next.config.ts` rewrites and the SSE proxy. Default: `http://localhost:8088`. Docker: `http://backend:8080`. |
| TFA disabled in dev | `APP_TFA_ENABLED=false` env var bypasses two-factor auth. Without this, all logins issue a challenge-only token (`ROLE_PRE_VERIFICATION_USER`) that cannot access any API. |
| Redis conditional | `AlertRedisPublisher` and `RedisConfiguration` are gated with `@ConditionalOnProperty(name="app.redis.enabled", havingValue="true")`. Redis is not required in local dev. |

---

## 3. Local Development Stack

### Infrastructure services (Docker Compose)

Start with:
```bash
cd local-dev
docker compose up -d postgres opensearch agentmanager
```

| Service | Host port | Purpose |
|---|---|---|
| PostgreSQL | 5438 | Backend DB (user data, config, reports) |
| OpenSearch | 9200 | Alert/log storage and full-text search |
| Redis | 6379 | SSE pub/sub (not required in dev) |
| Agent Manager | 9000/9001 | gRPC agent management |
| OpenSearch Dashboards | 5601 | Index management UI (dev only) |

### Application services (run locally)

| Service | Port | Start command |
|---|---|---|
| Spring Boot backend | 8088 | See launch.json → "backend (Spring Boot)" |
| Next.js frontend v2 | 3000+ | `npm run dev` in `frontend-v2/` |

### Credentials

| Service | Username | Password |
|---|---|---|
| PostgreSQL | postgres | localdev123! |
| ArmorSight admin | admin | localdev123! |
| OpenSearch | admin | LocalDev@2024! |
| OpenSearch Dashboards | admin | LocalDev@2024! |

---

## 4. First-Time Setup

### Prerequisites

- Docker Desktop (running)
- Java 17 (`/opt/homebrew/opt/openjdk@17`)
- Node.js 20+
- Maven offline dependencies pre-downloaded

### Step 1 — Start infrastructure

```bash
cd local-dev
docker compose up -d postgres opensearch agentmanager
```

Wait ~2 minutes for OpenSearch to initialize (it runs a health check until `green|yellow`).

### Step 2 — Disable TFA for admin (one-time)

The seeded admin account has TFA configured in the database. This must be cleared before first login:

```bash
docker exec -i $(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1) \
  psql -U postgres -d nilachakra \
  -c "UPDATE jhi_user SET tfa_secret = null, tfa_method = null WHERE login = 'admin';"
```

Expected output: `UPDATE 1`

### Step 3 — Start backend

Use the Claude Code preview launcher ("backend (Spring Boot)") or run manually:

```bash
cd backend
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
APP_TFA_ENABLED=false \
DB_HOST=localhost DB_PORT=5438 DB_NAME=nilachakra DB_USER=postgres DB_PASS='localdev123!' \
ELASTICSEARCH_HOST=localhost ELASTICSEARCH_PORT=9200 \
ELASTICSEARCH_USER=admin ELASTICSEARCH_PASSWORD='LocalDev@2024!' \
INTERNAL_KEY=local-dev-internal-key-do-not-use-in-prod-12345678 \
ENCRYPTION_KEY=local-dev-encryption-key-do-not-use-in-prod-87654321 \
SERVER_NAME=localhost \
./mvnw spring-boot:run -o -Dspring-boot.run.profiles=dev -Dspring-boot.run.arguments=--server.port=8088
```

Boot time: ~60–90 seconds. Confirm with:
```
Application 'UTMStack-API' is running! Access URLs: Local: http://localhost:8088/
```

### Step 4 — Start frontend

```bash
cd frontend-v2
npm run dev
```

Frontend available at: `http://localhost:3000` (or next available port).

### Step 5 — Login

Navigate to `http://localhost:3000/login`  
Username: `admin`  
Password: `localdev123!`

---

## 5. Authentication & Security

### Login flow

```
POST /api/authenticate  { username, password, rememberMe }
  └── Returns { token, tfaConfigured, success, ... }

If tfaConfigured = false:
  GET /api/account  (with Bearer token)
  └── Returns { login, authorities, email, ... }
  └── Session established

If tfaConfigured = true:
  → Show TFA code entry screen (TODO: not yet built in frontend-v2)
  POST /api/tfa/verify-code
  └── Returns full session token
```

### JWT token claims

| Claim | Description |
|---|---|
| `sub` | Username (e.g. `admin`) |
| `auth` | Comma-separated roles: `ROLE_ADMIN,ROLE_USER` |
| `authenticated` | `true` = full session; `false` = TFA challenge only |
| `exp` | Expiry timestamp |

### Roles

| Role | Access |
|---|---|
| `ROLE_ADMIN` | Full access to all API endpoints |
| `ROLE_USER` | Standard user access |
| `ROLE_PRE_VERIFICATION_USER` | TFA challenge only — can only call `/api/tfa/verify-code` |

### TFA configuration

TFA is controlled by two independent mechanisms:

| Mechanism | Scope | How to set |
|---|---|---|
| `APP_TFA_ENABLED` env var | Global on/off for the server | Set to `false` in dev, `true` in prod |
| `tfa_method` column in `jhi_user` | Per-user method (EMAIL or TOTP) | Cleared via SQL or user settings UI |

In production, both must be configured: `APP_TFA_ENABLED=true` AND the user must have enrolled a TFA method.

### `/api/account` — critical endpoint

This endpoint identifies the authenticated user. It was previously throwing `500 InternalServerError` when called with an invalid/expired token. Fixed in `AccountResource.java`:

```java
// Returns 401 (not 500) when user not found for the given token
public ResponseEntity<UserDTO> getAccount() {
    return userService.getUserWithAuthorities()
        .map(UserDTO::new)
        .map(ResponseEntity::ok)
        .orElse(ResponseEntity.status(401).build());
}
```

---

## 6. Frontend (ArmorSight UI)

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| HTTP client | Custom `ApiClient` in `src/lib/api.ts` |
| Auth store | `src/store/auth.ts` |

### Key files

| File | Purpose |
|---|---|
| `src/lib/api.ts` | Central HTTP client. Handles Bearer token, 401 redirect, error extraction |
| `src/store/auth.ts` | Zustand store: login, logout, checkAuth |
| `src/app/api/[...path]/route.ts` | Catch-all proxy route for all `/api/*` calls |
| `src/app/api/sse/[...path]/route.ts` | Streaming SSE proxy (non-buffering) |
| `next.config.ts` | Next.js rewrites: `/api/*` → `BACKEND_URL/api/*` |
| `frontend-v2/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:8088` |

### API proxying

The frontend uses two proxy paths:

1. **`next.config.ts` rewrites** — server-side, applies to all `/api/*` routes not handled by route handlers. Reads `BACKEND_URL` env var.
2. **`/api/[...path]/route.ts`** — explicit route handler proxy. Used by browser-side `fetch` calls. Falls back to `http://localhost:8088` if no env var set.
3. **`/api/sse/[...path]/route.ts`** — streaming-only proxy for SSE. Does not buffer the response body, pipes directly to the browser.

### SSE streams

Two live data streams are active when the dashboard is open:

| Frontend hook | Next.js proxy path | Backend path | Data |
|---|---|---|---|
| `use-alert-stream.ts` | `/api/sse/utm-alerts/stream` | `/api/alerts/stream` | Live alert events |
| `use-eps-stream.ts` | `/api/sse/live-eps` | `/api/eps/stream` | Events-per-second metrics |

> **Note:** SSE streams currently return 500 in dev because the backend SSE paths differ from the frontend proxy paths, and `AlertSseService` depends on Redis pub/sub. These streams are non-critical — the dashboard renders correctly without them.

### Environment variables

| Variable | Where set | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `.env.local` | Baked into client bundle at build time. Used by `api.ts` for SSR fallback. |
| `BACKEND_URL` | Process env / Docker | Server-side only. Used by `next.config.ts` rewrites. Docker value: `http://backend:8080` |

---

## 7. Backend API Reference

### Base URL
`http://localhost:8088/api`

### Authentication endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/authenticate` | Login. Returns JWT token. |
| GET | `/account` | Get current user profile. Requires `Authorization: Bearer <token>`. |
| POST | `/account` | Update current user profile. |

### Report endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/utm-reports` | List report templates. Params: `page`, `size`, `sort`. |
| GET | `/utm-reports/{id}` | Get single report template. |
| GET | `/utm-report-sections` | List report sections. |
| POST | `/compliance-report-schedules` | Create a schedule. |
| PUT | `/compliance-report-schedules` | Update a schedule. |
| GET | `/compliance-report-schedules-by-user` | List schedules for current user. |
| GET | `/compliance-report-schedules-by-id/{id}` | Get schedule by ID. |
| DELETE | `/compliance-report-schedules/{id}` | Delete schedule. |

> **Important:** There is no `GET /compliance-report-schedules`. Use `GET /compliance-report-schedules-by-user` to list the current user's schedules.

### Search endpoint

| Method | Path | Description |
|---|---|---|
| POST | `/elasticsearch/search` | Search OpenSearch indexes. |

Query params: `top`, `indexPattern`, `sort`, `page`, `size`  
Body: JSON array of filter objects `[{ field, operator, value }]`

Example:
```bash
curl -X POST "http://localhost:8088/api/elasticsearch/search?top=10&indexPattern=v11-alert-*&sort=%40timestamp%2Cdesc" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '[{"field":"severity","operator":"IS","value":4}]'
```

### SSE endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/alerts/stream` | Live alert SSE stream. Requires Redis in prod. |
| GET | `/eps/stream` | Live EPS metrics SSE stream. |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/healthcheck` | Returns 200 if backend is up. No auth required. |
| GET | `/ping` | Lightweight ping. No auth required. |

---

## 8. Reports Module (F-02)

### Overview

The Reports page (`/reports`) provides three tabs:

| Tab | Description | Backend endpoint |
|---|---|---|
| Templates | Browse available report templates | `GET /api/utm-reports` |
| Generated Reports | View previously generated report PDFs | `GET /api/utm-report-sections` |
| Schedules | Manage automated report schedules | `GET /api/compliance-report-schedules-by-user` |

### Current state (2026-07-07)

| Feature | Status | Notes |
|---|---|---|
| Templates tab renders | ✅ Working | Shows "No templates found" — no templates seeded in fresh DB |
| Generated Reports tab renders | ✅ Working | Shows empty state — no reports generated yet |
| Schedules tab renders | ✅ Working | UI renders; list call needs `compliance-report-schedules-by-user` endpoint |
| New Schedule button | ✅ Working | Opens modal |
| Schedule creation (POST) | ✅ Wired | Calls `POST /api/compliance-report-schedules` |
| Report generation (PDF) | ⚠️ Depends on `web-pdf` service | `web-pdf` Docker service not running in local dev |
| Schedule list loading | ⚠️ Bug | Calls `GET /api/utm-compliance-report-schedules` (wrong path) — should be `GET /api/compliance-report-schedules-by-user` |

### Schedule list bug fix needed

In [`frontend-v2/src/services/report.service.ts`](../frontend-v2/src/services/report.service.ts), the `listSchedules` method currently calls the wrong endpoint. Fix:

```typescript
// Current (wrong — returns 500):
GET /api/utm-compliance-report-schedules

// Correct:
GET /api/compliance-report-schedules-by-user
```

### Frontend components

| File | Purpose |
|---|---|
| `src/app/(app)/reports/page.tsx` | Main reports page — three-tab layout |
| `src/services/report.service.ts` | All report API calls |
| `src/components/reports/report-schedule-modal.tsx` | New/edit schedule modal |
| `src/components/reports/report-viewer-drawer.tsx` | View generated report PDF drawer |

---

## 9. Known Issues & Workarounds

### Issue 1 — SSE streams return 500

**Symptom:** Browser console floods with `GET /api/sse/utm-alerts/stream 500` errors in a retry loop.

**Root cause:**
1. Frontend proxy path `/api/sse/utm-alerts/stream` does not match backend path `/api/alerts/stream`
2. `AlertSseService` depends on Redis pub/sub which is disabled in dev

**Impact:** Non-critical. Dashboard renders correctly. Live alert streaming is inactive.

**Fix (pending):**
- Update `use-alert-stream.ts` to call `/api/alerts/stream` directly
- Update `use-eps-stream.ts` to call `/api/eps/stream` directly
- Add `@ConditionalOnProperty` to `AlertSseResource` bean to handle missing Redis gracefully

---

### Issue 2 — Schedules tab fails to load

**Symptom:** Schedules tab shows error or empty state incorrectly.

**Root cause:** `report.service.ts` calls `GET /api/utm-compliance-report-schedules` which does not exist. The correct endpoint is `GET /api/compliance-report-schedules-by-user`.

**Fix (pending):** Update `listSchedules()` in `report.service.ts`.

---

### Issue 3 — No report templates in fresh install

**Symptom:** Reports > Templates tab shows "No templates found."

**Root cause:** The `utm_reports` and `utm_report_sections` tables are empty in a fresh database. Templates must be seeded or imported.

**Workaround:** This is expected in a fresh local dev environment. Templates are populated when the full UTMStack seed data is applied, or via the compliance module configuration.

---

### Issue 4 — TFA blocks login in fresh environments

**Symptom:** Login succeeds (POST /api/authenticate returns 200) but subsequent GET /api/account returns 403 (Access Denied). The JWT token contains `ROLE_PRE_VERIFICATION_USER` instead of `ROLE_ADMIN`.

**Root cause:** Admin user has `tfa_method` set in the database AND `APP_TFA_ENABLED` env var defaults to `true`.

**Fix:**
1. Set `APP_TFA_ENABLED=false` in the backend process environment (already in `launch.json`)
2. Clear TFA from the admin user in the DB:
```sql
UPDATE jhi_user SET tfa_secret = null, tfa_method = null WHERE login = 'admin';
```

---

### Issue 5 — Duplicate spring YAML key on startup

**Symptom:** Backend fails to start with `DuplicateKeyException: found duplicate key spring`.

**Root cause:** `application-dev.yml` had a second top-level `spring:` key inserted for autoconfigure exclusions.

**Status:** Fixed. The `autoconfigure.exclude` block is now nested under the existing `spring:` key.

---

## 10. Environment Variable Reference

### Backend (Spring Boot)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | Yes | — | PostgreSQL hostname |
| `DB_PORT` | Yes | — | PostgreSQL port |
| `DB_NAME` | Yes | — | Database name |
| `DB_USER` | Yes | — | Database username |
| `DB_PASS` | Yes | — | Database password |
| `ELASTICSEARCH_HOST` | Yes | — | OpenSearch hostname |
| `ELASTICSEARCH_PORT` | Yes | — | OpenSearch port (9200) |
| `ELASTICSEARCH_USER` | Yes | — | OpenSearch username |
| `ELASTICSEARCH_PASSWORD` | Yes | — | OpenSearch password |
| `INTERNAL_KEY` | Yes | — | Internal service-to-service auth key |
| `ENCRYPTION_KEY` | Yes | — | Data encryption key |
| `SERVER_NAME` | Yes | — | Hostname of this server |
| `APP_TFA_ENABLED` | No | `true` | Set to `false` to disable TFA globally |
| `GRPC_AGENT_MANAGER_HOST` | No | localhost | Agent Manager gRPC host |
| `GRPC_AGENT_MANAGER_PORT` | No | 9000 | Agent Manager gRPC port |
| `EVENT_PROCESSOR_HOST` | No | localhost | Event Processor host |
| `EVENT_PROCESSOR_PORT` | No | 9002 | Event Processor port |
| `REDIS_HOST` | No | localhost | Redis host (only needed if `app.redis.enabled=true`) |
| `REDIS_PORT` | No | 6379 | Redis port |
| `app.redis.enabled` | No | false | Enable Redis pub/sub for SSE streaming |

### Frontend (Next.js)

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `.env.local` | Baked into client bundle. Used by `api.ts` for browser-side fetch base URL. |
| `BACKEND_URL` | Process env | Server-side only. Used by `next.config.ts` rewrites. Docker: `http://backend:8080` |

---

## Appendix — Verified API Test Results (2026-07-07)

Tested against backend `http://localhost:8088` with credentials `admin / localdev123!`:

| Endpoint | Method | Status | Notes |
|---|---|---|---|
| `/api/authenticate` | POST | 200 ✅ | Returns full JWT with `ROLE_ADMIN,ROLE_USER` |
| `/api/account` | GET | 200 ✅ | Returns admin user profile |
| `/api/healthcheck` | GET | 200 ✅ | — |
| `/api/utm-reports` | GET | 200 ✅ | 0 templates (empty DB) |
| `/api/utm-report-sections` | GET | 200 ✅ | 0 sections (empty DB) |
| `/api/elasticsearch/search` | POST | 200 ✅ | Returns alert documents from OpenSearch |
| `/api/sse/utm-alerts/stream` | GET | 500 ⚠️ | Path mismatch — correct path: `/api/alerts/stream` |
| `/api/sse/live-eps` | GET | 500 ⚠️ | Path mismatch — correct path: `/api/eps/stream` |
| `/api/compliance-report-schedules-by-user` | GET | 200 ✅ | Returns empty array |
