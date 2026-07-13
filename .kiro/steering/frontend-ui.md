---
inclusion: fileMatch
fileMatchPattern: "frontend/**"
---

# Frontend / UI Conventions

## Stack (do not upgrade without a dedicated plan)

| Tool | Version | Constraint |
|---|---|---|
| Angular | **17.3.12** | Phase 5d complete — next: 5e (Angular 18/19, optional) |
| TypeScript | **5.4.5** | Required by Angular 17 (needs ≥5.2.0, <5.5.0) |
| Node.js | **20.20.2 LTS** | Use `nvm use 20` |
| Build heap + OpenSSL | 8 GB + legacy flag | `NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm run build` — still required (webpack browser builder) |
| Linter | **ESLint 8 + @angular-eslint/17** | `npm run lint` |
| RxJS | **7.8.1** | No change from Phase 5c |
| CSS pre-processor | **sass 1.101.0** (dart-sass) | Migrated from node-sass in Phase 1 |
| Bootstrap | **5.3.3** | Phase 10 — Bootstrap 4→5 upgrade; jQuery + tether removed |
| ng-bootstrap | **16.0.0** | Phase 10 — supports Angular 17 + Bootstrap 5 |
| Toastr | **ngx-toastr 16** | Migrated from ng6-toastr-notifications in Phase 5c |
| ECharts | **echarts 5.6.0** + **ngx-echarts 14** | Phase 9 — ECharts 4→5 upgrade |
| echarts-wordcloud | **2.1.0** | Phase 9 — updated for ECharts 5 |
| echarts-extension-leaflet | **1.2.2** | Phase 9 — replaces echarts-leaflet (ECharts 5 compatible) |
| zone.js | **0.14.10** | Import path changed: `import 'zone.js'` (not `zone.js/dist/zone`) |
| Tests | Karma + Jasmine | 26 specs passing (T-004, T-005, pre-existing fixed) |

## Module Layout

```
frontend/src/app/
├── core/              auth guards, interceptors, AccountService
├── shared/            UtmSharedModule (~120 components, pipes, directives)
├── blocks/            HTTP interceptors + HttpCancelService
├── dashboard/         overview KPIs + custom dashboards
├── data-management/   alert management, adversary tracking, file views
├── incident/          case management
├── incident-response/ SOAR — automation, playbooks, interactive console
├── log-analyzer/      raw log search (OpenSearch-backed)
├── compliance/        compliance views + PDF report scheduling
├── rule-management/   correlation rule editor
├── app-module/        integration guides + module enable/disable UI
├── admin/             user management (ADMIN only)
├── graphic-builder/   chart + dashboard builder
└── [feature modules]  one lazy-loaded NgModule per route
```

Disabled — code kept, routes commented out: `scanner/`, `vulnerability-scanner/`, `report/`, `filebrowser/`

## Routing Conventions

- All protected routes guard via `UserRouteAccessService` (`canActivate`)
- Lazy-load syntax: `loadChildren: () => import('./path/file.module').then(m => m.ClassName)` (function form — migrated in Phase 5b from Angular 7 string form)
- Two roles: `ROLE_USER`, `ROLE_ADMIN`. `/management` is ADMIN-only.
- Register every new lazy-loaded module in `frontend/src/app/app-routing.module.ts`
- Do not uncomment disabled routes without test coverage

## State Management

No NgRx. State lives in root-provided RxJS services:

| Service | What it holds |
|---|---|
| `AccountService` | Authenticated user identity and roles |
| `NavBehavior` | Navigation / sidebar state |
| `MenuBehavior` | Menu item active state |
| `NewAlertBehavior` | Real-time unread alert count |
| `DashboardBehavior` | Current active dashboard |
| `AlertIncidentStatusChangeBehavior` | Cross-component status sync |

Add new application-state as a root `BehaviorSubject` service, not ad-hoc `@Input`/`@Output` chains.

## Auth (UI side)

- Login posts to `POST /api/authenticate`; if TFA required, flow continues at `/totp`
- JWT stored in `sessionStorage` AND `localStorage`; key = `<HOSTNAME_UPPERCASE>_AUTH_TOKEN`
- Cookie `utmauth` also set (used by web-pdf for authenticated report rendering)
- `AuthInterceptor` — attaches `Authorization: Bearer <token>` + `Utm-Internal-Key` header to every API call
- `AuthExpiredInterceptor` — any 401/403 triggers logout and cancels pending requests
- See `frontend/src/app/app.constants.ts` for token key names

