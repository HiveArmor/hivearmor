# 16 — Target Frontend Architecture
## HiveArmor frontend-v3

**Audit date:** 2026-07-26
**Author:** Phase 2 audit
**Scope:** Architectural diagrams and specifications for the target state of frontend-v3, current gaps annotated.

---

## 1. Context Diagram

How HiveArmor sits in its environment. All communication between the browser and external systems passes through the Vite dev proxy (dev) or nginx (production).

```mermaid
graph TD
    Browser["Browser (React 18 + Vite)"]
    Nginx["nginx reverse-proxy (production)"]
    Backend["Backend API\nSpring Boot 3.3\n:8088"]
    PG["PostgreSQL\nhivearmor DB\n:5438"]
    OS["OpenSearch\nv3-hive-type-YYYY.MM.DD\n:9200"]
    Neo4j["Neo4j (graph)\nThreat Constellation\n:7687"]
    AgentMgr["Agent Manager\ngRPC :50051"]
    EventProc["Event Processor\nGo correlation engine"]
    SSEAlerts["/api/alerts/stream (SSE)"]
    SSEEps["/api/eps/stream (SSE)"]
    SSEAi["/api/ha-ai/chat (SSE)"]
    Agents["Endpoint Agents\nWindows/Linux/macOS"]

    Browser -->|"HTTPS /api/*"| Nginx
    Nginx -->|"proxy_pass"| Backend
    Backend -->|"JDBC"| PG
    Backend -->|"HTTPS"| OS
    Backend -->|"Bolt TLS"| Neo4j
    Backend -->|"gRPC INTERNAL_KEY"| AgentMgr
    AgentMgr -->|"gRPC TLS REPLACE_KEY"| Agents
    EventProc -->|"HTTP X-Internal-Key"| Backend
    EventProc -->|"HTTPS bulk write"| OS
    Browser -.->|"SSE stream"| SSEAlerts
    Browser -.->|"SSE stream"| SSEEps
    Browser -.->|"SSE stream"| SSEAi
```

---

## 2. Frontend Module Diagram

Internal module structure of `frontend-v3/src/`. Dependency arrows flow downward — deeper modules must not import from higher modules.

```mermaid
graph TD
    Pages["pages/\n(route components)"]
    Components["components/\n(shared Ha* wrappers, grids, charts)"]
    Hooks["hooks/\n(useAlertStream, useEpsStream, useAuthBootstrap)"]
    Services["services/\n(alerts.service, incidents.service, etc.)"]
    Store["store/\n(auth.store, sidebar.store, alertStream.store)"]
    Lib["lib/\n(severity.ts, status.ts, apiClient.ts, roles.ts)"]
    Types["types/\n(api.types.ts, domain types)"]
    Styles["styles/\n(tokens.css, global.css)"]

    Pages --> Components
    Pages --> Hooks
    Pages --> Services
    Pages --> Store
    Components --> Hooks
    Components --> Lib
    Components --> Types
    Components --> Styles
    Hooks --> Services
    Hooks --> Store
    Services --> Lib
    Lib --> Types
    Store --> Types
```

**Key rules:**
- `services/` must never be created inside `pages/` directories (audit found no violations)
- `lib/` has no upward imports — pure utility functions only
- `store/` must not import from `pages/` or `services/`

---

## 3. Route and Shell Composition Diagram

How `RouterProvider` → `AuthGuard` → `AppShell` → page component composes.

```mermaid
graph TD
    RouterProvider["RouterProvider\n(createBrowserRouter)"]
    PublicRoutes["Public Routes\n/login\n/login/tfa\n/access-denied"]
    ProtectedLayout["AppLayout\n(shell wrapper)"]
    AuthGuard["AuthGuard\n(role + auth check)"]
    AppShell["App Shell\nHaMasthead + HaNavigation + StatusDock"]
    PageOutlet["React Router Outlet\n(page rendered here)"]
    ContextDrawer["Context Drawer\n(AlertContextDrawer, IncidentContextDrawer)"]

    RouterProvider --> PublicRoutes
    RouterProvider --> ProtectedLayout
    ProtectedLayout --> AuthGuard
    AuthGuard -->|"isAuthenticated=false"| PublicRoutes
    AuthGuard -->|"isAuthenticated=true"| AppShell
    AppShell --> PageOutlet
    AppShell --> ContextDrawer
```

**Current gap:** `/access-denied` route has no `AuthGuard` (acceptable — intentional); 26 routes resolve to `.skip.ts` stubs with no user feedback.

