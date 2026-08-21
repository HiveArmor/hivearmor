# 11 — Parser Intelligence Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** DataParsingPage.tsx, backend-to-ui-capability-matrix.md, HaParsersResource.java audit (from Phase 1A), active-directory.service.ts stub analysis

---

## 1. Current State

### 1.1 What Exists Today

**Frontend:**
- `DataParsingPage.tsx` at route `/admin/data-parsing` (ADMIN-gated)
- Component does basic CRUD for parser/filter configurations
- Uses Monaco Editor (lazy import confirmed in DataParsingPage.tsx)
- Full page — not a `.skip.ts`

**Backend:**
- `HaParsersResource.java` — basic CRUD: GET/POST/PUT/DELETE `/api/ha-parsers/*`
- Endpoints are **UNPROTECTED** (no @PreAuthorize)
- No parser health, drift, or AI endpoints exist

### 1.2 Gap Summary

The "Parser Intelligence" feature as described in the spec requires a sophisticated parser workbench far beyond what exists. The current implementation is a basic configuration editor.

---

## 2. Required Capabilities Assessment

### 2.1 Parser Health Dashboard
**Status: MISSING — FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Dashboard showing per-parser health metrics: events/sec, error rate, last event time, parse rate %
- Backend: No health metrics endpoint; `HaParsersResource` has no `/health` sub-resource
- Frontend: DataParsingPage shows no health metrics; no health dashboard component
- **Required backend:** New `GET /api/ha-parsers/{id}/health` endpoint reading from event-processor metrics
- **Required frontend:** Health dashboard panel; ECharts sparklines per parser

### 2.2 Unparsed Event Clustering
**Status: MISSING — FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Automatically groups unparsed events by structural similarity; identifies patterns for new parser candidates
- Backend: No clustering endpoint; no unparsed event analysis API
- Frontend: Not implemented
- **Required:** ML/pattern-matching backend service + frontend cluster visualization
- **Complexity: HIGH** — requires significant backend ML infrastructure

### 2.3 Drift Detection Alerts
**Status: MISSING — FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Detects when log format deviates from trained parser expectations; alerts on schema drift
- Backend: No drift detection endpoint
- Frontend: Not implemented
- **Required:** Event processor plugin for drift detection; alert/notification surface
- **Complexity: HIGH**

### 2.4 Draft Parser Candidates (AI-Generated)
**Status: MISSING — FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: AI analyzes unparsed event clusters and generates candidate parser YAML rules
- Backend: No AI parser generation endpoint; no `/api/ha-parsers/ai-draft` or similar
- Frontend: Not implemented
- **Required:** AI/LLM backend integration (similar to SOC AI) + draft management workflow
- **Complexity: VERY HIGH** — requires AI infrastructure and constrained DSL definition

### 2.5 Parser Registry with Versions
**Status: MISSING**

- Spec: Versioned parser registry with ability to view history, compare versions, and rollback
- Backend: `HaParsersResource` CRUD has no version field; no version history endpoint
- Frontend: DataParsingPage shows no version history
- **Required backend:** Add `version` and `previousVersion` fields to parser schema; version history endpoint
- **Required frontend:** Version selector dropdown; diff view (Monaco diff editor)
- **Complexity: MEDIUM**

### 2.6 Deployment Governance (Shadow / Canary / Promote / Rollback / Replay)
**Status: MISSING — FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Parsers go through lifecycle:
  1. **Shadow** — parser runs in parallel, output compared but not indexed
  2. **Canary** — parser applied to % of traffic
  3. **Promoted** — parser is live for all traffic
  4. **Rolled back** — previous version restored
  5. **Replayed** — historical events re-parsed with new parser
- Backend: `HaParsersResource` has no deployment status or lifecycle management
- Frontend: DataParsingPage has no deployment workflow
- **Required:** Major new backend service in event-processor; new frontend workflow
- **Complexity: VERY HIGH**

### 2.7 Device Identification
**Status: MISSING**

- Spec: Parser intelligence identifies device type from log samples; auto-suggests parser templates
- Backend: No device identification endpoint
- Frontend: Not implemented
- **Complexity: HIGH**

### 2.8 Raw / Normalised / AI Review Workbench
**Status: MISSING**

