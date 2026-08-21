# 21 — Risk Register
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit  
**Scoring:** Probability × Impact on a 1–5 scale each (Score = P × I, max 25)

---

## Risk Table

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| RISK-01 | Security | SEC-GAP backend vulnerabilities shipped to production (BE-01 through BE-12) — any authenticated user can mutate alerts, create ROLE_ADMIN, execute Groovy, and kill processes | 4 | 5 | **20** | Complete H0-SEC-01 through H0-SEC-08 before any production deployment; block release with CI gate | Security lead | OPEN — P0 BLOCKER |
| RISK-02 | Tenancy | MSSP tenant data leakage — X-Tenant-ID header sent by frontend but not enforced by backend; all tenants receive all data | 5 | 5 | **25** | Do not deploy MSSP mode until H6-TENANT-01 complete; disable tenant selector in UI until backend enforces isolation | Architecture lead | OPEN — P0 BLOCKER |
| RISK-03 | Dependency | AG Grid Enterprise licence required for full spec compliance — Community 36 cannot implement ServerSideRowModel, grouped views, or master-detail | 3 | 3 | **9** | Document InfiniteRowModel workaround and its limitations; make DEC-01 decision explicit before H2 | Product owner | OPEN — decision required |
| RISK-04 | Security | DEBT-14 — JWT signing key regenerated on every backend restart; all active sessions invalidated on any planned or emergency deployment | 5 | 4 | **20** | Fix in H0-SEC-05; add `JWT_SECRET` to all deployment manifests; test via staging restart | Backend lead | OPEN — P0 BLOCKER |
| RISK-05 | Delivery | 26 `.skip.ts` stubs — features appear to be present in router but render non-functional stubs with no user feedback; delivery schedule unknown | 4 | 4 | **16** | Add EngineeringNotice (H0-FE-02); create explicit roadmap timeline per batch (doc 18); set scheduled milestone dates | Delivery manager | OPEN |
| RISK-06 | Testing | No Storybook, no Playwright, no axe-core — visual regressions and accessibility failures will reach production undetected | 4 | 3 | **12** | Implement H1-TEST-01 as first H1 batch; no feature work starts H2 without test infrastructure | QA lead | OPEN |
| RISK-07 | Architecture | Neo4j graph backend schema unknown — Threat Constellation page (ThreatConstellationPage.tsx) exists and imports ReactFlow but cannot be wired to real data without schema definition | 3 | 3 | **9** | Resolve DEC-08; run schema discovery session with backend team; do not invest H3-CONST-01 work without schema | Architecture lead | OPEN — decision required |
| RISK-08 | Security | Parser Intelligence AI-generated code execution risk — if AI-generated parser code is executed in the event processor without sandboxing, malicious AI output could achieve RCE | 2 | 5 | **10** | Resolve DEC-07 first; require constrained YAML/CEL DSL (not full scripting); static validation before any execution; human approval gate mandatory | Security lead | OPEN — decision required |
| RISK-09 | Architecture | OpenSearch index pattern version-locked at `v3-hive-<type>-YYYY.MM.DD` — any schema evolution requires migrating all existing indices and every query across all services simultaneously | 2 | 5 | **10** | Do not propose schema changes without a full migration plan; confirm index pattern with backend lead before any new log source integration | Architecture lead | OPEN — ongoing constraint |
| RISK-10 | Delivery | `active-directory.service.ts` fully stubbed and shipped as if functional — developers may import it assuming it works; users see AD page that does nothing | 4 | 2 | **8** | Add PLACEHOLDER comments to service file; keep `ActiveDirectoryPage` in `.skip.ts` until backend is ready | Frontend lead | OPEN |
| RISK-11 | Security | `GAP_SEC_06_RESOLVED = false` is frontend-only gate — backend `/api/ha-visualizations/run` is fully open to direct API calls; attackers can bypass frontend gate | 3 | 4 | **12** | H0-SEC-07 must fix backend before any production deployment; frontend gate is advisory only | Security lead | OPEN — P0 BLOCKER |
| RISK-12 | Delivery | `toast.ts` / `toastStore.ts` in-memory stub — all toast notifications silently dropped in production; no user feedback for mutations, errors, or warnings | 5 | 3 | **15** | H1-FND-02: Mount ToastStack in AppLayout before H2 feature work begins | Frontend lead | OPEN |
| RISK-13 | Compliance | WCAG 2.2 Level A failures — missing skip nav (2.4.1) and missing chart aria-labels (1.1.1) — potential legal liability in regulated sectors (government, healthcare) | 4 | 3 | **12** | H1-FND-03 fixes both; must be resolved before government/healthcare deployment | Accessibility lead | OPEN |
| RISK-14 | Performance | 4.1 MB initial JS bundle — all 182 pages eagerly loaded; slow first load especially on VPN-connected remote analysts | 5 | 2 | **10** | H1-PERF-01: React.lazy() for all routes; target < 500 KB initial | Frontend lead | OPEN |
| RISK-15 | Security | 123 backend endpoints relying on global `hasAnyRole(ADMIN,USER)` catch-all — zero fine-grained RBAC; privilege escalation via catch-all | 3 | 4 | **12** | Systematic `@PreAuthorize` audit; H0 covers P0 cases; remaining 123 need follow-up sprint | Security lead | OPEN — ongoing |
| RISK-16 | Architecture | MSSP architecture decision (DEC-02) not made — if wrong strategy chosen (row-level security vs separate schemas vs separate clusters), entire H6 workstream must be rebuilt | 2 | 5 | **10** | Hold architecture decision workshop; involve DBA and cloud architect; make DEC-02 before any H6 work | Architecture lead | OPEN — decision required |
| RISK-17 | Delivery | 3 test files using `node:test` contribute 0% to coverage — false confidence in CI green build | 5 | 2 | **10** | H0-FE-01: Convert all 3 before H1 starts | QA lead | OPEN |
| RISK-18 | Security | No Content-Security-Policy header — XSS attacks unmitigated at HTTP level | 3 | 4 | **12** | Add CSP header to nginx.conf before production deployment; test with Report-Only mode first | Security lead | OPEN |
| RISK-19 | Delivery | DashboardStudioPage has no active .tsx counterpart (only `.skip.ts`) — H4-DASH-01 is a full build, not an activation — complexity underestimated in roadmap | 3 | 3 | **9** | Acknowledge H4-DASH-01 as XL complexity in roadmap; assign experienced frontend engineer; 2-sprint estimate | Frontend lead | OPEN |
| RISK-20 | Security | SSE streams (alerts/eps) do not support Authorization headers — EventSource API limitation; current auth mechanism for SSE unclear | 3 | 3 | **9** | Audit SSE auth mechanism; implement cookie-based or URL-param token (with short expiry) for SSE; document choice | Security lead | OPEN — investigation required |

