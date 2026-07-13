# 02 — UI Feature Map

## Framework

- **Angular 7.2.0**, TypeScript 3.2.2, Node 14.16.1
- **Build**: `ng build --prod` (Angular CLI 7.3.6), 8 GB heap required
- **Output**: `dist/utm-stack/`
- **CSS**: SCSS via node-sass 4.x; design tokens in `frontend/src/styles/_tokens.scss`
- **Linter**: TSLint 5.11.0 (NOT ESLint)
- **i18n**: `@ngx-translate` with `assets/i18n/en.json` — English only; most UI text is hardcoded in templates

---

## App Module Structure

```
frontend/src/app/
├── account/              User account (profile, settings)
├── active-directory/     AD dashboard, notifications, reports, tracker, view
├── admin/                User management, system administration
├── app-management/       API keys, app config, logs, metrics, theme, health, menus, rollover
├── app-module/           Integration guides, module views and configuration
├── assets-discover/      Data sources, asset groups, collectors, source configuration
├── automation-variables/ SOAR automation variables
├── blocks/               HTTP interceptors, global services (infrastructure)
├── compliance/           Compliance views, management, reports, schedules, templates
├── core/                 Auth guards, interceptors, modal, tracker
├── dashboard/            Overview KPIs, custom dashboards, log source views, export
├── data-management/      Alert management, adversary management, file management
├── defined-charts/       Predefined chart type components
├── filebrowser/          Rule file management [ROUTE DISABLED]
├── graphic-builder/      Chart builder, dashboard builder, visualization editor
├── incident/             Incident (case) management
├── incident-response/    SOAR: automation, commands, playbooks, interactive console
├── license/              License management
├── log-analyzer/         Log explorer, search, queries
├── logstash/             Data parsing filters and pipelines (config plugin)
├── report/               Report templates [ROUTE DISABLED]
├── rule-management/      Alerting and correlation rules
├── scanner/              Vulnerability scanner [ROUTE DISABLED]
├── shared/               ~120 reusable components, directives, pipes, services
├── threatwind/           Threat intelligence feeds (ThreatWinds)
└── vulnerability-scanner/ Vulnerability scanning [ROUTE DISABLED]
```

---

## Routing Map

All routes use `UserRouteAccessService` guard and Angular 7 lazy-loading (`loadChildren` string syntax).

| Route | Module | Roles | Status |
|---|---|---|---|
| `/` | → `/login` redirect | public | Active |
| `/dashboard` | `UtmDashboardModule` | USER, ADMIN | Active |
| `/data` | `DataManagementModule` | USER, ADMIN | Active |
| `/profile` | `UtmAccountModule` | USER, ADMIN | Active |
| `/data-sources` | `AssetsDiscoverModule` | USER, ADMIN | Active |
| `/management` | `AdminModule` | ADMIN only | Active |
| `/creator` | `GraphicBuilderModule` | USER, ADMIN | Active |
| `/app-management` | `AppManagementModule` | USER, ADMIN | Active |
| `/integrations` | `AppModuleModule` | USER, ADMIN | Active |
| `/variables` | `AutomationVariablesModule` | USER, ADMIN | Active |
| `/active-directory` | `ActiveDirectoryModule` | USER, ADMIN | Active |
| `/discover` | `LogAnalyzerModule` | USER, ADMIN | Active |
| `/compliance` | `ComplianceModule` | USER, ADMIN | Active |
| `/data-parsing` | `LogstashModule` | USER, ADMIN | Active |
| `/soar` | `IncidentResponseModule` | USER, ADMIN | Active |
| `/incident` | `IncidentModule` | USER, ADMIN | Active |
| `/getting-started` | `WelcomeToUtmstackComponent` | USER, ADMIN | Active |
| `/threat-intelligence` | `ThreatWindModule` | USER, ADMIN | Active |
| `/alerting-rules` | `RuleManagementModule` | USER, ADMIN | Active |
| `/iframe` | `AlertManagementModule` | USER, ADMIN | Active |
| `/totp` | `TotpComponent` | public | Active |
| `/enroll-tfa` | `TfaSetupComponent` | public | Active |
| `/reset/finish` | `PasswordResetFinishComponent` | public | Active |
| `/confirm-identity/:id` | `ConfirmIdentityComponent` | public | Active |
| `/module-disabled` | `UtmModuleDisabledComponent` | public | Active |
| `/lite-mode` | `UtmLiteVersionComponent` | public | Active |
| `/vulnerability-scanner` | `VulnerabilityScannerModule` | USER, ADMIN | **DISABLED** |
| `/reports` | `ReportModule` | USER, ADMIN | **DISABLED** |
| `/explore` | `FileBrowserModule` | USER, ADMIN | **DISABLED** |

---

## Authentication Flow (UI)

1. User visits `/` → redirected to `/login`
2. `LoginComponent` posts credentials to `POST /api/authenticate`
3. If TFA required → redirected to `/totp`
4. If first login (admin default email) → redirected to `/getting-started`
5. Otherwise → `/dashboard/overview`

