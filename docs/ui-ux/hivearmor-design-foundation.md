# HiveArmor Phase 1 design foundation

## Repository architecture discovered

- Active frontend: `frontend-v3`.
- Runtime: React 18.3.1 with TypeScript 5.5.3.
- Build: Vite 8.1.5 and npm scripts.
- Routing: React Router 6.25 with lazy route modules and `AuthGuard`.
- Client state: Zustand 5 release candidate.
- Server state: TanStack Query 5.51.
- UI: PatternFly 6.1 plus repository-owned `Ha*` components.
- Charts: ECharts 5.5.1 through `echarts-for-react` and a centralized HiveArmor theme.
- Data grid: AG Grid Community 36.
- Icons: Lucide React plus PatternFly icons.
- Authentication: real JWT flow using `hivearmor_auth_token`, `/api/authenticate`, `/api/account`, OIDC/PKCE provider discovery, and MFA.
- Live telemetry: authenticated fetch-based SSE hooks for alert and EPS streams.
- Testing: Vitest 4.1, jsdom, Testing Library, MSW, Playwright, axe-core, and Storybook 10.5 with the accessibility addon.

## Preserve

- Backend services and API contracts.
- JWT, account bootstrap, role guards, MFA, OIDC/PKCE, SSE, and tenant state.
- Existing React/Vite/TypeScript architecture.
- PatternFly, ECharts, AG Grid, Lucide, TanStack Query, and Zustand dependencies.
- `src/styles/tokens.css`, which is repository-marked immutable.
- Existing operational pages and their routes.

## Modify

- Layer a new semantic foundation after the immutable tokens.
- Make `/dashboard` the canonical Mission Control route while preserving `/command` as a redirect.
- Refine the existing `AppLayout`, `HaNavigation`, `HaMasthead`, `HaAuthContainer`, and `LoginPage`.
- Recompose `CommandCenterPage` around shift decisions while continuing to use real query and streaming integrations.
- Resolve ECharts and Monaco colours from the centralized semantic token layer.

## New files

- `src/styles/foundation.css`
- `src/router/AppLayout.css`
- `src/components/ha-navigation/HaNavigation.css`
- `src/components/ha-masthead/HaMasthead.css`
- `src/pages/command-center/CommandCenterPage.css`
- `src/pages/command-center/commandCenter.fixtures.ts`
- Phase 1 documentation under `docs/ui-ux/`

## Existing capabilities used

- Accessible lazy routing, role protection, and a skip link.
- Real auth and SSO hooks.
- Real alert summary, incident list, EPS, health, and alert streams.
- Existing toast, banner, empty/error state, suspense, and chart primitives.
- Responsive CSS, reduced-motion media queries, unit/integration tests, Storybook a11y, Playwright, and axe.

## Missing capabilities and safe handling

- The current API contract does not expose a historical alert/incident time-series, analyst-capacity summary, or consolidated activity stream. These panels show honest unavailable states in production.
- Stable fictional records are isolated in `commandCenter.fixtures.ts`, enabled only by `VITE_USE_FOUNDATION_FIXTURES=true`, and visually labelled “Demonstration data.”
- No tenant-directory endpoint is wired into the masthead; it displays the real selected tenant identifier when one exists and otherwise scopes to “All authorized tenants.”
- Password recovery remains organization-managed because no confirmed reset route was discovered in the Phase 1 frontend flow.

## Risks

- `frontend-v3` is untracked in the current worktree, and the repository contains extensive unrelated user changes. Phase 1 intentionally touches only the active frontend and documentation paths.
- Existing pages still consume some legacy aliases. `foundation.css` maps those aliases to Hive Carbon Hybrid, while route-level styles consume the newer semantic roles directly.
- Inter is specified in the existing stack but not bundled in this frontend folder. A production font asset and license notice should be added through the organization's approved asset pipeline.
- Several legacy components contain inline style values. Phase 1 centralizes all new work; full application token migration is a later program.

## Implementation sequence

1. Audit architecture and integrations.
2. Research current enterprise SIEM interaction patterns and WCAG 2.2.
3. Compare the SOC-derived teal direction with Hive Carbon Hybrid and select Hive Carbon Hybrid.
4. Add semantic tokens, typography, spacing, geometry, and chart theme.
5. Implement matte shell, collapsed/hover-expanded navigation, masthead, tenant/environment/search context.
6. Redesign the login while preserving real JWT, SSO, and MFA flows.
7. Recompose `/dashboard` with real API states and isolated deterministic fixtures.
8. Validate 1920, 1440, 1280, and 1024 dashboard layouts plus tablet/mobile login.
9. Run type-check, lint, tests, accessibility checks, and production build.
10. Capture and review screenshots, then document limitations and next steps.

## Responsive and interaction foundation

- Masthead: 50px.
- Sidebar: 72px collapsed, 256px expanded.
- Sidebar starts collapsed and expands on pointer hover or keyboard focus; the footer control pins expanded/collapsed state.
- Dashboard uses six-to-three-to-two-to-one metric columns as space decreases and stacks secondary panels below 1180px.
- At 1024px the navigation remains a rail, the dashboard toolbar wraps, the priority stream removes low-priority metadata, and horizontal page overflow is avoided.
- Below operational desktop widths the dashboard remains readable but is not positioned as a full mobile SOC workstation.
- Login changes from a two-panel enterprise composition to a single-panel tablet/mobile layout at 940px.

## Accessibility foundation

- Semantic landmarks, headings, forms, lists, tables-as-lists, and links.
- Skip navigation and keyboard-operable hover/focus expansion.
- Visible focus treatment using the semantic teal focus token.
- Labels, autocomplete, generic authentication errors, password visibility control, and status banners.
- Severity is text plus a square marker plus colour; connection state is text plus a dot plus colour.
- Chart has an accessible name and text description; reduced motion disables chart/skeleton animation.
- Selected text values pass WCAG AA on primary surfaces; contrast values are documented in the colour decision.

## Backend boundaries

No backend service, security control, endpoint, authentication contract, credential storage mechanism, or response action was changed. Unsupported production states are described honestly rather than filled with fictional operational data.
