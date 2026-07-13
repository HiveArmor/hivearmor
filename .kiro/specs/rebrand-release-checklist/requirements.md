# Requirements Document

## Introduction

This spec defines the final release gate before the NilaChakra rebrand is pushed to production. All previous specs must be complete and all automated checks must pass before this checklist is signed off.

## Requirements

### Requirement 1: All Previous Specs Complete

**User Story:** As the product owner, I want a single gate document that confirms every rebrand phase is done before going to production.

#### Acceptance Criteria

1. SPEC 2 (Steering files) — complete and verified.
2. SPEC 3 (Backend branding) — complete and verified.
3. SPEC 4 (Branding spec, already in product-rebranding) — complete.
4. SPEC 5 (API contract tests) — all tests passing.
5. SPEC 6 (UI implementation) — zero UTMStack in frontend source.
6. SPEC 7 (Backend migration) — compile success (Java phase A minimum).
7. SPEC 8 (Security regression) — all automated + manual checks pass.

### Requirement 2: Build Artifacts Pass

**User Story:** As a CI engineer, I want all build targets to produce clean artifacts.

#### Acceptance Criteria

1. `npm run build` → clean, no errors, bundle ≤ 15MB.
2. `npm test -- --watch=false` → 26+ SUCCESS.
3. `mvn -B -Pprod clean package -s settings.xml` → produces WAR (requires MAVEN_TK).
4. Docker image build succeeds for frontend.

### Requirement 3: Smoke Test Pass

**User Story:** As the product owner, I want to manually verify the rebranded app looks and works correctly before shipping.

#### Acceptance Criteria

1. Login page: NilaChakra logo + heading visible.
2. Browser tab: "NilaChakra".
3. Header: NilaChakra name/logo.
4. Dashboard: loads with alert data.
5. No red console errors on any page.
6. Email test: trigger activation email → "NilaChakra" in subject/body.
