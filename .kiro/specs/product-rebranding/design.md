# Design — Product Rebranding: UTMStack → NilaChakra

## Overview

The rebrand introduces two canonical configuration points — `frontend/src/environments/branding.ts`
for the Angular frontend and `application.branding.*` YAML for the Spring Boot backend — and then
mechanically replaces every Hardcoded_Occurrence with a reference to those points.

**NilaChakra** is the new product name. Placeholder SVG logos are created immediately so the UI
is visually consistent before final artwork arrives. The login page is in a Broken_State (hardcodes
"NilaChakra" and `nilachakra-logo.png` inconsistently) — this spec fixes that as the first task.

---

## Architecture

### Frontend branding architecture (after)

```
frontend/src/environments/branding.ts          ← NEW — single source of truth
        │
        ├── frontend/src/index.html            (static title: "NilaChakra")
        ├── frontend/src/app/app.component.ts  (dynamic: titleService.setTitle(BRANDING.productName))
        ├── frontend/src/app/shared/constants/global.constant.ts
        ├── All components displaying product name or logo
        └── frontend/src/app/shared/constants/utm-color.const.ts
```

### Backend branding architecture (after)

```
backend/src/main/resources/config/application.yml   ← application.branding.* YAML block
        │
        ├── ApplicationProperties.BrandingProperties  ← NEW inner class
        └── MailService.java                          ← injects branding into template model
                └── templates/mail/fragments/branding.html  ← NEW shared fragment
                        └── included by all 9 email templates
```

---

## Component 1: `frontend/src/environments/branding.ts` (NEW)

```typescript
/**
 * NilaChakra — Canonical frontend brand configuration.
 * Change values here to update branding across the entire Angular application.
 *
 * ⚠️  DO NOT add these constants here — they must not change:
 *   - COOKIE_AUTH_TOKEN ('utmauth') — changing breaks all active browser sessions
 *   - SESSION_AUTH_TOKEN key pattern — changing logs out all active users
 *   - ACCESS_KEY ('Utm-Internal-Key') — changing breaks frontend→backend API calls
 */
export const BRANDING = {
  /** Full product name — displayed in titles, headings, and emails */
  productName: 'NilaChakra',
  /** Abbreviated name — compact contexts (mobile header, short labels) */
  productNameShort: 'NC',
  /** Tagline shown under the product name on the login page */
  tagline: 'Enterprise SIEM + XDR',
  /** Primary logo — full horizontal logo with wordmark (header, login) */
  logoPath: 'assets/img/logo-full.svg',
  /** White/light logo for dark backgrounds (PDF headers, report pages) */
  logoWhitePath: 'assets/img/logo-white-full.svg',
  /** Icon-only logo for compact/mini contexts */
  logoIconPath: 'assets/img/logo-icon.svg',
  /** White icon-only logo */
  logoWhiteIconPath: 'assets/img/logo-white-icon.svg',
  /** Alt text for all logo img elements */
  logoAltText: 'NilaChakra',
  /** Animated loader — used for loading states */
  logoAnimatedPath: 'assets/img/logo-animated.gif',
  /** Browser tab favicon */
  faviconPath: 'assets/img/favicon.ico',
  /** Loading spinner subtitle text */
  loadingText: 'Preparing your workspace',
  /** Support / contact page URL */
  supportUrl: 'https://nilachakra.com/contact',
  /** Online documentation base URL */
  docsUrl: 'https://docs.nilachakra.com',
  /** Demo environment URL */
  demoUrl: 'https://demo.nilachakra.com/',
  /**
   * Primary brand hex color.
   * Must stay in sync with $accent in frontend/src/styles/_tokens.scss.
   * Used as the first entry in UTM_COLOR_THEME for ECharts chart series.
   */
  brandAccent: '#4F8EF7',
} as const;

export type BrandingConfig = typeof BRANDING;
```

### Usage pattern in components

```typescript
// In any component:
import { BRANDING } from '../../../environments/branding';

@Component({ ... })
export class MyComponent {
  public readonly branding = BRANDING;
}

// In the template:
<img [src]="branding.logoPath" [alt]="branding.logoAltText">
<h1>{{ branding.productName }}</h1>
```

---

## Component 2: Placeholder Logo SVG Files

Since final NilaChakra logo artwork is not yet available, four placeholder SVG files are created
immediately. They use a chakra-inspired circular motif in the existing accent blue `#4F8EF7`.

### `logo-full.svg` — Full horizontal logo with wordmark

