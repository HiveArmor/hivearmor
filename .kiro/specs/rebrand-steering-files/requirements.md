# Requirements Document

## Introduction

The `.kiro/steering/*.md` files and root documentation files still reference "UTMStack" as the product name. These must be updated to NilaChakra so that AI-assisted development (Kiro autopilot) generates code using the correct product name, and so that on-boarding docs are consistent.

## Requirements

### Requirement 1: Steering File Brand Names

**User Story:** As a developer using Kiro, I want all steering files to reference NilaChakra so that auto-generated code uses the correct brand.

#### Acceptance Criteria

1. THE `branding.md` steering file SHALL update the product name from UTMStack to NilaChakra.
2. THE `product.md` steering file SHALL reference NilaChakra in the product description.
3. THE `development-workflow.md` SHALL note the container registry change when ready.
4. THE `AGENTS.md` root file SHALL update the product overview section.
5. THE steering files SHALL retain all warnings about frozen identifiers (`utmauth`, `Utm-Internal-Key`, database table names).

### Requirement 2: No Regression on Frozen Identifiers

**User Story:** As a developer, I want steering files to clearly document what MUST NOT be changed, so I don't accidentally break live deployments.

#### Acceptance Criteria

1. THE steering files SHALL contain a clearly marked "FROZEN — DO NOT CHANGE" section listing all frozen identifiers.
2. THE `branding.md` SHALL include a table distinguishing safe-to-change brand strings from frozen system identifiers.
