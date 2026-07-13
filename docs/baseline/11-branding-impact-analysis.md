# 11 — Branding Impact Analysis

## Current Branding

| Element | Current Value |
|---|---|
| Product name | UTMStack |
| Short name | UTM Stack / UTMStack |
| URL | utmstack.com |
| Documentation URL | docs.utmstack.com |
| Demo URL | demo.utmstack.com |
| Primary color | `#4F8EF7` (blue accent, previously `#03A9F4`) |
| Severity palette | SOC-standard (not brand-specific) |
| Font family | Inter (UI), JetBrains Mono (data) |
| Icon font | icomoon |
| Login background | `src/assets/img/login/login-background.jpg` |

---

## Branding Touch Points — Complete Inventory

### 1. Logo Files (`frontend/src/assets/img/`)

| File | Usage Context |
|---|---|
| `logo_full_svg.svg` | Full horizontal logo with text |
| `logo_full.png` | Full logo (raster) |
| `logo-full.svg` | Full horizontal logo SVG (added during NilaChakra rebrand work; placeholder artwork) — ⚠️ contains hardcoded hex colors, see Hardcoded_Occurrences below |
| `logo_mini_svg.svg` | Mini/favicon version |
| `logo_mini_animated.gif` | Animated loader |
| `logo_mini2.png` | Mini logo variant |
| `Logo_Mini.png` | Mini logo (alt) |
| `Logo_UTM_mini.svg` | Mini SVG variant |
| `Logo_Only_UTM_Stack_White.svg` | White variant, icon only |
| `Logo_UTM_Stack_S_Middle_White.png/svg` | White variant, stacked |
| `Logo_UTM_Stack_White.png/svg` | White full logo |
| `logo_UTMStack.svg` | Primary referenced logo |
| `src/favicon.ico` | Browser tab icon |

**All 12+ files** are UTMStack/NilaChakra-branded and must be replaced in a rebrand.

#### Hardcoded_Occurrences in SVG Logo Files

SVG files cannot import SCSS, so color values are necessarily inlined. These are tracked here so a rebrand knows which files to update manually:

| File | Hardcoded colors | Should match token |
|---|---|---|
| `logo-full.svg` | `#4F8EF7` (stroke/fill) | `$accent` |
| `logo-full.svg` | `#DDE6FF` (wordmark primary text) | `$text-primary` equivalent |
| `logo-full.svg` | `#8899BB` (wordmark secondary text) | `$text-secondary` equivalent |
| `logo-full.svg` | `#2A3655` (separator line) | `$border-base` equivalent |

These are **not** violations of the `_tokens.scss` single-source rule (SVG has no SCSS import mechanism), but they must be updated manually whenever `$accent` or the surface/text palette changes.

### 2. HTML / Template

| File | Branding Content |
|---|---|
| `frontend/src/index.html` | `<title>` tag (likely "UTMStack"), favicon reference, `.bg-image-utmstack` CSS class, loading text |
| `backend/src/main/resources/templates/mail/activationEmail.html` | "UTMStack" in subject/body |
| `backend/src/main/resources/templates/mail/alertEmail.html` | "UTMStack" in email header/footer |
| `backend/src/main/resources/templates/mail/alertEmailAttachment.html` | Same |
| `backend/src/main/resources/templates/mail/complianceScheduleEmail.html` | Same |
| `backend/src/main/resources/templates/mail/creationEmail.html` | Same |
| `backend/src/main/resources/templates/mail/elasticClusterStatusEmail.html` | Same |
| `backend/src/main/resources/templates/mail/newIncidentEmail.html` | Same |
| `backend/src/main/resources/templates/mail/passwordResetEmail.html` | Same |
| `backend/src/main/resources/templates/mail/tfaCodeEmail.html` | Same |
| Multiple `app-module/guides/*.component.html` | "UTMStack agent", agent install paths |

### 3. TypeScript / JavaScript Source

