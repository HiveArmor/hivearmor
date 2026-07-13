# Requirements Document

## Introduction

After each rebrand phase, security-critical contracts must be verified. This spec defines the security regression review that runs after SPEC 6 (UI) and SPEC 7 (Backend) are complete.

## Requirements

### Requirement 1: Auth Flow Integrity

**User Story:** As a security engineer, I want automated verification that the login → dashboard → logout flow still works correctly after rebranding, with no session invalidation.

#### Acceptance Criteria

1. A Playwright test SHALL complete login with admin/localdev123!, navigate to /dashboard, and verify the page loads.
2. THE `utmauth` cookie SHALL be set on the response to `POST /api/authenticate`.
3. THE `Authorization: Bearer <token>` header SHALL be present on all `/api/` requests.
4. THE `Utm-Internal-Key` header SHALL be present on all `/api/` requests after login.
5. Logout SHALL clear the auth token and redirect to login.

### Requirement 2: RBAC Verification

**User Story:** As a security engineer, I want to verify that ROLE_ADMIN and ROLE_USER permissions are unchanged after rebranding.

#### Acceptance Criteria

1. An unauthenticated request to `/api/users` SHALL return HTTP 401.
2. An authenticated ROLE_USER request to `/management/users` SHALL return HTTP 403 (admin only).
3. An authenticated ROLE_ADMIN request to `/api/users` SHALL return HTTP 200.

### Requirement 3: Frozen Identifier Verification

**User Story:** As a security engineer, I want automated confirmation that all frozen identifiers are still in their required values.

#### Acceptance Criteria

1. `COOKIE_AUTH_TOKEN === 'utmauth'` — verified by Karma spec from SPEC 5.
2. `ACCESS_KEY === 'Utm-Internal-Key'` — verified by Karma spec from SPEC 5.
3. `spring.application.name === 'UTMStack-API'` — verified by Spring Boot test from SPEC 5.
4. `utm_*` table names in Liquibase XML unchanged — verified by git diff.
5. `X-UtmStack-error` header still read by frontend error handler.