## Design System — Colors

**Single source of truth**: `frontend/src/styles/_tokens.scss`

```scss
// ALWAYS use tokens
color: $text-primary;
background: $surface-elevated;
border-color: $border-base;

// NEVER hardcode hex values
color: #DDE6FF;          // ✗
```

Key token groups:
- Surfaces: `$bg-body`, `$bg-sidebar`, `$bg-card`, `$bg-elevated`, `$bg-hover`
- Accent: `$accent` (primary blue)
- Severity (SOC-standard — do not repurpose): `$sev-critical`, `$sev-high`, `$sev-medium`, `$sev-low`
- Text: `$text-primary` (`$text-100`), `$text-secondary` (`$text-200`), `$text-tertiary` (`$text-300`)
- Status: `$ok`, `$danger`, `$warn`
- Legacy aliases exist in `_tokens.scss` — prefer the primary names in new code

## Shared Components — Use Before Creating

| Component | Use it for |
|---|---|
| `UtmDynamicTableComponent` | Any data table |
| `ElasticFilterComponent` | OpenSearch-backed filter panels |
| `DateRangeComponent` / `TimeFilterComponent` | Date/time selection |
| `ModalConfirmationComponent` | Destructive action confirmation modals |
| `UtmSearchInputComponent` | Inline text search fields |
| `KpiComponent` | Summary stat cards |
| `NoDataFoundComponent` | Empty state placeholder |
| `HasAnyAuthorityDirective` | Role-based element visibility |
| `UtmAgentConsoleComponent` | Remote command execution UI |

If a component is used in 2+ modules, declare and export it from `UtmSharedModule`.

## Angular 17 Patterns (follow these — do not introduce standalone components yet)

```typescript
// Module definition — always @NgModule, never standalone (until Phase 5e+)
@NgModule({ declarations: [...], imports: [...], exports: [...] })

// Lazy loading — function form (migrated from Angular 7 string syntax in Phase 5b)
{ path: 'alerts', loadChildren: () => import('./alerts/alerts.module').then(m => m.AlertsModule) }

// DI — constructor injection only, no inject()
constructor(private myService: MyService) {}

// HTTP — HttpClient in service constructor, return Observable
getData(): Observable<Item[]> {
  return this.http.get<Item[]>(`${SERVER_API_URL}api/items`);
}

// Route guard — implement CanActivate interface
canActivate(route, state): boolean | Promise<boolean> { ... }

// Test stubs for @ng-bootstrap/ng-bootstrap@4 directives with exportAs
// (NgbModule is not Angular 17 Ivy compatible — use stubs in specs)
@Directive({selector: '[ngbPopover]', exportAs: 'ngbPopover'})
class NgbPopoverStub { open() {} close() {} toggle() {} isOpen() { return false; } }
```

## Bundle Size

- Warning threshold: 10 MB. Error threshold: 15 MB (both configured in `angular.json`).
- Before adding a new npm dependency, verify its minified+gzipped size.
- Monaco Editor is pre-copied from `node_modules/monaco-editor/min/vs` → `assets/monaco/vs` at build time; do not import it dynamically.

## Constants

| File | Contains |
|---|---|
| `app/app.constants.ts` | `SERVER_API_URL`, `SESSION_AUTH_TOKEN`, `COOKIE_AUTH_TOKEN`, `ACCESS_KEY` |
| `shared/constants/global.constant.ts` | `USER_ROLE`, `ADMIN_ROLE`, `DEMO_URL`, `ONLINE_DOCUMENTATION_BASE`, `MAX_SEARCH_RESULTS` |
| `shared/constants/app-routes.constant.ts` | Route path constants, `BYPASS_ROUTES` (interceptor skip list) |
| `shared/constants/utm-color.const.ts` | `UTM_COLOR_THEME[]` — ECharts chart palette |

## Build Commands

```bash
cd frontend
nvm use 20
npm install
npm start                                                                          # dev server
NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm run build  # production build
npm run lint                                                                       # ESLint (@angular-eslint/16) — Phase 5c
npm test -- --watch=false                                                          # Karma (CI mode)
```
