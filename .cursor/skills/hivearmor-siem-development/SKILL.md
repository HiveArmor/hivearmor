---
name: hivearmor-siem-development
description: HiveArmor enterprise SIEM/XDR platform development workflow. Guides spec-driven development, multi-service architecture, security fixes, and feature implementation across frontend-v3, backend, agents, and event-processor. Use when working on HiveArmor features, security fixes, or architectural changes.
---

# HiveArmor SIEM Development Workflow

## Overview

HiveArmor is an enterprise SIEM/XDR platform with a complex multi-language architecture:

- **Frontend-v3**: React 18 + Vite + PatternFly (active UI)  
- **Backend**: Java 17 + Spring Boot 3.3 + JHipster 8  
- **Event Processor**: Go correlation engine + 17 plugins  
- **Agents**: Go endpoint agents (Windows/Linux/macOS)  
- **Data Store**: PostgreSQL + OpenSearch (v3-hive-* indices)  

## Pre-Session Checklist

Before starting any HiveArmor development work:

```bash
# 1. Verify you're in the correct directory
pwd # Should be /Users/encryptshell/GIT/UTMStack-11

# 2. Check current branch and status
git status

# 3. Ensure local dev environment is running
cd local-dev && docker compose ps
# Services should be Up: postgres, opensearch, backend, frontend-v2
```

## Workflow Decision Tree

**For Frontend-v3 Implementation:**
→ Follow Spec-Driven Development process (see Section A)

**For Backend Features/APIs:**
→ Follow Feature Implementation process (see Section B)  

**For Security Fixes (SEC-01 to SEC-04):**
→ Follow Security Fix workflow (see Section C)

**For Agent/Go Components:**
→ Follow Go Service Development (see Section D)

**For Full Feature End-to-End:**
→ Combine multiple sections as needed

---

## Section A: Spec-Driven Development (Frontend-v3)

### A1. Session Selection

1. **Read the session overview:**
   ```bash
   cat .plan/frontend-v3-spec/11-SESSIONS-OVERVIEW.md
   ```

2. **Identify your target session** (S01, S02, etc.)

3. **Load the corresponding spec file:**
   ```bash
   # Read the SDD guide first (always)
   cat .plan/frontend-v3-spec/00-SDD-GUIDE.md
   
   # Then read your target spec file
   cat .plan/frontend-v3-spec/0X-YOUR-FEATURE.md
   ```

### A2. Implementation Rules

**NEVER:**
- Implement beyond the spec scope
- Refactor existing code outside spec boundaries  
- Add dependencies not listed in the spec
- Change design token values in `src/styles/tokens.css`
- Modify existing API endpoint paths
- Skip gate validation

**ALWAYS:**
- Read existing files you'll modify before coding
- Follow PatternFly component patterns via `Ha*` wrappers
- Use design tokens from `tokens.css`
- Import shared utilities from `src/lib/` and `src/hooks/`

### A3. Gate Process (Required)

After implementation, run all four gates:

```bash
cd frontend-v3

# Gate 1: Lint (zero errors required)
npm run lint

# Gate 2: TypeScript (zero errors required)  
npm run type-check

# Gate 3: Tests (all pass required)
npm run test

# Gate 4: Build (success required)
npm run build
```

**Session ends only when all gates pass.**

---

## Section B: Feature Implementation (Backend + Frontend)

### B1. Feature File Analysis

1. **Identify the feature:**
   ```bash
   ls .plan/features/
   # Choose F-XX-name.md, ARCH-XX-name.md, OWN-XX-name.md, or SEC-FIXES.md
   ```

2. **Read the feature specification:**
   ```bash
   cat .plan/features/YOUR-FEATURE.md
   # Look for the SESSION PROMPT at the bottom
   ```

### B2. Backend Development Workflow

**For REST endpoints:**

1. **Check existing API patterns:**
   ```bash
   ls backend/src/main/java/com/hivearmor/web/rest/
   ```

2. **Follow naming convention:**
   - Prefix: `/api/ha-*` for new endpoints
   - Use existing patterns from confirmed API list in CLAUDE.md

3. **Security requirements:**
   - Every endpoint needs `@PreAuthorize` or explicit SecurityConfiguration entry
   - Never hardcode role names (use human-readable labels)

4. **Database changes:**
   - New Liquibase changeset: `YYYYMMDDNNN_description.xml`
   - Add to `master.xml`
   - Run `mvn -s settings.xml liquibase:validate`

### B3. OpenSearch Integration

**Index pattern (NEVER change):**
`v3-hive-<type>-YYYY.MM.DD`

**Common index types:**
- `v3-hive-alert-YYYY.MM.DD` (alerts)
- `v3-hive-log-YYYY.MM.DD` (raw events)
- `v3-hive-statistics-YYYY.MM.DD` (metrics)

---

## Section C: Security Fixes (SEC-01 to SEC-04)

Critical security issues that must be fixed before feature work:

### C1. SEC-01: Password in GET Query
**File:** `AccountResource.java`  
**Issue:** Password transmitted via GET query parameter  
**Fix:** Convert to POST with request body  

### C2. SEC-02: JWT Signing Key in DB  
**File:** `TokenProvider.java`  
**Issue:** JWT key persisted and reused  
**Fix:** Generate ephemeral key on startup  

### C3. SEC-03: CORS Wildcard in Production
**File:** `application-prod.yml`  
**Issue:** CORS allows all origins in production  
**Fix:** Restrict to known domains  