- Spec: Side-by-side workbench showing raw log line, normalized fields, and AI-suggested improvements
- Backend: No workbench endpoint; no raw log preview with normalization
- Frontend: DataParsingPage.tsx uses Monaco for YAML editing only — no side-by-side view
- **Complexity: HIGH** — requires new backend log-preview + normalization endpoint

### 2.9 Constrained Parser DSL (No Arbitrary Code)
**Status: MISSING (security requirement)**

- Spec: Parser definitions must use a constrained DSL (YAML-based CEL or similar) — no arbitrary code execution
- Backend: Current parser format is YAML but execution model unclear; Groovy injection in offenses suggests pattern of arbitrary code risks
- Frontend: Monaco editor allows any text input — no DSL validation or constraint
- **Risk:** If parsers can contain arbitrary code, they represent a code injection vector
- **Required:** DSL schema validation in Monaco; backend parser sandbox execution

### 2.10 Test Results
**Status: PARTIALLY_IMPLEMENTED**

- Spec: Test a parser against sample log lines; show pass/fail + field extraction results
- Backend: GET /api/ha-parsers exists but no `/test` sub-resource confirmed
- Frontend: DataParsingPage.tsx has Monaco editor; no test panel found
- **Required:** Add `/api/ha-parsers/{id}/test` endpoint; frontend test panel

### 2.11 Tenant Isolation
**Status: MISSING**

- Spec: Parsers are tenant-scoped in MSSP deployments; parser for tenant A must not affect tenant B
- Backend: No tenant_prefix on parser entities
- Frontend: Not applicable until backend is ready
- **Complexity: MEDIUM** — add tenant_prefix to parser table; filter by active tenant

### 2.12 AI Provenance Tracking
**Status: MISSING**

- Spec: Track which parsers were AI-generated vs human-authored; record model version and timestamp
- Backend: No AI provenance fields in parser schema
- Frontend: Not implemented
- **Required:** Add `createdByAi`, `aiModelVersion`, `aiGeneratedAt` to parser schema

---

## 3. Compliance Summary

| Capability | Status | Complexity | Blocks What |
|---|---|---|---|
| Parser health dashboard | FULL_STACK_DEVELOPMENT_REQUIRED | HIGH | Operational visibility |
| Unparsed event clustering | FULL_STACK_DEVELOPMENT_REQUIRED | HIGH | New parser creation efficiency |
| Drift detection alerts | FULL_STACK_DEVELOPMENT_REQUIRED | HIGH | Log quality management |
| AI-generated draft parsers | FULL_STACK_DEVELOPMENT_REQUIRED | VERY HIGH | Automated parser creation |
| Parser registry with versions | MISSING | MEDIUM | Change management |
| Deployment governance | FULL_STACK_DEVELOPMENT_REQUIRED | VERY HIGH | Safe parser deployment |
| Device identification | MISSING | HIGH | Parser suggestion workflow |
| Raw/normalised/AI workbench | MISSING | HIGH | Parser development experience |
| Constrained DSL | MISSING (security req) | MEDIUM | Parser security |
| Test results | PARTIALLY_IMPLEMENTED | LOW | Parser QA |
| Tenant isolation | MISSING | MEDIUM | MSSP correctness |
| AI provenance tracking | MISSING | LOW | Audit trail |

**Parser Intelligence compliance: ~5% (only basic CRUD exists)**

**Parser Intelligence as a feature area requires ~15-20 backend sessions and ~10 frontend sessions of new development.**

---

## 4. Immediate Actions

### P0 (Security)
- **DSL constraint:** Until a constrained DSL is enforced, do not expose the parser editor to any role below ADMIN. Current ADMIN-gating in router is correct.

### P1 (Foundation)
- **Parser versioning:** Add version field to parser schema (Liquibase migration) — enables rollback
- **Test endpoint:** Add `/api/ha-parsers/{id}/test` — unblocks parser QA workflow

### P2 (Operational visibility)
- **Parser health dashboard:** New endpoint + frontend panel — enables monitoring

### P3 (Advanced features)
- Clustering, drift detection, AI generation — each requires multi-sprint backend work before frontend can begin
