# Requirements Document

## Introduction

UTMStack v11 is being rebranded to **NilaChakra** — an enterprise SIEM + XDR platform. Branding
strings, colors, logos, and product-name references are scattered across more than 60 files spanning
the Angular frontend, Spring Boot backend, email templates, and PDF/report output. An incomplete
prior rebrand attempt left `login.component.html` referencing `nilachakra-logo.png` and "NilaChakra"
directly in HTML while the rest of the application still displays "UTMStack". This creates a broken,
inconsistent state.

This spec consolidates all branding into a small number of authoritative configuration points and
eliminates every hardcoded occurrence. The result is a system where a complete product rebrand
requires changes to exactly two files plus a logo/asset swap — nothing else.

**New Brand Identity:**
- Product name: **NilaChakra**
- Short name: **NC**
- Tagline: Enterprise SIEM + XDR
- Primary accent color: `#4F8EF7` (unchanged — dark navy/blue, consistent with the chakra theme)
- Logo: SVG placeholder circles/chakra motif until final logo assets are provided

**Scope:** Frontend (Angular 17), backend (Spring Boot 3.3), email templates (Thymeleaf), and PDF
report output. Out of scope: gRPC protocol names, OpenSearch index names, Liquibase changesets,
`Utm-Internal-Key` header, `INTERNAL_KEY`/`REPLACE_KEY` env vars, agent binary CLI strings (those
require a separate binary release and are covered separately).