```svg
<!-- PLACEHOLDER: Replace with final NilaChakra logo artwork -->
<!-- NilaChakra full horizontal logo placeholder -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 52" width="200" height="52">
  <!-- Chakra icon: outer ring + 8 spokes + inner circle -->
  <g transform="translate(26,26)">
    <circle r="22" fill="none" stroke="#4F8EF7" stroke-width="2.5"/>
    <circle r="7" fill="#4F8EF7"/>
    <!-- 8 spokes -->
    <line x1="0" y1="-22" x2="0" y2="-9" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="0" y1="9" x2="0" y2="22" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-22" y1="0" x2="-9" y2="0" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="9" y1="0" x2="22" y2="0" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-15.6" y1="-15.6" x2="-6.4" y2="-6.4" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="6.4" y1="6.4" x2="15.6" y2="15.6" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="15.6" y1="-15.6" x2="6.4" y2="-6.4" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-6.4" y1="6.4" x2="-15.6" y2="15.6" stroke="#4F8EF7" stroke-width="2"/>
  </g>
  <!-- Wordmark -->
  <text x="60" y="21" font-family="Inter, -apple-system, sans-serif" font-size="17"
        font-weight="700" fill="#4F8EF7" letter-spacing="-0.3">Nila</text>
  <text x="60" y="38" font-family="Inter, -apple-system, sans-serif" font-size="17"
        font-weight="300" fill="#8899BB" letter-spacing="-0.3">Chakra</text>
</svg>
```

### `logo-icon.svg` — Icon only (40×40)

```svg
<!-- PLACEHOLDER: Replace with final NilaChakra icon artwork -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
  <g transform="translate(20,20)">
    <circle r="18" fill="none" stroke="#4F8EF7" stroke-width="2.5"/>
    <circle r="6" fill="#4F8EF7"/>
    <line x1="0" y1="-18" x2="0" y2="-8" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="0" y1="8" x2="0" y2="18" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-18" y1="0" x2="-8" y2="0" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="8" y1="0" x2="18" y2="0" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-12.7" y1="-12.7" x2="-5.7" y2="-5.7" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="5.7" y1="5.7" x2="12.7" y2="12.7" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="12.7" y1="-12.7" x2="5.7" y2="-5.7" stroke="#4F8EF7" stroke-width="2"/>
    <line x1="-5.7" y1="5.7" x2="-12.7" y2="12.7" stroke="#4F8EF7" stroke-width="2"/>
  </g>
</svg>
```

### `logo-white-full.svg` — White full logo (for dark backgrounds)

Same structure as `logo-full.svg` but all colors are `#FFFFFF`.

### `logo-white-icon.svg` — White icon only (for dark backgrounds)

Same structure as `logo-icon.svg` but all colors are `#FFFFFF`.

---

## Component 3: Logo File Renames

| Old filename | New canonical filename | Used for |
|---|---|---|
| `logo_UTMStack.svg` | `logo-full.svg` | Primary logo (header, login) |
| `Logo_UTM_Stack_White.svg` | `logo-white-full.svg` | White full logo (PDFs, dark BG) |
| `logo_mini_svg.svg` | `logo-icon.svg` | Icon-only (sidebar mini) |
| `Logo_Only_UTM_Stack_White.svg` | `logo-white-icon.svg` | White icon-only |
| `logo_mini_animated.gif` | `logo-animated.gif` | Loading spinner |
| `logo_full_svg.svg`, `logo_full.png` | Audit + delete if unreferenced | — |
| `Logo_Mini.png`, `logo_mini2.png`, `Logo_UTM_mini.svg`, `Logo_UTM_Stack_S_Middle_White.*`, `Logo_UTM_Stack_White.png` | Audit + delete if unreferenced | — |
| `favicon.ico` | `favicon.ico` | No rename needed |

**Note:** The placeholder SVGs above REPLACE the old UTMStack SVGs at their new canonical paths.
The old files are deleted. When final NilaChakra artwork arrives, only the 4 canonical files need
to be replaced — no source code changes required.

---

## Component 4: `global.constant.ts` Update

```typescript
// frontend/src/app/shared/constants/global.constant.ts
import { BRANDING } from '../../environments/branding';

export const USER_ROLE = 'ROLE_USER';
export const ADMIN_ROLE = 'ROLE_ADMIN';
export const ADMIN_DEFAULT_EMAIL = 'admin@localhost';
export const DEMO_URL = BRANDING.demoUrl;                    // was: 'https://demo.utmstack.com/'
export const ONLINE_DOCUMENTATION_BASE = BRANDING.docsUrl;  // was: 'https://docs.utmstack.com'
export const LOG_SOURCE_DASHBOARD_NAME = 'Log source system';
// SAAS_DEFAULT_PASSWORD REMOVED — resolves DEBT-20 (security risk)
export const MAX_SEARCH_RESULTS = 10000;
```