---

## Risk Heat Map

```
Impact
  5 | RISK-02       RISK-01 RISK-04              RISK-08 RISK-09
  4 |         RISK-11 RISK-05 RISK-15 RISK-18
  3 | RISK-03 RISK-06 RISK-07 RISK-12 RISK-13 RISK-19 RISK-20
  2 |     RISK-10     RISK-14 RISK-17
  1 |
    +---+---+---+---+---
        1   2   3   4   5   Probability
```

---

## P0 Blockers (Score ≥ 20 or explicitly P0)

| Risk ID | Score | Reason | Must Resolve By |
|---|---|---|---|
| RISK-02 | 25 | MSSP data leakage — DO NOT deploy MSSP mode | Before any MSSP customer deployment |
| RISK-01 | 20 | Backend security gaps — privilege escalation, RCE risk | Before any production deployment |
| RISK-04 | 20 | JWT key invalidation on restart — operationally unacceptable | Before any production deployment |
| RISK-05 | 16 | 26 stub features — analyst confusion, reliability | H0 (add notices) + delivery roadmap |
| RISK-12 | 15 | Silent toast drop — broken feedback loop | H1 (before H2 feature work) |

---

## Risks Requiring Product/Architecture Decisions

| Risk ID | Blocking Decision | Document Reference |
|---|---|---|
| RISK-03 | DEC-01: AG Grid licence | Doc 22, DEC-01 |
| RISK-07 | DEC-08: Neo4j schema | Doc 22, DEC-08 |
| RISK-08 | DEC-07: Parser DSL language | Doc 22, DEC-07 |
| RISK-16 | DEC-02: MSSP tenant architecture | Doc 22, DEC-02 |
