# Implementation Plan — Product Rebranding: UTMStack → NilaChakra

## Overview

All tasks are strictly ordered. Phase 0 creates the canonical config files and placeholder logos.
Phase 1 fixes the Broken_State (login page shows "NilaChakra" hardcoded while everything else
says "UTMStack"). Phase 2 replaces frontend strings. Phase 3 replaces backend/email strings.
Phase 4 handles logo renames and CSS class renames. Phase 5 is cleanup and verification.

**Rule:** No phase starts until all tasks in the previous phase pass their checkpoint.
Tasks marked `*` are optional regression guards — recommended but not blocking.
Tasks marked ⚠️ must be applied atomically (all files in one commit).

---

## Phase 0 — Canonical Config + Placeholder Logos

> Creates the two canonical config files and 4 placeholder SVG logos.
> Gate: `branding.ts` exists, all placeholder SVGs render in browser, backend compiles.

- [ ] 1. Create `frontend/src/environments/branding.ts`
  - [ ] 1.1 Create the file with the full `BRANDING` const as specified in Design Component 1
  - [ ] 1.2 Set `productName: 'NilaChakra'`, `productNameShort: 'NC'`, `brandAccent: '#4F8EF7'`
  - [ ] 1.3 Set `supportUrl: 'https://nilachakra.com/contact'`, `docsUrl: 'https://docs.nilachakra.com'`, `demoUrl: 'https://demo.nilachakra.com/'`
  - [ ] 1.4 Set all logo paths to their canonical filenames (`assets/img/logo-full.svg`, etc.)
  - [ ] 1.5 Export `BrandingConfig` type alias
  - [ ] 1.6 Add the warning comment block about `COOKIE_AUTH_TOKEN`, `SESSION_AUTH_TOKEN`, `ACCESS_KEY`
  - _Requirements: 1.1–1.3; Design: Component 1_