---

## Component 5: `_tokens.scss` — CSS Custom Properties

Appended after all variable declarations (no change to existing SCSS variables):

```scss
// ── CSS CUSTOM PROPERTIES — enables runtime theming without rebuild ──────────
:root {
  --color-accent:          #{$accent};
  --color-accent-dim:      #{$accent-dim};
  --color-bg-body:         #{$bg-body};
  --color-bg-sidebar:      #{$bg-sidebar};
  --color-bg-card:         #{$bg-card};
  --color-bg-elevated:     #{$bg-elevated};
  --color-text-primary:    #{$text-100};
  --color-text-secondary:  #{$text-200};
  --color-border:          #{$border-100};
  // Severity tokens — NOT brand colors; do not customize via branding config
  --color-sev-critical:    #{$sev-critical};
  --color-sev-high:        #{$sev-high};
  --color-sev-medium:      #{$sev-medium};
  --color-sev-low:         #{$sev-low};
}
```

---

## Component 6: `utm-color.const.ts` Update

```typescript
import { BRANDING } from '../../environments/branding';

export const UTM_COLOR_THEME = [
  BRANDING.brandAccent,  // index 0 = primary series color, driven by branding
  '#FF7043',
  '#EC407A',
  // ... remaining entries unchanged
];
```

---

## Component 7: CSS Class Rename — `.bg-image-utmstack` → `.bg-image-login`

| File | Change |
|---|---|
| `frontend/src/styles.scss` | Both class names renamed |
| `welcome-to-utmstack.component.html` | class attribute updated |
| `totp.component.html` | class attribute updated |
| `confirm-identity.component.html` | class attribute updated |
| `password-reset-finish.component.html` | class attribute updated |
| `tfa-setup.component.html` | class attribute updated |
| `index.html` (`#app-background` div) | class attribute updated |

All 6 template files and the stylesheet in the same commit — no broken intermediate state.

---

## Component 8: Login Component Fix (resolves Broken_State)

```html
<!-- login.component.html — NilaChakra branding header -->
<div class="login-brand">
  <div class="login-logo">
    <img [src]="branding.logoPath" [alt]="branding.logoAltText" class="login-logo-img">
  </div>
  <h1 class="login-title">{{ branding.productName }}</h1>
  <p class="login-subtitle">{{ branding.tagline }}</p>
</div>
```

```typescript
// login.component.ts
import { BRANDING } from '../../../../environments/branding';

export class LoginComponent {
  public readonly branding = BRANDING;
  // ... rest unchanged
}
```

---

## Component 9: Backend `ApplicationProperties.BrandingProperties`

```java
public static class BrandingProperties {
    private String name = "NilaChakra";
    private String nameShort = "NC";
    private String supportUrl = "https://nilachakra.com/contact";
    private String docsUrl = "https://docs.nilachakra.com";
    // getters and setters...
}
```

`application.yml` addition:

```yaml
application:
  branding:
    name: "${APPLICATION_BRANDING_NAME:NilaChakra}"
    name-short: "${APPLICATION_BRANDING_NAME_SHORT:NC}"
    support-url: "https://nilachakra.com/contact"
    docs-url: "https://docs.nilachakra.com"
```

---

## Component 10: Email Fragment `branding.html`

```html
<!-- backend/src/main/resources/templates/mail/fragments/branding.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<body>

<div th:fragment="email-header">
  <div style="padding:16px 0 8px; border-bottom:2px solid #4F8EF7;">
    <h2 style="font-family:Inter,Roboto,sans-serif; margin:0; font-size:22px; font-weight:700; color:#151922;">
      <span th:text="${brandingName}">NilaChakra</span>
    </h2>
    <p style="margin:4px 0 0; font-size:12px; color:#8899BB; font-weight:400;">Enterprise SIEM + XDR</p>
  </div>
</div>

<div th:fragment="email-footer">
  <hr style="border:1px solid #eee; margin:24px 0 16px;">
  <div style="font-family:Inter,Roboto,sans-serif; font-size:13px; color:#666;">
    <p style="margin:0 0 4px;">Best regards,</p>
    <p style="margin:0 0 4px; font-weight:600;" th:text="${brandingName}">NilaChakra</p>
    <a th:href="${brandingSupportUrl}" th:text="${brandingSupportUrl}"
       style="color:#4F8EF7;">https://nilachakra.com/contact</a>
  </div>
</div>

</body>
</html>
```

