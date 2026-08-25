# HiveArmor Development Reference

## Architecture Quick Reference

### Service Communication Matrix

| From | To | Protocol | Auth | Port |
|------|-----|----------|------|------|
| Browser | Backend | HTTPS | JWT Bearer | 8088 |
| Backend | OpenSearch | HTTPS | Basic Auth | 9200 |
| Backend | Agent Manager | gRPC | INTERNAL_KEY | - |
| Backend | Event Processor | HTTP | X-Internal-Key | - |
| Agent | Agent Manager | gRPC TLS 1.3 | REPLACE_KEY | - |
| Collector | Agent Manager | gRPC TLS 1.3 | REPLACE_KEY | - |

### OpenSearch Index Patterns (Immutable)

```
v3-hive-alert-YYYY.MM.DD      # Security alerts
v3-hive-log-YYYY.MM.DD        # Raw log events  
v3-hive-statistics-YYYY.MM.DD # EPS metrics
v3-hive-offense-*             # Correlated findings
v3-hive-compliance-evidence-YYYY.MM.DD # Compliance data
v3-hive-soc-ai               # AI triage results (static)
v3-hive-api-access-logs-*    # API audit trail
v3-hive-backend-logs         # Application logs (static)
```

### Technology Stack Constraints

| Layer | Required | Forbidden |
|-------|----------|-----------|
| Frontend UI | PatternFly 6 via Ha* wrappers | Tailwind, MUI, Ant Design |
| Data Grids | AG Grid Community 36 | PF Table for large datasets |
| Charts | Apache ECharts via HaChart | Chart.js, Recharts, D3 direct |
| Server State | TanStack Query v5 | SWR, RTK Query |
| UI State | Zustand v5 | Redux, MobX, Context global |
| Backend | Spring Boot 3.3 + JHipster 8 | Custom framework |

## API Endpoint Reference (Confirmed)

### Authentication
```
POST /api/authenticate
GET /api/account
```

### Alerts  
```
GET /api/ha-alerts (page, size, sort, filters → X-Total-Count header)
GET /api/ha-alerts/count-open-alerts
POST /api/ha-alerts/status
POST /api/ha-alerts/notes
POST /api/ha-alerts/tags
POST /api/ha-alerts/convert-to-incident
GET /api/alerts/stream (SSE)
GET /api/eps/stream (SSE)
```

### Incidents
```
GET /api/ha-incidents (page, size, sort)
POST /api/ha-incidents
GET /api/ha-incidents/{id}
PUT /api/ha-incidents/change-status
PUT /api/ha-incidents/{id}/priority
POST /api/ha-incidents/add-alerts
GET /api/ha-incidents/users-assigned
GET /api/ha-incidents/{id}/timeline
GET /api/ha-incidents/{id}/entities
POST /api/ha-incidents/{id}/ai-summary
GET /api/ha-incidents/sla-stats
```

### Correlation Rules
```
GET /api/correlation-rule/search-by-filters
POST /api/correlation-rule
GET /api/correlation-rule/{id}
PUT /api/correlation-rule
DELETE /api/correlation-rule/{id}
PUT /api/correlation-rule/activate-deactivate
POST /api/correlation-rule/test
POST /api/ha-sigma-sync/trigger
```

### Search & Analytics
```
POST /api/ha-search/nl-query
GET /api/ha-saved-queries
POST /api/ha-saved-queries
PUT /api/ha-saved-queries/{id}
DELETE /api/ha-saved-queries/{id}
```

## Security Requirements Checklist

### Every REST Endpoint Must Have:
- [ ] `@PreAuthorize` annotation OR explicit SecurityConfiguration entry
- [ ] Input validation and sanitization  
- [ ] Error handling without information disclosure
- [ ] Audit logging for sensitive operations

