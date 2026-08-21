# HiveArmor login and dashboard review

## Delivered experience

Phase 1 establishes Hive Carbon Hybrid as the customer-facing visual foundation and implements the reusable shell, premium enterprise login, and canonical Mission Control dashboard without changing backend services.

### Login `/login`

- Balanced two-panel enterprise layout at desktop widths.
- Restrained honeycomb structure and a hexagonal product mark; no animated decoration or continuous glow.
- Real JWT authentication, account hydration, OIDC/PKCE providers, and MFA routing are preserved.
- Work email/username and password labels, password-manager autocomplete, keyboard-operable visibility toggle, remember-device value, generic errors, locked/session-expired/service-unavailable guidance, loading/disabled controls, and SSO actions.
- Tablet/mobile collapses to a focused single-panel form at 940px.

### Application shell

- 64px matte masthead with product identity, real tenant selection state, environment context, global search route, pipeline health, live EPS, notifications, help, and user profile.
- 72px collapsed navigation rail and 256px expanded navigation.
- Navigation starts collapsed, expands on pointer hover or keyboard focus, and can be pinned open or returned to auto-collapse.
- Existing operational routes, role gates, AirGap banner, toasts, auth bootstrap, and suspense remain intact.

### Dashboard `/dashboard`

- `/dashboard` is canonical; `/command` redirects for compatibility.
- Six primary operational metrics, never more.
- Alert/incident trend with legend, tooltip, text summary, and accessible description.
- Ranked priority work with severity, type, tenant, owner, age/SLA context, and drill-down.
- Operational health, analyst workload, and recent activity sections.
- Honest loading, empty, partial failure, full failure, stale/disconnected, and refresh states.
- Stable fictional records are isolated behind `VITE_USE_FOUNDATION_FIXTURES=true` and visibly labelled as demonstration data.
- In normal production mode, real alert summary, incident list, EPS, and stream status remain connected. Unsupported historical, workload, and activity datasets render honest unavailable states.

## Visual validation

The browser was run against two local Vite sessions: an explicitly labelled fixture session for populated visual review and a normal production-mode session backed by a local validation API for loading/error checks. No backend source was changed.

Reviewed:

- Alignment and surface rhythm at 1920, 1440, 1280, and 1024 dashboard viewports.
- Login composition at 1440, 1024, and 390 widths.
- True breakpoint reflow verified after viewport reload; a scaled pre-reflow mobile capture was rejected and replaced.
- Collapsed and pinned-expanded navigation.
- Populated, loading, and full-error dashboards.
- Default and validation-error login states.
- Long fictional tenant and work-item names, metadata truncation, and scroll boundaries.

Dashboard bitmap dimensions may exclude the browser's native scrollbar pixels even though the CSS viewport was set to the named size. Login captures have the exact requested dimensions.

## Screenshot inventory

### Login

- `docs/screenshots/hivearmor-foundation/login-1440x900-default.png`
- `docs/screenshots/hivearmor-foundation/login-1024x768-default.png`
- `docs/screenshots/hivearmor-foundation/login-390x844-default.png`
- `docs/screenshots/hivearmor-foundation/login-1440x900-validation.png`

### Dashboard

- `docs/screenshots/hivearmor-foundation/dashboard-1920x1080-populated.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1440x900-populated.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1280x800-populated.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1024x768-populated.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1440x900-nav-expanded.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1440x900-loading.png`
- `docs/screenshots/hivearmor-foundation/dashboard-1440x900-error.png`

## Accessibility validation

- WCAG 2.2 AA contrast values are recorded in `hivearmor-colour-system.md`.
- Primary buttons use the mode-aware `action.primary` and `foreground.onAction` token pair.
- Axe structural checks for login and dashboard report no serious or critical WCAG A/AA violations. The jsdom test disables Axe's colour-contrast rule because jsdom has no layout/canvas implementation; colour is validated separately by the documented luminance calculations and screenshot review.
- Keyboard-focused tests cover password visibility, nav pinning, active route, and hover/focus expansion behavior.
- Chart includes a text alternative and reduced-motion behavior.
- Status uses label plus marker plus colour.

## Verification results

- TypeScript: passed.
- ESLint: passed with zero warnings.
- Focused foundation tests: 12/12 passed before accessibility additions.
- Full Vitest suite: 142 files, 889 tests passed.
- Production build: passed.
- Responsive screenshots: 11 accepted captures.

## Known limitations

1. Historical alert/incident trend, analyst-capacity, and consolidated activity APIs are not present in the discovered contract. Production does not substitute fixtures for them.
2. The tenant selector reflects the real selected tenant state but cannot enumerate tenant names until a tenant-directory contract is connected.
3. Inter is the approved typeface in the existing stack but is not bundled in this frontend folder; production should self-host approved font files.
4. Below the supported 1024px dense-workflow width, the dashboard is a limited readable view rather than a full mobile SOC workstation.
5. Other existing routes inherit the semantic aliases but have not received page-by-page visual regression work in Phase 1.

## Recommended next design

Incident Details is the best next page. It is the primary drill-down from Mission Control and should unify evidence, timeline, entities, MITRE context, ownership, SLA, notes, and response actions using this foundation. The earlier reference image can inform information hierarchy while HiveArmor retains its own Hive Carbon Hybrid visual language.