---

## File Impact Map

### New files created

| File | Purpose |
|---|---|
| `frontend/src/environments/branding.ts` | Canonical frontend brand config |
| `frontend/src/assets/img/logo-full.svg` | NilaChakra placeholder full logo |
| `frontend/src/assets/img/logo-icon.svg` | NilaChakra placeholder icon |
| `frontend/src/assets/img/logo-white-full.svg` | NilaChakra placeholder white full logo |
| `frontend/src/assets/img/logo-white-icon.svg` | NilaChakra placeholder white icon |
| `backend/.../templates/mail/fragments/branding.html` | Shared email header/footer fragment |

### Modified files — Frontend

| File | Change |
|---|---|
| `frontend/src/app/app.component.ts` | Set title from `BRANDING.productName` |
| `frontend/src/index.html` | Update `<title>` to NilaChakra, remove author meta, update loading text, favicon href |
| `frontend/src/styles.scss` | Rename `.bg-image-utmstack*` → `.bg-image-login*` |
| `frontend/src/styles/_tokens.scss` | Add `:root {}` CSS custom properties block |
| `frontend/src/app/shared/constants/global.constant.ts` | Import from BRANDING; remove `SAAS_DEFAULT_PASSWORD` |
| `frontend/src/app/shared/constants/utm-color.const.ts` | First entry from `BRANDING.brandAccent` |
| `frontend/src/app/shared/components/layout/header/header.component.ts` | Add `branding = BRANDING` |
| `frontend/src/app/shared/components/layout/header/header.component.html` | Use `branding.*` |
| `frontend/src/app/shared/components/auth/login/login.component.ts` | Add `branding = BRANDING` |
| `frontend/src/app/shared/components/auth/login/login.component.html` | Fix Broken_State |
| `frontend/src/app/shared/components/auth/totp/totp.component.ts` + `.html` | CSS class rename + security text |
| `frontend/src/app/shared/components/auth/tfa-setup/tfa-setup.component.ts` + `.html` | Same |
| `frontend/src/app/shared/components/auth/confirm-identity/confirm-identity.component.html` | CSS class rename |
| `frontend/src/app/shared/components/auth/password-reset/finish/password-reset-finish.component.html` | CSS class rename |
| `frontend/src/app/shared/components/getting-started/welcome-to-utmstack/welcome-to-utmstack.component.ts` + `.html` | CSS class rename + heading |
| `frontend/src/app/shared/components/contact-us/contact-us.component.html` | Logo path, contact link |
| `frontend/src/app/shared/components/utm-lite-version/utm-lite-version.component.ts` + `.html` | Use branding |
| `frontend/src/app/shared/components/utm/util/utm-report-header/utm-report-header.component.ts` | Use BRANDING for report logo |
| `frontend/src/app/shared/components/utm/util/app-restart-api/app-restart-api.component.ts` + `.html` | Use `branding.productName` |
| `frontend/src/app/shared/components/utm/config/app-config-delete-confirm/*.ts` + `.html` | Same |
| `frontend/src/app/core/auth/account.service.ts` | Replace `console.log('UTMStack 401')` |
| `frontend/src/app/blocks/interceptor/auth-expired.interceptor.ts` | Same |
| `frontend/src/app/app-module/guides/guide-linux-agent/guide-linux-agent.component.ts` | Display labels only (NOT shell paths) |
| `frontend/src/app/app-module/guides/guide-netflow/guide-netflow.component.ts` | Windows display path label |
| `frontend/src/app/app-module/guides/guide-syslog/syslog.steps.ts` | Product name in step text |
| `frontend/src/app/app-module/guides/guide-kaspersky/kasp-steps.ts` | Same |
| `frontend/src/app/app-module/guides/guide-eset/eset-steps.ts` | Same |
| `frontend/src/app/app-module/guides/guide-sentinel-one/sentinel.steps.ts` | Same |
| `frontend/src/app/scanner/shared/components/asset-save-report/asset-save-report.component.ts` | Report filenames |
| `frontend/src/app/scanner/shared/components/scanner-export-vulnerabilities/*.component.ts` | Download filename |

### Modified files — Backend

