# Requirements Document

## Introduction

The Java backend uses package `com.park.utmstack` (1,001 files) and the Go services use module path `github.com/utmstack/UTMStack` (288 files). This spec plans the migration of these internal identifiers to NilaChakra equivalents. This is the HIGHEST RISK spec — it requires coordinated deployment of all services.

**⚠️ DECISION REQUIRED before this spec can proceed:**
- New Java package name (recommended: `com.nilachakra`)
- New GitHub organization name (for Go module paths)
- New container registry (for Docker images)
- Whether `spring.application.name` and Prometheus dashboards will be updated

## Requirements

### Requirement 1: Java Package Rename

**User Story:** As a developer, I want the Java package hierarchy to reflect NilaChakra so the internal code namespace matches the product.

#### Acceptance Criteria

1. ALL Java source files SHALL have package `com.nilachakra` (or approved alternative).
2. ALL Spring bean identifiers, configuration classes, and JPA entities SHALL compile under the new package.
3. `mvn -B -Pprod clean package -s settings.xml` SHALL produce a working WAR after rename.
4. The `utm_*` database table names SHALL remain UNCHANGED in this phase (separate DB migration spec required).

### Requirement 2: Go Module Path Update

**User Story:** As a Go developer, I want the module import paths to reference NilaChakra so the build system is consistent.

#### Acceptance Criteria

1. ALL `go.mod` files SHALL use the new module path (e.g., `github.com/nilachakra/nilachakra/...`).
2. ALL Go import statements SHALL be updated consistently.
3. `go build` SHALL succeed for all 8 Go modules.
4. Agent/collector binaries SHALL be rebuilt and signed before distribution.
5. This requirement SHALL NOT be implemented until the new GitHub organization is created.

### Requirement 3: Container Image Registry

**User Story:** As a platform engineer, I want container images published to a NilaChakra registry.

#### Acceptance Criteria

1. CI/CD pipelines SHALL publish to `ghcr.io/nilachakra/nilachakra/<service>:<tag>` (or equivalent).
2. Docker Compose and installer SHALL reference the new registry.
3. This requirement SHALL NOT be implemented until the new container registry is provisioned.

### Requirement 4: Zero Regression on DB Schema

**User Story:** As a DBA, I want to confirm that the Java package rename does NOT affect the database schema.

#### Acceptance Criteria

1. ALL `utm_*` table names SHALL remain unchanged after the Java package rename.
2. ALL JPA `@Table(name="utm_...")` annotations SHALL be preserved exactly.
3. NO new Liquibase changesets are required for this phase.