**Token storage**: JWT stored in both `sessionStorage` and `localStorage`. Key name = `<window.hostname.toUpperCase()>_AUTH_TOKEN`. Also set as `utmauth` cookie.
**Interceptors**: `AuthInterceptor` attaches `Authorization: Bearer <JWT>` on all API calls; `AuthExpiredInterceptor` auto-logs out on 401/403.
**SAML2 SSO**: `LoginProvidersComponent` shown on login screen when IdPs configured.

---

## State Management

No NgRx. State is managed via:

| Service/Behavior | State | Provider scope |
|---|---|---|
| `AccountService` | Authenticated user identity, roles | root |
| `NavBehavior` | Navigation state | root |
| `NewAlertBehavior` | New alert notification count | root |
| `AlertIncidentStatusChangeBehavior` | Alert/incident status sync | root |
| `GettingStartedBehavior` | Onboarding flow state | root |
| `DashboardBehavior` | Active dashboard state | root |
| `MenuBehavior` | Sidebar menu state | root |
| `VersionUpdateBehavior` | Version update notifications | root |

---

## Shared Module (`UtmSharedModule`)

The central shared module declares and exports ~120+ reusable components. Key groups:

**Layout**: `HeaderComponent`, `SidebarComponent`, `FooterComponent`, `UtmLeftNavComponent`, `UtmBreadcrumbBarComponent`

**Auth components**: `LoginComponent`, `TotpComponent`, `TfaSetupComponent`, `PasswordResetInitComponent`, `PasswordResetFinishComponent`, `LoginProvidersComponent`

**Data display**: `UtmDynamicTableComponent`, `UtmTableDetailComponent`, `UtmJsonDetailViewComponent`, `NoDataFoundComponent`, `NoDataChartComponent`

**Filters**: `ElasticFilterComponent`, `ElasticFilterTimeComponent`, `DateRangeComponent`, `TimeFilterComponent`, `RefreshFilterComponent`

**Charts**: `KpiComponent`, `NoDataChartComponent`

**Utilities**: `ModalConfirmationComponent`, `UtmSpinnerComponent`, `UtmSearchInputComponent`, `UtmFileUploadComponent`, `UtmCodeViewComponent`, `UtmAgentConsoleComponent`, `CodeEditorComponent`

**Pipes**: `UtmDatePipe`, `RelativeTimePipe`, `TimezoneOffsetPipe`, `CapitalizePipe`, `HighlightPipe`, `ThousandSuffPipe`, `FilterPipe`, `TimePeriodPipe`

**Directives**: `HasAnyAuthorityDirective`, `HasEnterpriseLicenseDirective`, `IsEnterpriseModuleDirective`, `SortableDirective`, `BadgeTypeDirective`

---

## Key API Calls By Screen

| Screen | Primary API Calls |
|---|---|
| Login | `POST /api/authenticate`, `GET /api/tfa/verify-code` |
| Dashboard overview | `GET /api/utm-dashboard-visualizations`, `GET /api/utm-visualizations`, `GET /api/overview/*` |
| Alert management | `GET /api/utm-alerts`, `GET /api/utm-alert-tags`, `PUT /api/utm-alerts/{id}` |
| Log analyzer | `POST /api/elasticsearch/search`, `GET /api/utm-index-patterns` |
| Incident management | `GET /api/utm-incidents`, `POST /api/utm-incidents`, `GET /api/utm-incident-alerts` |
| SOAR | `GET /api/utm-incident-actions`, `POST /api/utm-incident-jobs` |
| Compliance | `GET /api/utm-compliance-standards`, `GET /api/utm-compliance-report-configs` |
| Data parsing | `GET /api/utm-logstash-filters`, `PUT /api/utm-logstash-filters/{id}` |
| Alerting rules | `GET /api/utm-correlation-rules`, `POST /api/utm-correlation-rules` |
| Integrations | `GET /api/utm-modules`, `PUT /api/utm-modules/{id}` |
| Admin/Users | `GET /api/users`, `POST /api/users`, `GET /api/authorities` |
| App management | `GET /api/utm-configuration-parameters`, `GET /api/utm-api-keys` |

---

## Design System

| Element | Technology | File |
|---|---|---|
| Color tokens | SCSS variables | `src/styles/_tokens.scss` |
| Spacing tokens | SCSS variables (4px grid) | `src/styles/_tokens.scss` |
| Typography | `Inter` (UI), `JetBrains Mono` (data) | `src/styles/_tokens.scss` |
| Severity colors | SCSS variables (`$sev-critical` etc.) | `src/styles/_tokens.scss` |
| Global styles | `src/styles.scss` | Imports all SCSS partials |
| Chart palette | `UTM_COLOR_THEME` array | `shared/constants/utm-color.const.ts` |
| ECharts integration | `ngx-echarts` 4.1.1 | `NgxEchartsModule` |
| Icon font | icomoon | `assets/styles/icons` |
| Flag icons | `flag-icon-css` | npm package |

---

## Browser/Platform Support

- `es5BrowserSupport: true` in `angular.json`
- Target: ES5 via TypeScript compiler
- Polyfills: `src/polyfills.ts`
- No official mobile breakpoint support (desktop-oriented SOC tool)