| File | Change |
|---|---|
| `backend/src/main/java/com/park/utmstack/config/ApplicationProperties.java` | Add `BrandingProperties` inner class |
| `backend/src/main/resources/config/application.yml` | Add `application.branding.*` block with NilaChakra defaults |
| `backend/src/main/java/com/park/utmstack/service/mail/MailService.java` | Inject branding, add template variables |
| All 9 email templates | Replace hardcoded text with fragment includes |

### Logo file renames/replacements (assets)

| Action | Path |
|---|---|
| Create (placeholder) | `frontend/src/assets/img/logo-full.svg` |
| Create (placeholder) | `frontend/src/assets/img/logo-icon.svg` |
| Create (placeholder) | `frontend/src/assets/img/logo-white-full.svg` |
| Create (placeholder) | `frontend/src/assets/img/logo-white-icon.svg` |
| Delete (replaced) | `logo_UTMStack.svg`, `Logo_UTM_Stack_White.svg`, `logo_mini_svg.svg`, `Logo_Only_UTM_Stack_White.svg`, `logo_mini_animated.gif` |
| Audit+delete | `logo_full_svg.svg`, `logo_full.png`, `Logo_Mini.png`, `logo_mini2.png`, `Logo_UTM_mini.svg`, `Logo_UTM_Stack_S_Middle_White.*`, `Logo_UTM_Stack_White.png` |

---

## Testing Strategy

| Property | Verification |
|---|---|
| P1: No "UTMStack" in frontend | `grep -r '"UTMStack"' frontend/src/app --include="*.{ts,html}"` → zero |
| P2: No legacy logo filenames | grep for each old filename → zero |
| P3: No "UTMStack" in email templates | grep `backend/src/main/.../templates/mail` → zero |
| P4: BRANDING completeness | `branding.spec.ts` — assert every key is non-empty string |
| P5: No old CSS class | grep `.bg-image-utmstack` → zero |
| P7: Auth constants unchanged | assert `COOKIE_AUTH_TOKEN === 'utmauth'` |
| P8: Severity colors unchanged | git diff `_tokens.scss` severity section → no changes |
| P9: Placeholder logos exist | assert 4 SVG files exist with `<!-- PLACEHOLDER -->` comment |

---

## Out of Scope

