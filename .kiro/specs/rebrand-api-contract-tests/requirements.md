# Requirements Document

## Introduction

The rebrand must not break auth flows, security contracts, or API contracts. This spec creates automated tests that permanently guard these contracts against accidental future changes.

## Requirements

### Requirement 1: Auth Constant Guard Tests

**User Story:** As a security engineer, I want automated tests that fail if anyone accidentally changes the cookie name or auth header, so active user sessions are never invalidated by a code change.

#### Acceptance Criteria

1. A Karma spec SHALL assert `COOKIE_AUTH_TOKEN === 'utmauth'` and fail the build if changed.
2. A Karma spec SHALL assert `ACCESS_KEY === 'Utm-Internal-Key'` and fail the build if changed.
3. These tests SHALL run in CI as part of `npm test`.

### Requirement 2: Branding Config Completeness Tests

**User Story:** As a developer, I want a test that verifies the BRANDING object has no undefined or empty values, so a bad edit to branding.ts fails fast.

#### Acceptance Criteria

1. A Karma spec SHALL assert every key in `BRANDING` is a non-empty string.
2. A Karma spec SHALL assert `BRANDING.productName === 'NilaChakra'`.
3. A Karma spec SHALL assert `DEMO_URL === BRANDING.demoUrl`.

### Requirement 3: Backend Branding Override Test

**User Story:** As a platform engineer, I want a Spring Boot test that verifies the branding override mechanism works, so I know environment variable rebranding works before deploying.

#### Acceptance Criteria

1. A `@SpringBootTest` SHALL set `APPLICATION_BRANDING_NAME=TestBrand` and verify `applicationProperties.getBranding().getName() === "TestBrand"`.
2. THE same test SHALL verify `spring.application.name` is NOT affected by the override.