---

## 4. API and Data Flow

Full request/response lifecycle from user interaction to data rendered in component.

```mermaid
sequenceDiagram
    participant User
    participant Component
    participant TanStackQuery as "TanStack Query v5"
    participant ApiClient as "apiClient.ts"
    participant ViteProxy as "Vite Proxy /api/*"
    participant Backend as "Backend :8088"
    participant DB as "PostgreSQL / OpenSearch"
    participant ZustandStore as "Zustand Store"

    User->>Component: interacts (sort, filter, etc.)
    Component->>TanStackQuery: useQuery / useMutation
    TanStackQuery->>ApiClient: fetch()
    ApiClient->>ApiClient: inject Authorization Bearer + X-Tenant-ID
    ApiClient->>ViteProxy: fetch /api/ha-alerts
    ViteProxy->>Backend: proxy forward
    Backend->>DB: JPA query / OS DSL
    DB-->>Backend: result set
    Backend-->>ViteProxy: JSON + X-Total-Count
    ViteProxy-->>ApiClient: response
    ApiClient->>ApiClient: check 401 → auto-logout
    ApiClient-->>TanStackQuery: typed response
    TanStackQuery-->>Component: data / isLoading / isError
    Component->>ZustandStore: update global state (e.g. newAlertCount)
    Component->>User: renders
```

---

## 5. Authentication Flow

Login → JWT → localStorage → bootstrap → route guard.

```mermaid
sequenceDiagram
    participant User
    participant LoginPage
    participant AuthStore as "auth.store"
    participant LocalStorage as "localStorage"
    participant ApiClient as "apiClient.ts"
    participant Backend

    User->>LoginPage: POST credentials
    LoginPage->>ApiClient: POST /api/authenticate
    ApiClient->>Backend: request
    Backend-->>ApiClient: { id_token }
    ApiClient-->>LoginPage: { id_token }
    LoginPage->>AuthStore: setUser(user, token)
    AuthStore->>LocalStorage: localStorage[hivearmor_auth_token] = token
    AuthStore->>AuthStore: isAuthenticated = true
    LoginPage->>User: navigate('/command')

    note over AuthStore,LocalStorage: On next page load
    AuthStore->>LocalStorage: read hivearmor_auth_token
    AuthStore->>ApiClient: GET /api/account
    ApiClient-->>AuthStore: { login, roles }
    AuthStore->>AuthStore: isLoading = false
```

**DEBT-14 gap:** Backend regenerates JWT signing key on restart. All stored tokens become invalid. Fix: persist signing key in database or environment variable.

---

## 6. Tenant-Context Flow

Current state (header sent, not enforced) vs target state (full per-tenant isolation).

```mermaid
graph LR
    subgraph "CURRENT STATE — Security Theater"
        AuthStoreCurrent["auth.store\nselectedTenantId"]
        ApiClientCurrent["apiClient.ts\n X-Tenant-ID injected\n(when selectedTenantId != null)"]
        BackendCurrent["Backend\nX-Tenant-ID IGNORED\nNo filter applied"]
        DBCurrent["PostgreSQL / OpenSearch\nALL tenant data returned"]
    end

    subgraph "TARGET STATE — Full Isolation"
        AuthStoreTarget["auth.store\nselectedTenantId"]
        ApiClientTarget["apiClient.ts\nX-Tenant-ID injected"]
        BackendTarget["Backend\nTenantFilter.java\napplied to ALL queries"]
        DBTarget["PostgreSQL\ntenant_id RLS policy"]
        OSTarget["OpenSearch\ntenant_id term filter\nin every DSL query"]
        SseTarget["SSE stream\nfiltered by tenant_id"]
    end
```

**Gap:** TENANT-01 through TENANT-07 — 6 missing implementations. Full MSSP work estimated at ~21 sessions (FS-01, FS-17).

---

## 7. Permission Flow

Roles → frontend guards → backend enforcement (current gaps annotated).

