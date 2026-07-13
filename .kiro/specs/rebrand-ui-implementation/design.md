# Design — UI Branding Implementation

## Overview

Mechanically replace remaining "UTMStack" display strings in Angular source with `BRANDING.productName` references. All patterns follow the same approach used in Phase 1-2 (import BRANDING, add `public readonly branding = BRANDING`, replace string in template).

## Components and Interfaces

### Pattern for all affected components

```typescript
// In each .ts file:
import { BRANDING } from '<relative-path>/environments/branding';

export class SomeComponent {
  public readonly branding = BRANDING;
}

// In the .html template:
{{ branding.productName }}     // replaces "UTMStack"
[href]="branding.supportUrl"  // replaces hardcoded URL
[src]="branding.logoWhitePath" // replaces hardcoded logo path
```

### Files requiring change (44 total)

**Group A — Guide step text (7 files):**
- `guide-macos-agent.component.ts`
- `guide-winlogbeat.component.ts`
- `guide-syslog/syslog.steps.ts`
- `guide-kaspersky/kasp-steps.ts`
- `guide-eset/eset-steps.ts`
- `guide-sentinel-one/sentinel.steps.ts`
- `guide-netflow.component.ts` (display label only)

**Group B — Component templates (10 files):**
- `utm-lite-version.component.{ts,html}`
- `contact-us.component.html`
- `app-restart-api.component.{ts,html}`
- `app-config-delete-confirm.component.{ts,html}`
- `utm-report-header.component.ts`
- `asset-save-report.component.ts`
- `scanner-export-vulnerabilities.component.ts`

**Group C — AppComponent title (1 file):**
- `app.component.ts` — inject `Title` service, call `setTitle(BRANDING.productName)`

## Data Models

No data model changes.

## Correctness Properties

### Property 1: Zero UTMStack in Angular Source

**Validates: Requirements 3.1**

`grep -r '"UTMStack"' frontend/src/app --include="*.{ts,html}"` → zero (excluding documented exceptions).

### Property 2: Browser Title is NilaChakra

**Validates: Requirements 3.2, 3.3**

Playwright test navigating to any page shows `document.title === 'NilaChakra'`.

## Error Handling

Components that currently have no `branding` field: adding `public readonly branding = BRANDING` has zero risk — it's a const read at module load time with no async or DI dependencies.
