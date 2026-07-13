# Requirements Document

## Introduction

The Angular frontend still contains 44 files with UTMStack/utmstack occurrences in display text, guide step arrays, and component strings. This spec clears all remaining user-visible brand strings from the UI layer. Internal class names (`UtmstackCoreModule`), agent shell command paths, and the `x-utmstack-error` header reference are explicitly out of scope.

## Requirements

### Requirement 1: Guide Display Text

**User Story:** As a Security Engineer following integration guides, I want the installation instructions to reference NilaChakra so that documentation matches the product I am configuring.

#### Acceptance Criteria

1. THE guide step text arrays SHALL replace "UTMStack agent" and "UTMStack features" with template literals using `BRANDING.productName`.
2. THE Windows display path label in guide-netflow SHALL use `BRANDING.productName` for the label (NOT the actual shell command path).
3. Shell command paths (`/opt/utmstack-linux-agent/`, `C:\Program Files\UTMStack\`) SHALL NOT be changed.

### Requirement 2: Remaining Component Strings

**User Story:** As a user of the platform, I want every visible text element to say NilaChakra, not UTMStack.

#### Acceptance Criteria

1. `utm-lite-version.component.html` — "UTMStack Lite" uses `BRANDING.productName`.
2. `contact-us.component.html` — support URL from `BRANDING.supportUrl`.
3. `app-restart-api.component.html` — "UTMStack detected changes" uses `BRANDING.productName`.
4. `app-config-delete-confirm.component.html` — uses `BRANDING.productName`.
5. Scanner report filenames use `BRANDING.productName`.
6. `UtmReportHeaderComponent` seeds report logo from `BRANDING.logoWhitePath`.

### Requirement 3: Zero Remaining Occurrences

**User Story:** As the product owner, I want a verifiable guarantee that no user-visible UTMStack string remains in the Angular application.

#### Acceptance Criteria

1. `grep -r '"UTMStack"\|'\''UTMStack'\''' frontend/src/app --include="*.{ts,html}"` SHALL return zero results, excluding:
   - `x-utmstack-error` (HTTP header, API contract — frozen)
   - Class names containing "Utmstack" (internal identifiers)
   - Comments
2. THE application title SHALL read "NilaChakra" in the browser tab.
3. `AppComponent.ngOnInit()` SHALL call `titleService.setTitle(BRANDING.productName)`.