| Item | Reason |
|---|---|
| `COOKIE_AUTH_TOKEN = 'utmauth'` | Breaks all active sessions |
| `SESSION_AUTH_TOKEN` key pattern | Same |
| `ACCESS_KEY = 'Utm-Internal-Key'` | Inter-service contract |
| `/opt/utmstack-linux-agent/` shell command paths | Live filesystem paths on deployed endpoints |
| `C:\Program Files\UTMStack\` shell command paths | Same |
| Agent binary CLI strings | Require new binary release |
| `spring.application.name = UTMStack-API` | Internal Spring/Prometheus identifier |
| `x-utmstack-error` HTTP header name | Breaking API contract |
| `UtmstackCoreModule` class name | Internal identifier, no user-visible impact |
| `isSubdomainOfUtmstack()` in `url.util.ts` | Domain-check logic; requires infra changes |
| OpenSearch index names (`v11-*`) | Core data contract; frozen |
| gRPC proto definitions | Core protocol contract; frozen |


---

## Components and Interfaces

### Frontend Components Modified

| Component | Interface change |
|---|---|
| `LoginComponent` | + `public readonly branding: BrandingConfig` |
| `HeaderComponent` | + `public readonly branding: BrandingConfig` |
| `AppComponent` | + `BRANDING` import; `titleService.setTitle(BRANDING.productName)` in `ngOnInit` |
| `TotpComponent` | + `public readonly branding: BrandingConfig` |
| `TfaSetupComponent` | + `public readonly branding: BrandingConfig` |
| `WelcomeToUtmstackComponent` | + `public readonly branding: BrandingConfig` |
| `UtmLiteVersionComponent` | + `public readonly branding: BrandingConfig` |
| `ContactUsComponent` | + `public readonly branding: BrandingConfig` |
| `UtmReportHeaderComponent` | + `BRANDING` import for report logo seeding |
| `AppRestartApiComponent` | + `public readonly branding: BrandingConfig` |
| `AppConfigDeleteConfirmComponent` | + `public readonly branding: BrandingConfig` |

No new Angular services, modules, or DI tokens are introduced. `BRANDING` is a plain const.

### Backend Classes Modified

| Class | Change |
|---|---|
| `ApplicationProperties` | + `BrandingProperties` inner class + `getBranding()` getter |
| `MailService` | + `ApplicationProperties` injection + branding template variables |

### New Files

| File | Type | Purpose |
|---|---|---|
| `frontend/src/environments/branding.ts` | TypeScript const | Frontend brand config |
| `frontend/src/assets/img/logo-full.svg` | SVG | NilaChakra full logo placeholder |
| `frontend/src/assets/img/logo-icon.svg` | SVG | NilaChakra icon placeholder |
| `frontend/src/assets/img/logo-white-full.svg` | SVG | White full logo placeholder |
| `frontend/src/assets/img/logo-white-icon.svg` | SVG | White icon placeholder |
| `backend/.../templates/mail/fragments/branding.html` | Thymeleaf | Email header/footer fragment |

---

## Data Models

### `BRANDING` object (TypeScript const)

```typescript
{
  productName:        string;  // 'NilaChakra'
  productNameShort:   string;  // 'NC'
  tagline:            string;  // 'Enterprise SIEM + XDR'
  logoPath:           string;  // 'assets/img/logo-full.svg'
  logoWhitePath:      string;  // 'assets/img/logo-white-full.svg'
  logoIconPath:       string;  // 'assets/img/logo-icon.svg'
  logoWhiteIconPath:  string;  // 'assets/img/logo-white-icon.svg'
  logoAnimatedPath:   string;  // 'assets/img/logo-animated.gif'
  logoAltText:        string;  // 'NilaChakra'
  faviconPath:        string;  // 'assets/img/favicon.ico'
  loadingText:        string;  // 'Preparing your workspace'
  supportUrl:         string;  // 'https://nilachakra.com/contact'
  docsUrl:            string;  // 'https://docs.nilachakra.com'
  demoUrl:            string;  // 'https://demo.nilachakra.com/'
  brandAccent:        string;  // '#4F8EF7'
}
```

### `BrandingProperties` Java class (backend)

```java
{
  name:        String  // "NilaChakra" (override via APPLICATION_BRANDING_NAME env var)
  nameShort:   String  // "NC"
  supportUrl:  String  // "https://nilachakra.com/contact"
  docsUrl:     String  // "https://docs.nilachakra.com"
}
```

### Thymeleaf template variables (injected by MailService)

| Variable | Source | Example value |
|---|---|---|
| `brandingName` | `applicationProperties.getBranding().getName()` | "NilaChakra" |
| `brandingSupportUrl` | `applicationProperties.getBranding().getSupportUrl()` | "https://nilachakra.com/contact" |

---

## Correctness Properties

See `requirements.md` §Correctness Properties (Properties 1–9).

### Property 1: No Hardcoded Product Name in Frontend

**Validates: Requirements 1.2, 10.1, 10.4, 10.5**

After full implementation, zero occurrences of `"UTMStack"` SHALL exist in Angular
component/template source (`frontend/src/app/**/*.{ts,html}`), except in `branding.ts` itself
and explicitly documented out-of-scope files (agent shell paths, internal class names).

### Property 2: Placeholder Logos Exist

**Validates: Requirements 2.2**

All four placeholder SVG files SHALL exist in `frontend/src/assets/img/` and SHALL contain
the `<!-- PLACEHOLDER -->` comment marker until replaced with final NilaChakra artwork.

### Property 3: Email Template Brand Independence

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

Zero occurrences of `"UTMStack"` or `"utmstack.com"` SHALL exist in
`backend/src/main/resources/templates/mail/**/*.html` after implementation.

### Property 4: Auth Constants Unchanged

**Validates: Requirements 1.1, 6.4**

`COOKIE_AUTH_TOKEN === 'utmauth'` and `ACCESS_KEY === 'Utm-Internal-Key'` in `app.constants.ts`
SHALL remain unchanged. No regression on active user sessions.

---

## Error Handling

### Logo load failure
If a logo SVG fails to load (404), components that bind `[src]="branding.logoPath"` will show a
broken image. Mitigation: the placeholder SVGs are committed to the repo — they will always exist.
The `login.component.html` already has a `.login-logo-fallback` div (shown when `logoImage` is
falsy from the API) that uses `BRANDING.productName` as text fallback.

### BRANDING import at build time
`BRANDING` is a `const` — no runtime failure is possible. TypeScript will fail the build if any
property is missing or typed incorrectly (enforced by the `as const` assertion and `BrandingConfig` type).

### Backend branding properties missing
`BrandingProperties` has default values set in field initializers (`= "NilaChakra"` etc.) so Spring
will never inject `null` even if the YAML block is omitted. All Thymeleaf template variables are set
explicitly in `MailService` before template rendering.