| File | Branding Content |
|---|---|
| `shared/constants/global.constant.ts` | `DEMO_URL` and `ONLINE_DOCUMENTATION_BASE` now delegated to `BRANDING.demoUrl` / `BRANDING.docsUrl` from `environments/branding.ts` — no longer hardcoded. `SAAS_DEFAULT_PASSWORD` removed (DEBT-20). |
| `core/auth/account.service.ts` | `console.log('UTMStack 401')` |
| `blocks/interceptor/auth-expired.interceptor.ts` | `console.log('UTMStack 401')` |
| `scanner/` TS files (6 files) | Download filenames with "UTMStack", service names "UTMStack Scanner", "UTMStack Default" |
| `app-module/guides/*.ts` files | Service paths `/opt/utmstack-linux-agent/`, `C:\Program Files\UTMStack\` |
| Integration guide step text files | "UTMStack agent", "UTMStack features" |

### 4. SCSS / CSS

| File | Branding Content |
|---|---|
| `src/styles.scss` | CSS class `.bg-image-utmstack`, `.bg-image-utmstack-blurry` |
| `src/styles/_tokens.scss` | All color tokens — **single source of truth** |
| `src/assets/styles/*.scss` | Comment headers "UTMStack Dark Cyber Theme v2.0" etc. |

### 5. Application Config / Meta

| Location | Content |
|---|---|
| `frontend/src/app/app.constants.ts` | `COOKIE_AUTH_TOKEN = 'utmauth'` |
| `backend/src/main/resources/config/application.yml` | `spring.application.name: UTMStack-API`, API docs title "UTMStack Backend API" |
| `backend/pom.xml` | `<name>UTMStack-API</name>` |
| `installer/main.go` | `"### UTMStack ###"` in help text |
| `agent/cmd/root.go` | `"UTMStack Agent CLI"`, `"UTMStack Agent"` in description |
| `utmstack-collector/main.go` | `"### UTMStack Collector ###"` in help text |
| `README.md` | Full UTMStack branding, links to utmstack.com |

### 6. PDF Reports and Compliance Output

| Location | Content |
|---|---|
| `frontend/src/styles.scss` | `.compliance-front-page` — uses logo images in generated PDF |
| Report template HTML | UTMStack logo embedded in PDF header/footer via `UtmReportHeaderComponent` |
| `scanner/` report exports | Downloads named "UTMStack vulnerabilities report", etc. |

### 7. API Documentation

| Location | Content |
|---|---|
| `application.yml` → jhipster.api-docs | `title: "UTMStack Backend API"`, `description: "UTMStack Backend API documentation"` |

---

## Rebranding Scope Estimate

| Category | Files to Change | Effort |
|---|---|---|
| Logo image files | 11 files | Low (file replacement) |
| Favicon | 1 file | Trivial |
| CSS color tokens | 1 file (`_tokens.scss`) | Low (variable update) |
| Email templates | 9 HTML files | Medium (text search/replace + template redesign) |
| Integration guide HTML | 10+ files | Medium (automated search/replace) |
| TypeScript constants/strings | ~15 files | Low (search/replace) |
| SCSS class names (`.bg-image-utmstack`) | 2–3 files | Low |
| Agent/collector CLI strings | 4 Go files | Low |
| Backend app config / pom.xml | 2 files | Trivial |
| PDF/compliance report branding | Logo replacement propagates | Low |
| `COOKIE_AUTH_TOKEN = 'utmauth'` | 1 file | ⚠️ Breaking if users have existing sessions |

**Total impact**: Moderate — mostly text substitution and image replacement. The design system's token architecture means color changes cascade from one file.

---

## Safer Branding Abstraction — Implementation Status

### 1. Single Branding Config File ✅ Implemented

`frontend/src/environments/branding.ts` exists and is the canonical source for all product identity
(productName, productNameShort, tagline, logo paths, demoUrl, docsUrl, supportUrl, brandAccent).

`shared/constants/global.constant.ts` now imports from `BRANDING` — `DEMO_URL` and
`ONLINE_DOCUMENTATION_BASE` are no longer hardcoded. `SAAS_DEFAULT_PASSWORD` was removed (DEBT-20).

> ⚠️ `COOKIE_AUTH_TOKEN`, `SESSION_AUTH_TOKEN`, and `ACCESS_KEY` intentionally remain in
> `app.constants.ts` and are NOT referenced from `branding.ts` — changing them is a breaking
> production operation and is documented as high-risk above.

### 2. CSS Custom Properties for Colors — Pending

Extend `_tokens.scss` to also emit CSS custom properties:
```scss
:root {
  --color-accent: #{$accent};
  --color-sev-critical: #{$sev-critical};
  // etc.
}
```
This allows runtime theming without rebuild.

### 3. Email Template Partials — Pending

Centralize product name in a Thymeleaf fragment:
`templates/mail/fragments/product-name.html` → referenced in all 9 email templates

### 4. Backend Config Property — ✅ Implemented

`ApplicationProperties.BrandingProperties` inner class added with fields: `name`, `nameShort`,
`supportUrl`, `docsUrl`. Default values are NilaChakra strings. Override via YAML:

```yaml
application:
  branding:
    name: "NilaChakra"
    name-short: "NC"
    support-url: "https://nilachakra.com/contact"
    docs-url: "https://docs.nilachakra.com"
```

Or via environment variables (Spring Boot property placeholder syntax now active in `application.yml`):

```bash
APPLICATION_BRANDING_NAME=MyBrand
APPLICATION_BRANDING_NAME_SHORT=MB
```

The `application.yml` branding block is live and uses `${APPLICATION_BRANDING_NAME:NilaChakra}` /
`${APPLICATION_BRANDING_NAME_SHORT:NC}` — defaults apply when env vars are absent. No YAML edit
is needed to override the product name at deploy time.

Inject in services via: `@Autowired ApplicationProperties props; props.getBranding().getName()`

---

## High-Risk Branding Changes

| Change | Risk |
|---|---|
| Renaming `COOKIE_AUTH_TOKEN = 'utmauth'` | **Breaking** — existing user sessions in production will be invalidated |
| Renaming `SESSION_AUTH_TOKEN` key pattern (hostname-based) | **Breaking** — all active sessions lost |
| Changing integration guide agent install paths | **Operational** — agents installed via old paths won't be updated |
| Renaming `Utm-Internal-Key` header | **Breaking** — requires coordinated agent + backend deployment |
