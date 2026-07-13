---
inclusion: always
---

# Branding Rules

## Current Brand Identity

| Element | Current value |
|---|---|
| Product name | **NilaChakra** |
| Product name short | **NC** |
| Tagline | Enterprise SIEM + XDR |
| Primary accent color | `$accent` = `#4F8EF7` — defined once in `_tokens.scss` |
| UI font | Inter |
| Monospace / data font | JetBrains Mono |
| Cookie name | `utmauth` (**FROZEN — see below**) |
| Docs URL | `ONLINE_DOCUMENTATION_BASE` → `BRANDING.docsUrl` in `frontend/src/environments/branding.ts` |
| Demo URL | `DEMO_URL` → `BRANDING.demoUrl` in `frontend/src/environments/branding.ts` |
| Brand config file | `frontend/src/environments/branding.ts` — **single source of truth for all frontend brand values** |

## How to Rebrand (the safe way)

To change the product name/color/URLs:
1. Edit `frontend/src/environments/branding.ts` — change `productName`, `tagline`, `supportUrl`, `docsUrl`, `demoUrl`, `brandAccent`
2. Edit `backend/src/main/resources/config/application.yml` branding block OR set `APPLICATION_BRANDING_NAME` env var
3. Replace the 4 canonical SVG logo files in `frontend/src/assets/img/` (marked with `<!-- PLACEHOLDER -->`)
4. Replace `frontend/src/assets/img/favicon.ico`
5. Update `$accent` in `frontend/src/styles/_tokens.scss` if the primary color changes

That is all. Nothing else needs to change for a brand update.

## Color — Single Source of Truth

**All colors live in `frontend/src/styles/_tokens.scss` and nowhere else.**

Every other SCSS file imports tokens and uses variables. Adding a hex value anywhere outside `_tokens.scss` is a violation.

```scss
// ✓ correct
border-color: $border-base;
background: $bg-elevated;
color: $sev-critical;

// ✗ never hardcode
border-color: #1C2232;
background: #1C2232;
color: #FF4560;
```

To change the product's primary color, update only `$accent` in `_tokens.scss` AND `brandAccent` in `branding.ts` (they must stay in sync — no programmatic link exists between SCSS and TypeScript).

## Logo Files — Canonical Names

All logos are in `frontend/src/assets/img/`. Use ONLY these canonical filenames:

| File | Used for | Status |
|---|---|---|
| `logo-full.svg` | Primary — header, login page | ✅ Placeholder committed |
| `logo-icon.svg` | Icon-only — sidebar mini, favicon source | ✅ Placeholder committed |
| `logo-white-full.svg` | White full logo — dark backgrounds, PDF header | ✅ Placeholder committed |
| `logo-white-icon.svg` | White icon-only — dark compact contexts | ✅ Placeholder committed |
| `logo-animated.gif` | Loading spinner | ⚠️ Placeholder needed |
| `favicon.ico` | Browser tab icon | ⚠️ Replace with NilaChakra favicon |

All placeholder SVG files contain `<!-- PLACEHOLDER: Replace with final NilaChakra logo artwork -->`.
When final artwork is ready, replace these 4 SVG files — no source code changes required.

SVG logo files cannot import SCSS, so their colors are hardcoded inside the SVG. If `$accent` changes in `_tokens.scss`, manually update the SVG fill colors to match.

## Branding Touch Points — Canonical Locations

| Location | What it controls |
|---|---|
| `frontend/src/environments/branding.ts` | **ALL** frontend brand values (productName, URLs, logo paths) |
| `frontend/src/styles/_tokens.scss` | All colors |
| `frontend/src/assets/img/logo-*.svg` | Logo image files |
| `frontend/src/favicon.ico` | Browser tab icon |
| `backend/src/main/resources/config/application.yml` | Backend branding (name, URLs) |
| `backend/src/main/resources/templates/mail/fragments/branding.html` | Email header/footer |

## ⛔ FROZEN IDENTIFIERS — DO NOT CHANGE

These identifiers CANNOT be changed without breaking live deployments. Changing them requires a coordinated full-stack release with user notice.

| Identifier | Value | Why frozen |
|---|---|---|
| Cookie name | `utmauth` | Invalidates ALL active browser sessions |
| Session storage key | `<HOSTNAME>_AUTH_TOKEN` | Logs out all active users |
| Internal API header | `Utm-Internal-Key` | Breaks ALL frontend → backend API calls |
| X-error HTTP header | `X-UtmStack-error` | Frontend reads this header for error display |
| Database tables | `utm_*` (76 tables) | Live PostgreSQL data — requires full DB migration |
| OpenSearch indices | `v11-*` | Live alert/log data |
| Agent binary paths | `/opt/utmstack-linux-agent/` | Deployed on endpoints — requires new binary release |
| Agent binary paths | `C:\Program Files\UTMStack\` | Same |
| Go module path | `github.com/utmstack/UTMStack/` | Until new GitHub org is created |
| Container registry | `ghcr.io/utmstack/utmstack/` | Until new registry is provisioned |
| Spring app name | `UTMStack-API` | Prometheus metric tags depend on this value |
| Plugin binary prefix | `com.utmstack.<name>.plugin` | EventProcessor loads plugins by this exact name |

## Email Templates

9 Thymeleaf templates in `backend/src/main/resources/templates/mail/`:
`activationEmail`, `alertEmail`, `alertEmailAttachment`, `complianceScheduleEmail`, `creationEmail`, `elasticClusterStatusEmail`, `newIncidentEmail`, `passwordResetEmail`, `tfaCodeEmail`

Shared layout is in `templates/mail/fragments/branding.html`. Change the fragment first, then verify all 9 templates render correctly before merging.

The product name in emails is controlled by `application.branding.name` in `application.yml` (override via `APPLICATION_BRANDING_NAME` env var).

## Adding New Branding References

If new code must reference the product name or a URL:
1. **Frontend**: import from `frontend/src/environments/branding.ts` → use `BRANDING.productName`, `BRANDING.supportUrl` etc.
2. **Backend**: inject `ApplicationProperties.BrandingProperties` and use `branding.getName()`, `branding.getSupportUrl()`
3. Never inline brand strings as literals in templates or business logic