```mermaid
graph TD
    RolesTs["roles.ts\nhasRoleLevel(user, requiredRole)"]
    AuthGuard["AuthGuard.tsx\nrole-based route blocking"]
    ComponentGate["Component-level gates\nconditional render of actions"]
    BackendAnnotation["@PreAuthorize on backend\n(37/160 endpoints currently annotated)"]
    GlobalCatchAll["Global catch-all\nhasAnyRole(ADMIN,USER)\n(~123 unprotected endpoints)"]

    RolesTs --> AuthGuard
    RolesTs --> ComponentGate
    AuthGuard -->|"blocked"| AccessDeniedPage
    ComponentGate -->|"hidden"| HiddenAction
    ComponentGate -->|"shown + clicked"| BackendAnnotation
    ComponentGate -->|"shown + clicked"| GlobalCatchAll

    style GlobalCatchAll fill:#ff9999
    style BackendAnnotation fill:#99ff99
```

**Critical gaps:** BE-01, BE-02, BE-04, BE-05, BE-07, BE-12 — 6 endpoints fully unprotected with no `@PreAuthorize`. Any authenticated user can invoke these.

---

## 8. Real-Time Event Flow

SSE streams → Zustand stores → StatusDock + CommandCenterPage.

```mermaid
graph LR
    SSEAlerts["/api/alerts/stream\nEventSource"]
    SSEEps["/api/eps/stream\nEventSource"]
    UseAlertStream["useAlertStream hook\n(reconnect, parse JSON)"]
    UseEpsStream["useEpsStream hook\n(reconnect, parse number)"]
    AlertStreamStore["alertStream.store\nnewAlertCount\nlatestEvent"]
    StatusDock["StatusDock.tsx\nfixed 28px bottom bar\nSSE state + EPS"]
    CommandCenter["CommandCenterPage\nlive alert stream\nEPS chart"]
    AlertsListPage["AlertsListPage\nLiveModeToggle"]

    SSEAlerts --> UseAlertStream
    SSEEps --> UseEpsStream
    UseAlertStream --> AlertStreamStore
    UseEpsStream --> StatusDock
    AlertStreamStore --> StatusDock
    AlertStreamStore --> CommandCenter
    AlertStreamStore --> AlertsListPage
```

**Gap:** `EpsChart` in CommandCenterPage has `data=[]` hardcoded — EPS historical data not wired (FE-23). SSE connection auth: EventSource does not support custom headers; relies on cookie or URL param — current implementation must be audited for production auth.

---

## 9. Grid Adapter — SiemDataGrid Bridge

Current InfiniteRowModel workaround vs AG Grid Enterprise target.

```mermaid
graph TD
    SpecRequirement["Spec: IServerSideDatasource\nAG Grid Enterprise SSRM"]
    CurrentImpl["CURRENT: SiemDataGrid.tsx\nIServerSideDatasource interface\n→ mapped to IDatasource\n(InfiniteRowModel — Community)"]
    LimitedFeatures["Limitations:\n- No grouped rows\n- No master-detail\n- No tree data\n- X-Total-Count header required"]
    TargetEnterprise["TARGET (if licence acquired):\nSSRM with proper grouping\nmaster-detail for incident→alerts\ntree data for entity hierarchy"]
    TargetCommunity["TARGET (if Community accepted):\nDocument InfiniteRowModel constraints\nUpdate spec to remove Enterprise features"]

    SpecRequirement --> CurrentImpl
    CurrentImpl --> LimitedFeatures
    LimitedFeatures --> TargetEnterprise
    LimitedFeatures --> TargetCommunity
```

**Decision required:** DEC-01 — AG Grid Enterprise licence vs Community continuation. Blocking grouped views and master-detail expansion.

---

## 10. Dashboard Persistence Flow

GridStack layout → dashboards service → backend API.

```mermaid
sequenceDiagram
    participant User
    participant DashboardViewPage
    participant GridStack
    participant DashboardsService as "dashboards.service"
    participant ApiClient
    participant Backend
    participant PG as "PostgreSQL UtmDashboard"

    User->>GridStack: drag widget / resize
    GridStack->>DashboardViewPage: onDragStop / onResizeStop callback
    DashboardViewPage->>DashboardsService: updateDashboard(id, layout)
    DashboardsService->>ApiClient: PUT /api/ha-dashboards
    ApiClient->>Backend: request
    Backend->>PG: save layout JSON
    PG-->>Backend: OK
    Backend-->>ApiClient: updated dashboard
    ApiClient-->>DashboardViewPage: success

    note over DashboardViewPage: GAP_SEC_06_RESOLVED=false\nblocks all widget rendering\nuntil SEC-GAP-15 is fixed
```

**Target gap:** `DashboardStudioPage` does not exist (CONTRADICTION-07). No draft/publish workflow exists (DASH-05).

---

## 11. Error-Handling Model