### Known Security Gaps (Do Not Replicate):
- SEC-03: CLOSED (STAGING CANDIDATE) — offenses/correlated-findings status `@PreAuthorize` + allowlisted scripts; keep `GAP_SEC_03_RESOLVED = true`; UI gates via `canMutateFindingStatus`
- SEC-05: AgentManager no role check → keep remote actions disabled  
- SEC-06: CLOSED (STAGING CANDIDATE) — runVisualization `@PreAuthorize` ADMIN|SOC_MANAGER|ANALYST; keep `GAP_SEC_06_RESOLVED = true`

### Role Mapping (Never expose ROLE_ constants):
```
ROLE_ADMIN → Platform Administrator
ROLE_SOC_MANAGER → SOC Manager  
ROLE_ANALYST → Analyst
ROLE_THREAT_HUNTER → Threat Hunter
ROLE_READ_ONLY → Read Only
ROLE_USER → Standard User
```

## Build Requirements by Component

### Frontend-v3 
```bash
Node 20+, npm
Dependencies: React 18, Vite 5, PatternFly 6
Gates: lint, type-check, test, build (all must pass)
```

### Backend
```bash
Java 17, Maven 3.8+
Environment: MAVEN_TK (GitHub PAT with read:packages)
Spring profiles: dev (default), prod, tls
```

### Go Services (Agent/Collector/AS400)
```bash
Go 1.25.5+
Build flags required: REPLACE_KEY injection via ldflags
Cross-compile: GOOS/GOARCH/CGO_ENABLED=0
```

### Event Processor Plugins
```bash
Go 1.25.5+
Binary naming: com.hivearmor.<name>.plugin (exact)
Build location: plugins/<name>/
```

## Critical File Locations

```
# Configuration
.plan/MASTER_PLAN.md                    # Master roadmap
.plan/PLATFORM_AUDIT.md                # Technical gap analysis
.plan/frontend-v3-spec/00-SDD-GUIDE.md # Spec-driven development rules
CLAUDE.md                               # Repository guide for AI
AGENTS.md                               # Multi-language build guide

# Frontend-v3 Core
frontend-v3/src/styles/tokens.css      # Design tokens (immutable)
frontend-v3/src/components/ha-ui/      # PatternFly wrappers  
frontend-v3/src/pages/                 # Route components
frontend-v3/src/services/              # API client code
frontend-v3/src/store/                 # Zustand stores
frontend-v3/src/hooks/                 # Shared React hooks
frontend-v3/src/lib/                   # Utility functions

# Backend Core  
backend/src/main/java/com/hivearmor/web/rest/     # REST controllers
backend/src/main/java/com/hivearmor/service/      # Business logic
backend/src/main/java/com/hivearmor/domain/       # JPA entities
backend/src/main/resources/config/liquibase/      # DB migrations
backend/src/main/resources/config/                # App configuration

# Go Services
agent/                                  # Endpoint agent
agent-manager/                         # gRPC agent registry  
hivearmor-collector/                   # Log collector
plugins/*/                             # Event processor plugins
shared/                                # Go shared library
```

## Development Environment URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| HiveArmor UI | http://localhost:5173 | admin / localdev123! |
| Backend API | http://localhost:8088 | admin / localdev123! |
| OpenSearch | http://localhost:9200 | admin / LocalDev@2024! |
| OpenSearch Dashboards | http://localhost:5601 | admin / LocalDev@2024! |
| PostgreSQL | localhost:5438 | postgres / localdev123! |

## Common Error Resolutions

### "Plugin not found" (Event Processor)
- Verify binary name is exactly `com.hivearmor.<name>.plugin`
- Check plugin is built in correct location
- Ensure event_processor.Dockerfile copies plugin binary

### "Authentication failed" (Agents)
- Verify ldflags injection: `-X 'config.REPLACE_KEY=<secret>'`
- Check AGENT_SECRET_PREFIX in CI environment  
- Confirm gRPC TLS configuration

### "Type check failed" (Frontend)
- Never use `any` type (use `unknown` + type guards)
- Import types from `@/types/api.types.ts`
- Ensure all imports resolve correctly

### "Maven dependency failure"  
- Set MAVEN_TK environment variable (GitHub PAT)
- Verify settings.xml configuration
- Check GitHub Packages access permissions