# Design — Backend Migration

## Overview

Three-phase migration: Java package rename → Go module path rename → container registry change. Each phase is independently deployable and must be fully tested before the next begins.

## Architecture Impact

```
Phase A — Java package rename (com.park.utmstack → com.nilachakra)
  Affects: 1,001 .java files
  Tools: IntelliJ Refactor → Rename Package (or sed across all files)
  Risk: HIGH — full rebuild required; JPA entity class names change
  Downtime: None (blue/green deploy)

Phase B — Go module path rename (github.com/utmstack/UTMStack → github.com/nilachakra/nilachakra)
  Affects: 288 .go files + 8 go.mod files + all proto go_package options
  Prerequisite: New GitHub org + repo created
  Risk: CRITICAL — agent binaries must be redistributed to all deployed endpoints
  Downtime: Potential (agents disconnect during update window)

Phase C — Container registry change (ghcr.io/utmstack → ghcr.io/nilachakra)
  Affects: CI/CD pipelines, docker-compose.yml, installer
  Prerequisite: New registry provisioned + credentials set up
  Risk: HIGH — deployment pipelines must be updated atomically
```

## Components and Interfaces

### Phase A — Java rename procedure

```bash
# Using find + sed (or IntelliJ batch rename)
find backend/src -name "*.java" -exec sed -i \
  's/package com\.park\.utmstack/package com.nilachakra/g; \
   s/import com\.park\.utmstack/import com.nilachakra/g' {} \;

# Rename directory structure
mv backend/src/main/java/com/park/utmstack \
   backend/src/main/java/com/nilachakra
# Delete empty com/park/ directory

# Verify
mvn -s settings.xml -B  # must compile
```

### Phase B — Go rename procedure

```bash
# In each Go module directory:
find . -name "*.go" -exec sed -i \
  's|github.com/utmstack/UTMStack|github.com/nilachakra/nilachakra|g' {} \;
# Update go.mod module line
sed -i 's|module github.com/utmstack/UTMStack|module github.com/nilachakra/nilachakra|g' go.mod
# Update proto go_package options
find . -name "*.proto" -exec sed -i \
  's|github.com/utmstack/UTMStack|github.com/nilachakra/nilachakra|g' {} \;
# Regenerate .pb.go files
```

### Phase C — Registry change procedure

```
1. Provision ghcr.io/nilachakra registry (GitHub org settings)
2. Update all workflow files: ghcr.io/utmstack/utmstack → ghcr.io/nilachakra/nilachakra
3. Update docker-compose.yml image references
4. Update installer/main.go registry references
5. Push test build to new registry
6. Update deployment infrastructure to pull from new registry
```

## Data Models

No data model changes (utm_* table names preserved throughout all phases).

## Correctness Properties

### Property 1: Java Compilation Success After Phase A

**Validates: Requirements 1.3**

`mvn -B -Pprod clean package -s settings.xml` produces target/nilachakra.war (or utmstack.war — artifact ID TBD).

### Property 2: DB Table Names Unchanged

**Validates: Requirements 4.1, 4.2, 4.3**

After Phase A: `grep '@Table' backend/src/main/java/**/*.java | grep utm_` returns all 76 table annotations unchanged.

### Property 3: Go Build Success After Phase B

**Validates: Requirements 2.3**

`go build ./...` succeeds in all 8 Go module directories.

## Error Handling

Phase A: If IntelliJ rename misses any file, the compiler immediately flags it as a missing class. Fix and recompile.

Phase B: Go import paths are validated by `go build`. Missing references are compile-time errors.

Phase C: Registry change requires service restart. Plan a maintenance window.