### C4. SEC-04: gRPC Insecure TLS
**File:** `GrpcConfiguration.java`  
**Issue:** gRPC uses insecure TLS  
**Fix:** Implement mutual TLS authentication  

**Validation:** After each fix, verify no regression in local dev auth flow.

---

## Section D: Go Service Development

### D1. Agent Development

**Build requirements:**
```bash
cd agent
# Requires ldflags injection for authentication
go build -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=<secret>'" .
```

**Key files:**
- `main.go` - Service entry point
- `config/` - Configuration management  
- `collector/` - Log collection logic
- `transport/` - gRPC communication

### D2. Event Processor Plugins

**Location:** `plugins/*/`
**Binary naming:** Must be `com.hivearmor.<name>.plugin`

**Build pattern:**
```bash
cd plugins/your-plugin
go build -o com.hivearmor.yourplugin.plugin .
```

**Integration:** Plugin binaries loaded by event-processor at runtime

---

## Section E: Testing and Validation

### E1. Local Environment Verification

```bash
# Start services
cd local-dev && docker compose up -d

# Verify all services healthy
curl -f http://localhost:8088/api/account \
  -H "Authorization: Bearer $TOKEN"

# Test frontend connectivity  
curl -f http://localhost:5173
```

### E2. API Token Generation

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

### E3. Cross-Service Integration Testing

**Backend → OpenSearch:**
```bash
# Verify index pattern
curl -X GET "localhost:9200/_cat/indices/v3-hive-*"
```

**Agent → Agent Manager:**
```bash  
# Check agent registry
curl -f http://localhost:8088/api/agent-manager/agents \
  -H "Authorization: Bearer $TOKEN"
```

---

## Section F: Common Patterns and Anti-Patterns

### F1. Frontend Component Patterns

**✅ Correct:**
```typescript
// Use Ha* wrappers for PatternFly
import { HaButton, HaCard } from '@/components/ha-ui'

// Use design tokens
style={{ color: 'var(--ha-text-primary)' }}

// Import shared utilities
import { formatSeverity } from '@/lib/severity'
```

**❌ Avoid:**
```typescript
// Direct PatternFly imports
import { Button } from '@patternfly/react-core'

// Hardcoded colors
style={{ color: '#E8EDF4' }}

// Duplicate utility functions
const formatSeverity = (severity) => // ...
```

### F2. Backend Security Patterns

**✅ Secure endpoint:**
```java
@GetMapping("/ha-alerts")
@PreAuthorize("hasRole('ANALYST')")
public ResponseEntity<List<Alert>> getAlerts() {
    // Implementation
}
```

**❌ Insecure endpoint:**
```java
@GetMapping("/ha-alerts")  // No @PreAuthorize
public ResponseEntity<List<Alert>> getAlerts() {
    // Implementation
}
```

### F3. Go Service Patterns

**✅ Proper error handling:**
```go
if err != nil {
    log.Error("Failed to process event", "error", err)
    return fmt.Errorf("event processing failed: %w", err)
}
```

**❌ Silent failures:**
```go
if err != nil {
    // Silent failure - don't do this
    return nil
}
```

---

## Section G: Troubleshooting Guide

### G1. Frontend Build Failures

**ESLint errors:**
```bash
cd frontend-v3 && npm run lint -- --fix
```

**TypeScript errors:**
```bash
cd frontend-v3 && npm run type-check
# Fix reported type issues before proceeding
```

**Test failures:**
```bash
cd frontend-v3 && npm run test -- --reporter=verbose
```

### G2. Backend Issues

**Maven dependency issues:**
```bash
cd backend
mvn clean install -s settings.xml
# Ensure MAVEN_TK environment variable is set
```

**Database migration failures:**
```bash  
cd backend
mvn -s settings.xml liquibase:validate
mvn -s settings.xml liquibase:update
```

### G3. Agent/Go Build Issues

**Missing ldflags:**
- Agent, collector, and as400 require `REPLACE_KEY` injection
- Cannot authenticate without proper ldflags
- CI injects `$AGENT_SECRET_PREFIX` automatically

**Go module issues:**
```bash
go mod tidy
go mod download
```

---

## Quick Reference Commands

```bash
# Project navigation
cd /Users/encryptshell/GIT/UTMStack-11

# Start local environment
cd local-dev && docker compose up -d

# Frontend development  
cd frontend-v3 && npm run dev

# Backend development
cd backend && mvn -s settings.xml -B

# Full validation suite
cd frontend-v3 && npm run lint && npm run type-check && npm run test && npm run build

# API testing
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate -H "Content-Type: application/json" -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

# Check service health
curl -f http://localhost:8088/api/account -H "Authorization: Bearer $TOKEN"
```

## Key File Locations

| Component | Location |
|-----------|----------|
| Backend REST | `backend/src/main/java/com/hivearmor/web/rest/` |
| Backend Service | `backend/src/main/java/com/hivearmor/service/` |
| Frontend pages | `frontend-v3/src/pages/` |
| Frontend components | `frontend-v3/src/components/` |
| Design tokens | `frontend-v3/src/styles/tokens.css` |
| API contracts | `.plan/frontend-v3-spec/09-API-CONTRACT.md` |
| Feature specs | `.plan/features/` |
| Session specs | `.plan/frontend-v3-spec/` |

Remember: Always read the relevant spec file completely before implementing. Never implement beyond spec scope. Always validate through the gate process.