- [ ] 2. Create placeholder SVG logo files
  - [ ] 2.1 Create `frontend/src/assets/img/logo-full.svg` — NilaChakra full horizontal placeholder SVG
    (chakra icon + "NilaChakra" wordmark as per Design Component 2)
  - [ ] 2.2 Create `frontend/src/assets/img/logo-icon.svg` — icon-only 40×40 chakra placeholder SVG
  - [ ] 2.3 Create `frontend/src/assets/img/logo-white-full.svg` — white variant of logo-full.svg
    (all `#4F8EF7` colors replaced with `#FFFFFF`)
  - [ ] 2.4 Create `frontend/src/assets/img/logo-white-icon.svg` — white variant of logo-icon.svg
  - [ ] 2.5 Verify each SVG file contains `<!-- PLACEHOLDER: Replace with final NilaChakra logo -->` comment
  - [ ] 2.6 Verify SVGs render correctly in a browser (open file:// or via `npm start`)
  - _Requirements: 2.2; Design: Component 2_

- [ ] 3. Add `application.branding.*` to backend YAML
  - [ ] 3.1 Add the `application.branding` block to `application.yml` with `NilaChakra` defaults
    and `${APPLICATION_BRANDING_NAME:NilaChakra}` environment variable override support
  - [ ] 3.2 Confirm `spring.application.name` still reads `UTMStack-API` (must not change)
  - _Requirements: 6.1, 6.2, 6.4; Design: Component 9_

- [ ] 4. Add `ApplicationProperties.BrandingProperties` inner class
  - [ ] 4.1 Add `BrandingProperties` inner class with `name`, `nameShort`, `supportUrl`, `docsUrl`
  - [ ] 4.2 Add `private final BrandingProperties branding = new BrandingProperties()` field
    and `getBranding()` getter to `ApplicationProperties`
  - [ ] 4.3 Verify `mvn -s settings.xml -B` compiles without error
  - _Requirements: 6.1; Design: Component 9_

- [ ]* 5. Write Phase 0 verification tests
  - [ ]* 5.1 Create `frontend/src/environments/branding.spec.ts` — assert every `BRANDING` key
    is a non-empty string (Property 4)
  - [ ]* 5.2 Assert `BRANDING.productName === 'NilaChakra'` and `BRANDING.productNameShort === 'NC'`
  - _Requirements: Correctness Property 4_

- [ ] 6. Phase 0 checkpoint
  - Run `cd frontend && npm test -- --watch=false` — all 26 specs pass
  - Run `cd backend && mvn -s settings.xml -B` — compiles without error
  - Confirm 4 placeholder SVG files exist in `frontend/src/assets/img/`

---

## Phase 1 — Fix the Broken State (Login Page)

> The login page currently hardcodes "NilaChakra" and `nilachakra-logo.png` inconsistently.
> This phase makes it use `BRANDING` like every other component will.
> Gate: login page displays "NilaChakra" from `BRANDING`, not hardcoded HTML.

- [ ] 7. Fix `login.component.ts` and `login.component.html`
  - [ ] 7.1 Add `import { BRANDING } from '../../../../environments/branding';` to `login.component.ts`
  - [ ] 7.2 Add `public readonly branding = BRANDING;` field to `LoginComponent`
  - [ ] 7.3 In `login.component.html`, replace `<img src="assets/img/login/nilachakra-logo.png" alt="NilaChakra">`
    with `<img [src]="branding.logoPath" [alt]="branding.logoAltText" class="login-logo-img">`
  - [ ] 7.4 Replace `<h1 class="login-title">NilaChakra</h1>` with `<h1 class="login-title">{{ branding.productName }}</h1>`
  - [ ] 7.5 Replace `<p class="login-subtitle">...` tagline with `<p class="login-subtitle">{{ branding.tagline }}</p>`
  - [ ] 7.6 Verify login page renders correctly: open `http://localhost:8880` after rebuild
  - _Requirements: 2.7, 4.1; Design: Component 8_

- [ ]* 8. Write login component spec
  - [ ]* 8.1 Assert login logo `[src]` equals `BRANDING.logoPath` (`assets/img/logo-full.svg`)
  - [ ]* 8.2 Assert login title text contains `BRANDING.productName` (`NilaChakra`)
  - _Requirements: Property 2_

- [ ] 9. Phase 1 checkpoint
  - Build: `NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm run build`
  - Visual verify: login page shows placeholder chakra logo + "NilaChakra" heading
  - Confirm no reference to `nilachakra-logo.png` anywhere in `login.component.html`
  - Run `npm test -- --watch=false` — all tests pass

---

## Phase 2 — Frontend String and Constant Replacement

> Replace all hardcoded "UTMStack" strings in Angular source files.
> Gate: Property 1 grep returns zero results.

- [ ] 10. Update `global.constant.ts`
  - [ ] 10.1 Add `import { BRANDING } from '../../environments/branding';`
  - [ ] 10.2 Replace `DEMO_URL = 'https://demo.utmstack.com/'` with `DEMO_URL = BRANDING.demoUrl`
  - [ ] 10.3 Replace `ONLINE_DOCUMENTATION_BASE = 'https://docs.utmstack.com'` with `ONLINE_DOCUMENTATION_BASE = BRANDING.docsUrl`
  - [ ] 10.4 Remove `SAAS_DEFAULT_PASSWORD = 'DefaultPa$$word!'` entirely (resolves DEBT-20)
  - _Requirements: 1.4, 10.2; Design: Component 4_

- [ ] 11. Update `utm-color.const.ts`
  - [ ] 11.1 Add `import { BRANDING } from '../../environments/branding';`
  - [ ] 11.2 Replace first array entry (`'#03A9F4'` or similar) with `BRANDING.brandAccent`
  - _Requirements: 3.4; Design: Component 6_

- [ ] 12. Update `header.component.ts` and `header.component.html`
  - [ ] 12.1 Import `BRANDING` and add `public readonly branding = BRANDING;` to `HeaderComponent`
  - [ ] 12.2 Replace `<span *ngIf="!logoImage">UTMSTACK</span>` with `<span *ngIf="!logoImage">{{ branding.productName }}</span>`
  - [ ] 12.3 Update `aria-label="UTMStack home"` to `[attr.aria-label]="branding.productName + ' home'"`
  - _Requirements: 9.1, 9.2_

- [ ] 13. Update `AppComponent` document title
  - [ ] 13.1 Import `BRANDING` in `app.component.ts`
  - [ ] 13.2 Inject Angular `Title` service and add `this.titleService.setTitle(BRANDING.productName)` in `ngOnInit()`
  - [ ] 13.3 Update `<title>` in `index.html` from `UTMSTACK Technology` to `NilaChakra`
  - _Requirements: 9.4; Design: Component 7_

- [ ] 14. Clean up `index.html`
  - [ ] 14.1 Remove the four `<meta name="author" content="...">` tags
  - [ ] 14.2 Update the `<div id="app-loading">` loading text from `"Welcome to UTMStack..."` to `"Welcome to NilaChakra..."`
  - [ ] 14.3 Update `<p class="loading-subtext">Preparing your workspace</p>` (already correct — keep)
  - _Requirements: 1.5, 10.3_

- [ ] 15. Update auth screen templates — security reminder text
  - [ ] 15.1 In `totp.component.ts`, add `public readonly branding = BRANDING;`
  - [ ] 15.2 Replace `"UTMStack will never ask..."` in `totp.component.html` with `"{{ branding.productName }} will never ask for your 2FA codes."`
  - [ ] 15.3 Apply same change to `tfa-setup.component.ts` and `tfa-setup.component.html`
  - _Requirements: 4.2_

- [ ] 16. Update `welcome-to-utmstack.component.html`
  - [ ] 16.1 Add `public readonly branding = BRANDING;` to the component TS
  - [ ] 16.2 Replace `"Welcome to UTMStack"` heading with `"Welcome to {{ branding.productName }}"`
  - _Requirements: 4.5_

- [ ] 17. Update `utm-lite-version.component.html`
  - [ ] 17.1 Add `branding = BRANDING` to component TS
  - [ ] 17.2 Replace `"UTMStack Lite"` and `"LITE version of UTMStack"` with `branding.productName` interpolation
  - _Requirements: 4.6_

- [ ] 18. Update `contact-us.component.html`
  - [ ] 18.1 Replace hardcoded `<img src="/assets/img/logo_UTMStack.svg"` with `<img [src]="branding.logoPath" [alt]="branding.logoAltText">`
  - [ ] 18.2 Replace `href="https://www.utmstack.com/contact-us-advanced"` with `[href]="branding.supportUrl"`
  - _Requirements: 1.6_

- [ ] 19. Update `app-restart-api` and `app-config-delete-confirm`
  - [ ] 19.1 Add `branding = BRANDING` to `AppRestartApiComponent`
  - [ ] 19.2 Replace `"UTMStack detected changes..."` with `"{{ branding.productName }} detected changes..."`
  - [ ] 19.3 Add `branding = BRANDING` to `AppConfigDeleteConfirmComponent`
  - [ ] 19.4 Replace `"...errors in internal behavior of UTMStack"` with branding interpolation
  - _Requirements: 10.4, 10.5_

- [ ] 20. Fix console log strings
  - [ ] 20.1 Replace `console.log('UTMStack 401')` in `account.service.ts` with `console.warn('[Auth] Session expired — redirecting to login')`
  - [ ] 20.2 Same fix in `auth-expired.interceptor.ts`
  - _Requirements: 10.1_

- [ ] 21. Update `UtmReportHeaderComponent`
  - [ ] 21.1 Import `BRANDING` in `utm-report-header.component.ts`
  - [ ] 21.2 Replace hardcoded report icon with `this.themeChangeBehavior.$themeReportIcon.next(BRANDING.logoWhitePath)` at startup
  - _Requirements: 7.1_

- [ ] 22. Update integration guide step text arrays
  - [ ] 22.1 In `syslog.steps.ts` — replace `"UTMStack agent"` / `"UTMStack features"` with template literals using `BRANDING.productName`
  - [ ] 22.2 In `kasp-steps.ts` — same
  - [ ] 22.3 In `eset-steps.ts` — same
  - [ ] 22.4 In `sentinel.steps.ts` — same
  - [ ] 22.5 In `guide-netflow.component.ts` — update Windows display path label only
    ⚠️ DO NOT change shell command paths in `guide-linux-agent.component.ts`
  - _Requirements: 8.1, 8.3_

- [ ] 23. Update scanner component branding strings
  - [ ] 23.1 `asset-save-report.component.ts` — replace `'UTMStack Assets report'` etc. with `BRANDING.productName + ' Assets report'`
  - [ ] 23.2 `scanner-export-vulnerabilities.component.ts` — replace download filename
  - [ ] 23.3 `port-list.component.ts` — replace `'UTMStack Default'`
  - [ ] 23.4 `task-create.component.ts` — replace `'UTMStack Scanner'`
  - [ ] 23.5 `target-create.component.ts` — replace `'UTMStack Default'`
  - _Requirements: 7.3, 7.4_

- [ ] 24. Phase 2 property check
  - Run: `grep -r '"UTMStack"\|'\''UTMStack'\''' frontend/src/app --include="*.ts" --include="*.html"`
  - Confirm zero results (excluding `branding.ts`, agent shell paths, class names)
  - Run `npm test -- --watch=false` — all tests pass

---

## Phase 3 — Backend and Email Template Replacement

> Replace backend metadata and email template hardcoded strings.
> Gate: Property 3 grep returns zero results in email templates.

- [ ] 25. Create `templates/mail/fragments/branding.html`
  - [ ] 25.1 Create the fragment file with `email-header` and `email-footer` fragments as per Design Component 10
  - [ ] 25.2 Use `${brandingName}` and `${brandingSupportUrl}` — no hardcoded "UTMStack" or "NilaChakra" in the fragment
  - _Requirements: 5.1_

- [ ] 26. Update `MailService.java` to inject branding
  - [ ] 26.1 Constructor-inject `ApplicationProperties` (or `@Autowired` if already injection-based)
  - [ ] 26.2 In the Thymeleaf context-building method(s), add:
    ```java
    context.setVariable("brandingName", applicationProperties.getBranding().getName());
    context.setVariable("brandingSupportUrl", applicationProperties.getBranding().getSupportUrl());
    ```
  - [ ] 26.3 Verify `mvn -s settings.xml -B` compiles
  - _Requirements: 5.3, 6.5_

- [ ] 27. Update all 9 email templates
  - [ ] 27.1 `activationEmail.html` — add header fragment at top; footer fragment at bottom
  - [ ] 27.2 `alertEmail.html` — replace `<b>UTM</b><b style="color:#0d47a1">STACK</b>` with header fragment; add footer
  - [ ] 27.3 `alertEmailAttachment.html` — same pattern
  - [ ] 27.4 `complianceScheduleEmail.html`
  - [ ] 27.5 `creationEmail.html`
  - [ ] 27.6 `elasticClusterStatusEmail.html`
  - [ ] 27.7 `newIncidentEmail.html`
  - [ ] 27.8 `passwordResetEmail.html`
  - [ ] 27.9 `tfaCodeEmail.html`
  - _Requirements: 5.2, 5.4, 5.5, 5.6_

- [ ] 28. Update `application.yml` API docs title
  - [ ] 28.1 Change `jhipster.api-docs.title` to `${application.branding.name} Backend API`
  - [ ] 28.2 Confirm `spring.application.name` still reads `UTMStack-API` (⚠️ must not change)
  - _Requirements: 6.3_

- [ ]* 29. Write backend branding email test
  - [ ]* 29.1 `BrandingEmailTemplateTest.java` (`@SpringBootTest`) — override `APPLICATION_BRANDING_NAME=NilaChakra`,
    call MailService, assert rendered email contains "NilaChakra" not "UTMStack"
  - _Requirements: Property 6_

- [ ] 30. Phase 3 property check
  - Run: `grep -r 'UTMStack\|utmstack\.com' backend/src/main/resources/templates/mail`
  - Confirm zero results
  - Run `cd backend && mvn -s settings.xml -B` — compiles

---

## Phase 4 — Logo/Asset Replacement and CSS Class Rename

> Creates canonical logo files and renames CSS classes.
> ⚠️ Task 33 must be atomic — all 7 files in one commit.
> Gate: Properties 2 and 5 greps return zero results.

- [ ] 31. Replace legacy logo files with canonical NilaChakra files
  - [ ] 31.1 Delete `logo_UTMStack.svg` (replaced by `logo-full.svg` from Phase 0)
  - [ ] 31.2 Delete `Logo_UTM_Stack_White.svg` (replaced by `logo-white-full.svg`)
  - [ ] 31.3 Delete `logo_mini_svg.svg` (replaced by `logo-icon.svg`)
  - [ ] 31.4 Delete `Logo_Only_UTM_Stack_White.svg` (replaced by `logo-white-icon.svg`)
  - [ ] 31.5 Delete `logo_mini_animated.gif` (will be kept as `logo-animated.gif` — copy first if different)
  - [ ] 31.6 Grep for each deleted filename in `frontend/src/**` to confirm zero remaining references
  - _Requirements: 2.3; Design: Component 3_

- [ ] 32. Audit and delete unreferenced legacy logo files
  - [ ] 32.1 For each file: `logo_full_svg.svg`, `logo_full.png`, `Logo_Mini.png`, `logo_mini2.png`,
    `Logo_UTM_mini.svg`, `Logo_UTM_Stack_S_Middle_White.png`, `Logo_UTM_Stack_S_Middle_White.svg`,
    `Logo_UTM_Stack_White.png` — grep for the filename in `frontend/src/**`
  - [ ] 32.2 Delete any file with zero source references
  - [ ] 32.3 For any still-referenced file, update the reference to the canonical path and delete
  - _Requirements: 2.3_

- [ ] 33. ⚠️ Rename CSS classes (all 7 files in one commit)
  - [ ] 33.1 `frontend/src/styles.scss` — rename `.bg-image-utmstack` → `.bg-image-login`
    and `.bg-image-utmstack-blurry` → `.bg-image-login-blurry`
  - [ ] 33.2 `welcome-to-utmstack.component.html` — update class attribute
  - [ ] 33.3 `totp.component.html` — update class attribute
  - [ ] 33.4 `confirm-identity.component.html` — update class attribute
  - [ ] 33.5 `password-reset-finish.component.html` — update class attribute
  - [ ] 33.6 `tfa-setup.component.html` — update class attribute
  - [ ] 33.7 `index.html` `#app-background` div — update class attribute
  - [ ] 33.8 Visual check: login background still renders correctly after rename
  - _Requirements: 4.3, 4.4; Design: Component 7_

- [ ] 34. Phase 4 property checks
  - Property 2: `grep -r 'logo_UTMStack\|Logo_UTM\|Logo_Mini\|logo_full\|logo_mini' frontend/src --include="*.{ts,html,scss}"` → zero
  - Property 5: `grep -r 'bg-image-utmstack' frontend/src --include="*.{html,scss}"` → zero
  - Property 9: confirm 4 placeholder SVGs exist with `<!-- PLACEHOLDER -->` comment
  - Run `npm test -- --watch=false` — all tests pass

---

## Phase 5 — Final Verification and Documentation

> Confirm all properties hold. Update documentation.

- [ ] 35. Run all correctness property greps
  - [ ] 35.1 P1: `grep -r '"UTMStack"' frontend/src/app --include="*.{ts,html}"` → zero (excl. documented exceptions)
  - [ ] 35.2 P2: legacy logo filenames → zero
  - [ ] 35.3 P3: `grep -r 'UTMStack\|utmstack\.com' backend/src/main/resources/templates/mail` → zero
  - [ ] 35.4 P5: `.bg-image-utmstack` → zero
  - [ ] 35.5 P7: confirm `COOKIE_AUTH_TOKEN === 'utmauth'` and `ACCESS_KEY === 'Utm-Internal-Key'` in `app.constants.ts` are unchanged
  - [ ] 35.6 P8: confirm severity color values in `_tokens.scss` are unchanged (`git diff` severity section)

- [ ]* 36. Write remaining Karma specs
  - [ ]* 36.1 `global.constant.spec.ts` — assert `DEMO_URL === BRANDING.demoUrl`
  - [ ]* 36.2 `auth.constants.spec.ts` — assert `COOKIE_AUTH_TOKEN === 'utmauth'` (P7 regression guard)

- [ ] 37. Update `docs/baseline/11-branding-impact-analysis.md`
  - [ ] 37.1 Mark resolved touch points as "consolidated into `branding.ts`"
  - [ ] 37.2 Update "High-Risk Branding Changes" table
  - [ ] 37.3 Add "How to Update NilaChakra Branding" section:
    1. Edit `frontend/src/environments/branding.ts` for all text, URLs, and color
    2. Replace `APPLICATION_BRANDING_NAME` env var in deployment for backend name
    3. Replace the 4 canonical SVG files in `frontend/src/assets/img/` with final artwork
       (files marked `<!-- PLACEHOLDER -->`)
    4. Replace `frontend/src/assets/img/favicon.ico` with a NilaChakra favicon
    5. Update `$accent` in `frontend/src/styles/_tokens.scss` if primary color changes

- [ ] 38. Full-stack smoke test
  - [ ] 38.1 Rebuild: `npm run build` (frontend) — green
  - [ ] 38.2 Redeploy Docker container with new build
  - [ ] 38.3 Login page: placeholder chakra logo + "NilaChakra" heading visible
  - [ ] 38.4 Header: NilaChakra brand name visible
  - [ ] 38.5 Browser tab: shows "NilaChakra"
  - [ ] 38.6 Run `npm test -- --watch=false` — all 26 tests pass

---

## Notes

- Agent shell command paths (`/opt/utmstack-linux-agent/`, `C:\Program Files\UTMStack\`) in
  `guide-linux-agent.component.ts` are **intentionally NOT changed** in this spec.
- `nilachakra-logo.png` in `frontend/src/assets/img/login/` may be left in place — it is
  no longer referenced after Phase 1 completes.
- The 4 placeholder SVG files are marked with `<!-- PLACEHOLDER -->` so they are easy to
  locate when final NilaChakra artwork is ready to replace them.
- `spring.application.name = UTMStack-API` must not change — Prometheus metrics tagging depends on it.
- `branding.ts` sets `productName: 'NilaChakra'` — this is the single change that drives
  the entire visible product name throughout the UI.


---

## Tasks

All implementation tasks are listed above in Phases 0–5. The numbered tasks (1–38) are the
actionable work items. Tasks marked `*` are optional regression guards.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": [1, 2, 3, 4, 5],
      "description": "Phase 0 — Canonical config files and placeholder logos"
    },
    {
      "wave": 1,
      "tasks": [6, 7, 8],
      "description": "Phase 0 checkpoint + Phase 1 — Fix Broken_State (login page)",
      "dependsOn": [0]
    },
    {
      "wave": 2,
      "tasks": [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      "description": "Phase 1 checkpoint + Phase 2 — Frontend string replacement",
      "dependsOn": [1]
    },
    {
      "wave": 3,
      "tasks": [24, 25, 26, 27, 28, 29],
      "description": "Phase 2 property check + Phase 3 — Backend and email templates",
      "dependsOn": [2]
    },
    {
      "wave": 4,
      "tasks": [30, 31, 32, 33, 34],
      "description": "Phase 3 checkpoint + Phase 4 — Logo renames and CSS class rename",
      "dependsOn": [3]
    },
    {
      "wave": 5,
      "tasks": [35, 36, 37, 38],
      "description": "Phase 4 checks + Phase 5 — Final verification and documentation",
      "dependsOn": [4]
    }
  ]
}
```

### Dependency notes

- Tasks 3 and 4 (backend YAML + Java class) are independent of the frontend and can run in parallel with Tasks 1 and 2.
- Phase 3 (backend/email, Tasks 25–30) can run in parallel with Phase 2 (frontend, Tasks 10–24) after Phase 0 completes.
- Task 33 (CSS class rename) is atomic — all 7 files must change in one commit.
- **Critical path:** Task 1 → Task 2 → Task 7 → Tasks 10–23 → Task 33 → Task 35 → Task 38