**Constraint — high-risk items:** The following must not be changed by this spec because they would
break active sessions or deployed agents:
- `COOKIE_AUTH_TOKEN = 'utmauth'` in `app.constants.ts` (breaks active browser sessions)
- `SESSION_AUTH_TOKEN` key pattern (breaks active browser sessions)
- `Utm-Internal-Key` header constant (breaking inter-service contract)
- Agent install filesystem paths (`/opt/utmstack-linux-agent/`, `C:\Program Files\UTMStack\`)

These items are documented as out-of-scope and tracked separately in the risk register
(`docs/baseline/12-risk-register.md`).

---

## Glossary

| Term | Definition |
|---|---|
| **Branding_Config** | The single canonical TypeScript constant file `frontend/src/environments/branding.ts` that holds all frontend brand values |
| **Backend_Branding_Properties** | The `application.branding.*` YAML section in `application.yml`, bound to `ApplicationProperties.BrandingProperties` |
| **Token_File** | `frontend/src/styles/_tokens.scss` — the single SCSS file that defines all color variables |
| **Brand_Color** | The primary accent color (`$accent`) used for interactive elements, links, and highlights |
| **Logo_Set** | The canonical set of logo image files in `frontend/src/assets/img/` that must be consistently branded |
| **Placeholder_Logo** | An SVG file with a NilaChakra-themed geometric placeholder (chakra/circle motif) used until final logo assets are supplied |
| **Login_Background** | `frontend/src/assets/img/login/login-background.jpg` — the full-screen image behind the login card |
| **Report_Logo** | The logo image rendered inside PDF compliance and dashboard reports |
| **Email_Fragment** | A shared Thymeleaf partial that centralises the product name in all 9 email templates |
| **Guide_Text** | User-facing installation step text in `frontend/src/app/app-module/guides/` |
| **Hardcoded_Occurrence** | Any literal string, URL, image path, or color value that encodes "UTMStack" outside the authoritative config points |
| **Broken_State** | The current condition where `login.component.html` displays "NilaChakra" while all other components display "UTMStack" |

---

## Current Broken State

The login page already has a partial rebrand applied inconsistently:

```
frontend/src/app/shared/components/auth/login/login.component.html:
  <img src="assets/img/login/nilachakra-logo.png" alt="NilaChakra">
  <h1 class="login-title">NilaChakra</h1>
```

Meanwhile:
- `index.html` still shows `<title>UTMSTACK Technology</title>`
- `global.constant.ts` still has `DEMO_URL = 'https://demo.utmstack.com/'`
- All email templates still have hardcoded "UTMStack" in body text and sender identity
- All integration guides still reference "UTMStack agent"
- Header navbar still falls back to `<span>UTMSTACK</span>`
- `welcome-to-utmstack.component.html` still says "Welcome to UTMStack"

This spec resolves the broken state and establishes NilaChakra branding throughout the application.

---

## Requirements

---

### Requirement 1: Single Frontend Branding Source of Truth

**User Story:** As a developer performing the NilaChakra rebrand, I want all product-name strings,
external URLs, and logo references in the Angular application to come from one file so that future
brand adjustments require editing exactly one TypeScript file.

#### Acceptance Criteria

1. THE system SHALL create `frontend/src/environments/branding.ts` as the sole location for all
   frontend brand identity values, containing at minimum: `productName: 'NilaChakra'`,
   `productNameShort: 'NC'`, `tagline`, `docsUrl`, `supportUrl`, `logoPath`, `logoAltText`,
   `faviconPath`, and `loadingText`.

2. WHEN any Angular component, template, pipe, or service needs to display the product name or
   navigate to documentation, THEN it SHALL import the value from `BRANDING` in `branding.ts`,
   not from a hardcoded string literal.

3. THE `BRANDING` object SHALL be a plain TypeScript `const` (not an Angular service, injectable,
   or environment-profile-split value) so that it is available at both compile time and runtime
   without DI overhead.

4. THE file `frontend/src/app/shared/constants/global.constant.ts` SHALL have its `DEMO_URL` and
   `ONLINE_DOCUMENTATION_BASE` constants replaced with imports from `BRANDING.docsUrl` and
   `BRANDING.supportUrl` respectively; the constant names SHALL remain so that existing callsites
   continue to compile without modification.

5. THE `index.html` `<title>` tag SHALL be updated to `NilaChakra`, and the loading-screen text
   SHALL read `Preparing your workspace`. The `AppComponent.ngOnInit()` SHALL call
   `titleService.setTitle(BRANDING.productName)` to keep the browser tab title in sync.

6. THE `contact-us.component.html` contact link SHALL be replaced with `BRANDING.supportUrl`.

---

### Requirement 2: Logo and Favicon System

**User Story:** As a developer performing the NilaChakra rebrand, I want all logo and favicon
usages to reference a documented set of canonical asset paths, and I want SVG placeholder logos
to be in place immediately so that the UI is visually consistent even before final logo artwork
is delivered.

#### Acceptance Criteria

1. THE Logo_Set SHALL consist of exactly the following canonical filenames in
   `frontend/src/assets/img/`:

   | Filename | Purpose |
   |---|---|
   | `logo-full.svg` | Full horizontal logo with wordmark — header, login page |
   | `logo-icon.svg` | Icon-only variant — sidebar mini, favicon source |
   | `logo-white-full.svg` | White full logo — dark backgrounds, PDF header |
   | `logo-white-icon.svg` | White icon only — dark compact contexts |
   | `logo-animated.gif` | Animated spinner variant — loading states |
   | `favicon.ico` | Browser tab icon |

2. SINCE final logo artwork is not yet available, THE system SHALL create Placeholder_Logo SVG
   files for `logo-full.svg`, `logo-icon.svg`, `logo-white-full.svg`, and `logo-white-icon.svg`
   using a NilaChakra-themed geometric motif:
   - The motif SHALL use a stylised chakra/circular symbol alongside the "NilaChakra" wordmark
   - `logo-full.svg` SHALL render the icon + "NilaChakra" wordmark horizontally
   - `logo-icon.svg` SHALL render the icon only (a 40×40 circle with internal geometry)
   - White variants SHALL use `#FFFFFF` for all elements (for dark backgrounds)
   - All placeholders SHALL be clearly marked with a comment: `<!-- PLACEHOLDER: Replace with final NilaChakra logo -->`

3. THE existing UTMStack-named logo files SHALL be replaced with the canonical filenames in
   Acceptance Criterion 1. Legacy filenames that are no longer referenced by any source file
   SHALL be deleted.

4. THE `BRANDING.logoPath` constant SHALL resolve to `assets/img/logo-full.svg` and SHALL be
   the only path referenced by the header component, login component, and getting-started
   component for the primary logo.

5. THE favicon `<link>` element in `index.html` SHALL reference `BRANDING.faviconPath`.

6. WHEN `UtmReportHeaderComponent` renders a logo for PDF output, THEN it SHALL use
   `BRANDING.logoWhitePath` (`assets/img/logo-white-full.svg`).

7. THE login page logo SHALL reference `BRANDING.logoPath` and `BRANDING.logoAltText`,
   eliminating the current Broken_State (`nilachakra-logo.png` hardcoded path).

---

### Requirement 3: Theme Color System

**User Story:** As a developer, I want to change the primary brand color by editing exactly one
place, so that the entire UI recolors consistently.

#### Acceptance Criteria

1. THE Token_File (`frontend/src/styles/_tokens.scss`) SHALL remain the single source for all
   color values; no hex value SHALL appear anywhere else in the SCSS codebase.

2. THE Token_File SHALL emit CSS Custom Properties for every brand-configurable color alongside
   the existing SCSS variables:

   ```scss
   :root {
     --color-accent:       #{$accent};
     --color-bg-body:      #{$bg-body};
     --color-sev-critical: #{$sev-critical};
     // ... all brand and severity tokens
   }
   ```

3. THE severity palette tokens (`$sev-critical`, `$sev-high`, `$sev-medium`, `$sev-low`) SHALL
   NOT be changed — they are SOC-standard colors interpreted by analysts.

4. THE ECharts chart palette array in `utm-color.const.ts` SHALL have its first entry replaced
   with a reference to `BRANDING.brandAccent`.

5. THE primary accent color `$accent: #4F8EF7` SHALL be retained for NilaChakra — the existing
   dark navy/blue palette is appropriate for the brand.

---

### Requirement 4: Login Page and Auth Screen Branding

**User Story:** As a user opening the application, I want to see consistent NilaChakra branding on
the login page, TFA enrollment, password reset, and TOTP verification screens.

#### Acceptance Criteria

1. THE login page SHALL display the NilaChakra name and placeholder logo via `BRANDING.logoPath`
   and `BRANDING.productName`, resolving the current Broken_State.

2. THE security reminder text on `totp.component.html` and `tfa-setup.component.html`
   SHALL read "NilaChakra will never ask for your 2FA codes" (via `BRANDING.productName`).

3. THE CSS classes `.bg-image-utmstack` and `.bg-image-utmstack-blurry` in `styles.scss` SHALL
   be renamed to `.bg-image-login` and `.bg-image-login-blurry` respectively, and all 6 template
   files that reference them SHALL be updated simultaneously.

4. WHEN the new class names are applied, the visual appearance of the login background SHALL
   remain identical.

5. THE `welcome-to-utmstack.component.html` heading SHALL read "Welcome to NilaChakra" (via
   `BRANDING.productName`).

6. THE `utm-lite-version.component.html` text SHALL use `BRANDING.productName`.

---

### Requirement 5: Email Template Branding

**User Story:** As an administrator, I want all outbound emails to consistently display NilaChakra
branding so that recipients receive a coherent identity.

#### Acceptance Criteria

1. THE system SHALL create a shared Thymeleaf fragment at
   `backend/src/main/resources/templates/mail/fragments/branding.html`.

2. ALL 9 email templates SHALL include the `branding.html` fragment, replacing hardcoded
   "UTMStack" text and `utmstack.com` links.

3. THE product name and support URL SHALL be driven by Spring `@Value` injection from
   `application.branding.name` and `application.branding.support-url`.

4. WHEN `application.branding.name` is set to `NilaChakra`, all 9 email templates SHALL
   reflect "NilaChakra".

5. THE `alertEmail.html` template SHALL replace:
   ```html
   <b>UTM</b><b style="color:#0d47a1">STACK</b>
   ```
   with a rendering of `application.branding.name` via the branding fragment.

6. THE email footer SHALL display `application.branding.support-url` as a clickable link.

---

### Requirement 6: Backend Branding Configuration

**User Story:** As a Platform Admin, I want the backend application name and email identity to be
driven by a single YAML configuration block so that deploying a NilaChakra-branded instance
requires only environment variable overrides.

#### Acceptance Criteria

1. THE `ApplicationProperties.java` SHALL be extended with a `BrandingProperties` inner class
   containing: `name`, `nameShort`, `supportUrl`, and `docsUrl`.

2. THE `application.yml` SHALL add:

   ```yaml
   application:
     branding:
       name: "${APPLICATION_BRANDING_NAME:NilaChakra}"
       name-short: "${APPLICATION_BRANDING_NAME_SHORT:NC}"
       support-url: "https://nilachakra.com/contact"
       docs-url: "https://docs.nilachakra.com"
   ```

3. THE `spring.application.name` SHALL remain `UTMStack-API` (internal Spring identifier for
   metrics — must not change). The `jhipster.api-docs.title` SHALL become
   `${application.branding.name} Backend API`.

4. WHEN the `APPLICATION_BRANDING_NAME` environment variable is set to `NilaChakra`, its value
   SHALL override `application.branding.name` for the running process.

5. THE `MailService.java` SHALL inject `ApplicationProperties.BrandingProperties` and pass
   `branding.name` and `branding.support-url` as Thymeleaf template variables.

6. WHEN `spring.application.name` is read by Prometheus metrics tagging, it SHALL continue to
   resolve to `UTMStack-API` regardless of the branding override.

---

### Requirement 7: PDF Report and Compliance Output Branding

**User Story:** As a Compliance Officer, I want exported PDF reports to display NilaChakra
branding.

#### Acceptance Criteria

1. THE `UtmReportHeaderComponent` SHALL render the logo from `BRANDING.logoWhitePath` and the
   product name from `BRANDING.productName`.

2. THE compliance front-page layout CSS SHALL use canonical asset paths from Requirement 2.

3. THE scanner report download filename SHALL use `BRANDING.productName` (e.g. `NilaChakra
   vulnerabilities report`).

4. THE asset report filenames SHALL use `BRANDING.productName` (e.g. `NilaChakra Assets report`).

5. WHEN a compliance PDF is generated by the `web-pdf` service, THE logo SHALL reflect
   `BRANDING.logoWhitePath` automatically.

---

### Requirement 8: Integration Guide Text

**User Story:** As a Security Engineer configuring an integration, I want the installation
instructions to reference NilaChakra so that documentation matches the product.

#### Acceptance Criteria

1. THE guide step text arrays SHALL replace hardcoded "UTMStack agent" and "UTMStack features"
   strings with template literals interpolating `BRANDING.productName`.

2. THE `guide-linux-agent.component.ts` agent install/uninstall shell commands SHALL remain
   **unchanged** — they are live filesystem paths on deployed endpoints.

3. THE `guide-netflow.component.ts` display path label SHALL reference `BRANDING.productName`
   for the display label while keeping the actual filesystem path intact.

---

### Requirement 9: Header and Navigation Branding

**User Story:** As a user, I want the application header to display the NilaChakra name and logo.

#### Acceptance Criteria

1. THE `header.component.html` fallback text SHALL be `{{ branding.productName }}` (NilaChakra).

2. THE `aria-label` on the header brand link SHALL be `NilaChakra home` (via `BRANDING.productName`).

3. THE mobile header fallback `<h6>` SHALL use `BRANDING.productNameShort` (NC).

4. THE `AppComponent.ngOnInit()` SHALL call `titleService.setTitle(BRANDING.productName)` so
   the browser tab always reads "NilaChakra".

---

### Requirement 10: Console Log and Internal String Cleanup

**User Story:** As a developer, I want internal log strings and metadata that reference the old
product name to be updated.

#### Acceptance Criteria

1. THE `console.log('UTMStack 401')` calls SHALL be replaced with non-brand-specific messages.

2. THE `SAAS_DEFAULT_PASSWORD` constant SHALL be removed (resolves DEBT-20 — security risk).

3. THE `index.html` `<meta name="author" content="...">` tags SHALL be removed.

4. ALL remaining in-template "UTMStack" strings in `app-config-delete-confirm.component.html`
   and `app-restart-api.component.html` SHALL use `BRANDING.productName`.

---

## Correctness Properties

### Property 1: No Hardcoded "UTMStack" in Frontend Source

After implementation, a grep for `'UTMStack'` or `"UTMStack"` in
`frontend/src/app/**/*.ts` and `frontend/src/app/**/*.html` SHALL return zero results, except:
- `branding.ts` (canonical definition only)
- Files explicitly out-of-scope (agent filesystem paths, internal class names)

### Property 2: No Legacy Logo Filenames in Source

A grep for `logo_UTMStack`, `Logo_UTM`, `Logo_Mini`, `logo_full`, `logo_mini` in
`frontend/src/**/*.{ts,html,scss}` SHALL return zero results.

### Property 3: Email Template Brand Independence

A grep for `UTMStack` or `utmstack.com` in `backend/src/main/resources/templates/mail/**/*.html`
SHALL return zero results.

### Property 4: Branding Config Completeness

The `BRANDING` object SHALL have no `undefined` values. Each field SHALL be a non-empty string.

### Property 5: CSS Class Name Consistency

A grep for `.bg-image-utmstack` in `frontend/src/**/*.{html,scss}` SHALL return zero results.

### Property 6: Backend Branding Override Works

When `APPLICATION_BRANDING_NAME=NilaChakra` is set, rendered email templates SHALL contain
"NilaChakra", not "UTMStack".

### Property 7: Auth Constants Unchanged (No Regression)

`COOKIE_AUTH_TOKEN === 'utmauth'`, `ACCESS_KEY === 'Utm-Internal-Key'` — must remain unchanged.

### Property 8: Severity Colors Unchanged

`$sev-critical`, `$sev-high`, `$sev-medium`, `$sev-low` values in `_tokens.scss` SHALL be
identical before and after implementation.

### Property 9: Placeholder Logos Present

All four placeholder SVG files SHALL exist in `frontend/src/assets/img/` and SHALL contain the
`<!-- PLACEHOLDER -->` comment marker until replaced with final artwork.