```mermaid
graph TD
    ApiError["ApiError class\n(status, message, detail)"]
    ApiClientCheck["apiClient.ts\n401 → auto-logout\n403 → ApiError thrown\n5xx → ApiError thrown"]
    QueryClient["queryClient\nretry: 1 (default)\nonError: global handler"]
    ComponentState["Component isError state\nErrorState component rendered"]
    ToastStore["toastStore.ts\nINMEMORY STUB — NOT RENDERED\n(CONTRADICTION-03)"]
    UserVisible["User sees\nErrorState inline component"]

    ApiClientCheck --> ApiError
    ApiError --> QueryClient
    QueryClient --> ComponentState
    QueryClient --> ToastStore
    ComponentState --> UserVisible
    ToastStore -.->|"stub — invisible"| UserVisible

    style ToastStore fill:#ffcccc
```

**Target state:** `<ToastStack>` mounted in `AppLayout.tsx`; `toastStore` connected to PatternFly `AlertGroup` for visible, accessible toast notifications.

---

## 12. State-Management Boundaries

| Data Type | Where It Lives | Justification |
|---|---|---|
| JWT token | `localStorage[hivearmor_auth_token]` | Survives page reload; single source of truth |
| Auth user + roles | `auth.store` (Zustand) | Global; needed everywhere |
| Selected tenant ID | `auth.store` (Zustand) | Global MSSP context |
| Alert list pages | TanStack Query cache | Server state; auto-invalidate on mutations |
| Incident list + detail | TanStack Query cache | Server state with staleTime |
| New alert count (SSE) | `alertStream.store` (Zustand) | Real-time; not server-state |
| Sidebar collapse state | `sidebar.store` (Zustand) | UI preference |
| Row density | `localStorage[ha_row_density]` | Persisted UX preference |
| Dashboard layout | TanStack Query cache (synced to backend) | Server state |
| Toast queue | `toastStore` (Zustand) — currently stub | Transient UI state |
| Investigation session | TanStack Query cache | Server state |
| Monaco editor content | Component state | Local; not persisted |

**Rule:** Never put server data in Zustand. Never put transient UI state in TanStack Query. Never put alert/incident payloads in localStorage.

---

## 13. Test Architecture

| Layer | Current | Target |
|---|---|---|
| Unit (lib, services) | Vitest + jsdom — 204 tests | Same, expand to 80%+ coverage |
| Component | Vitest + @testing-library/react | Add Storybook stories for all 20+ Ha* components |
| Integration | None | Vitest + MSW mock server for service/hook paths |
| E2E | None | Playwright — 5 critical journeys |
| Accessibility | None | axe-core in Vitest + Playwright |
| Visual regression | None | Chromatic (preferred) or Playwright screenshots |
| Performance | None | Lighthouse CI on every PR |
| Dead test discovery | None | CI check: `.skip.ts` files must have 0 `node:test` imports |

**Current gap:** 3 `.skip.ts` files use `node:test` (TI-01); no Storybook (TI-02); no Playwright (TI-03); no axe-core (TI-04); 0 of 550 golden screens (TI-05).

---

## 14. Deployment Boundary

```mermaid
graph LR
    ViteBuild["npm run build\nVite production build\noutput: dist/"]
    Docker["Dockerfile\nnginx:alpine base"]
    NginxConf["nginx.conf\n- serve dist/ as static\n- proxy /api/* → backend:8088\n- SPA fallback: try_files → index.html"]
    CDN["Optional: CDN\nstatic asset caching"]
    Backend["Backend container\nSpring Boot :8088"]

    ViteBuild --> Docker
    Docker --> NginxConf
    NginxConf --> CDN
    NginxConf -->|"/api/* proxy_pass"| Backend
```

**Current bundle size:** 4.1 MB (all routes eagerly loaded — PERF-01). Target after route code splitting: initial load < 500 KB JS. Each lazy route chunk < 100 KB.

---

## Architecture Decision Points Required Before Implementation

| Decision | Impact | Blocking Horizon |
|---|---|---|
| DEC-01: AG Grid Enterprise licence | Grid grouping, master-detail | H2 |
| DEC-02: MSSP tenant architecture | All MSSP work | H6 |
| DEC-03: Persistent JWT key design | Auth reliability | H0 |
| DEC-07: Parser DSL language | Parser Intelligence | H5 |
| DEC-08: Neo4j schema definition | Threat Constellation | H3 |

Refer to document 22 for full decision register.
