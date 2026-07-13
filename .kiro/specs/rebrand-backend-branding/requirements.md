# Requirements Document

## Introduction

The Spring Boot backend still displays "UTMStack" in API documentation titles, email templates, and certain log/error messages. This spec replaces user-visible backend brand strings with NilaChakra, using the `application.branding.*` YAML block already implemented. Java package names (`com.park.utmstack`) are out of scope for this spec — they are an internal identifier addressed in the backend migration spec.

## Requirements

### Requirement 1: Email Template Brand Consistency

**User Story:** As an administrator receiving system emails, I want all email content to display NilaChakra, not UTMStack.

#### Acceptance Criteria

1. THE `branding.html` Thymeleaf fragment SHALL exist at `backend/src/main/resources/templates/mail/fragments/branding.html`.
2. ALL 9 email templates SHALL use the branding fragment for their header and footer.
3. ZERO occurrences of "UTMStack" or "utmstack.com" SHALL exist in `backend/src/main/resources/templates/mail/**/*.html`.
4. THE MailService SHALL inject `ApplicationProperties.BrandingProperties` and pass `brandingName` and `brandingSupportUrl` to every template context.

### Requirement 2: API Documentation Title

**User Story:** As a developer using the Swagger UI, I want the API documentation to display the NilaChakra product name.

#### Acceptance Criteria

1. THE `jhipster.api-docs.title` SHALL be `${application.branding.name} Backend API`.
2. THE `spring.application.name` SHALL remain `UTMStack-API` (Prometheus metric tag — DO NOT CHANGE).

### Requirement 3: Backend Compile Safety

**User Story:** As a CI engineer, I want the backend to compile and all tests to pass after branding changes.

#### Acceptance Criteria

1. `mvn -s settings.xml -B` SHALL compile without errors after all changes.
2. The existing backend test suite SHALL pass (once `MAVEN_TK` is available for test execution).
