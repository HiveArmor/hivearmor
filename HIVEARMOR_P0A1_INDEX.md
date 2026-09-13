# HiveArmor Endpoint Sensor Platform — P0-A1 Documentation Index

> Date: 2026-09-09 · **Index / navigation only.** Links the full document set produced during the endpoint-agent audit → architecture → freeze → P0-A1 tenant-security planning arc. Everything below is **planning/design only — no code, migrations, `.proto` edits, or commits have been made.** All findings are grounded in direct code reads (`path:line`); the sub-agent fan-out failed twice (repo not mounted in the sandbox) and was discarded, so every document was authored from first-hand inspection.

Read top-to-bottom for the full story; jump to §"P0-A1 build set" for what an implementer needs.

---

## 0. Reading order at a glance

```
AUDIT (what exists)                                    ← ground truth
  └─ IMPLEMENTATION PLAN V1                             ← target architecture
       └─ IMPLEMENTATION PLAN V2 (APPROVED)             ← + 17 review corrections
            └─ ARCHITECTURE FREEZE ADDENDUM             ← 10 final clarifications, checklist
                 └─ PRE-P0-A DECISION BRIEF             ← 3 DECISION-REQUIRED items resolved
                      └─ P0-A1 TENANT SECURITY PLAN     ← first buildable batch (this is the work)
                           ├─ TASKS T02–T08 EXPANDED
                           ├─ TASKS T09–T20 EXPANDED
                           ├─ SCHEMA DRAFTS (proto + Liquibase)
                           └─ T18 CROSS-TENANT TEST MATRIX  ← = the acceptance gate
```

---

## 1. Foundation documents

| # | Document | What it is | Status |
|---|---|---|---|
| 1 | [`.plan/AGENT-MGMT-AUDIT-2026-09-09.md`](.plan/AGENT-MGMT-AUDIT-2026-09-09.md) | Original agent-management capability audit (backend + UI + duplicate/legacy hunt + enterprise benchmark) | reference |
| 2 | [`HIVEARMOR_ENDPOINT_AGENT_CURRENT_STATE_AUDIT.md`](HIVEARMOR_ENDPOINT_AGENT_CURRENT_STATE_AUDIT.md) | **Source of truth** — deep 63-section current-state discovery audit; all 9 UNKNOWNs resolved; every claim cited `path:line` | complete |

Key audit verdicts that drive everything downstream: durable SQLite spool + modern enrollment + native ETW/eBPF/ESF are **sound** and preserved; the defects are **cross-tenant agent reads, untenanted EDR events, unsigned string commands, unsigned self-updater, clone-unsafe identity** — trust/tenancy/finishing, not architecture.

---

## 2. Architecture documents

| # | Document | What it is | Status |
|---|---|---|---|
| 3 | [`HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN.md`](HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN.md) | V1 target architecture + 45-section plan + master table (T01–T32) | superseded by V2 |
| 4 | [`HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN_V2.md`](HIVEARMOR_ENDPOINT_AGENT_IMPLEMENTATION_PLAN_V2.md) | **APPROVED** architecture — V1 + 17 review corrections (root-of-trust, signing/CA separation, command journal, TUF updates, transport resilience, `core/*` restraint, P0 split into P0-A/P0-B, …); master table T01–T43 | approved |
| 5 | [`HIVEARMOR_ENDPOINT_AGENT_ARCHITECTURE_FREEZE_ADDENDUM.md`](HIVEARMOR_ENDPOINT_AGENT_ARCHITECTURE_FREEZE_ADDENDUM.md) | 10 final clarifications (command crash-state machine, dual-channel mTLS, threshold root, crypto agility, gate fix, selective-ACK-ready, trusted-time, tenant defense-in-depth, rollback vs anti-downgrade, command canonicalization) + **Architecture Freeze Checklist** | frozen (Addendum wins on conflict) |
| 6 | [`HIVEARMOR_ENDPOINT_AGENT_PRE_P0A_DECISION_BRIEF.md`](HIVEARMOR_ENDPOINT_AGENT_PRE_P0A_DECISION_BRIEF.md) | Resolves the 3 DECISION-REQUIRED freeze items — **2-of-3 root threshold · ECDSA P-256 default · targeted PG-RLS + `visibleBy` backstops** | recommendations pending sign-off |

**Precedence:** the Freeze Addendum overrides V2 wherever they conflict. **Final architectural verdict:** the agent can evolve into a credible enterprise EDR platform **incrementally, without a rewrite** (YES WITH MAJOR REFACTORING).

---

## 3. P0-A1 build set — Tenant Security Closure (the first batch to implement)

Scope: tenant-scope agent reads (list / by-hostname / with-commands / commands) · authoritative EDR event tenant attribution · `/api/collectors` authorization + tenant · response target authorization · cross-tenant regression tests. **Excludes** mTLS, device certs, identity V2, command signing/journal, signed updater, policy redesign, dedup, file collector, process entity, UI, live hunt, detection (later batches).

| # | Document | What it is | Status |
|---|---|---|---|
| 7 | [`HIVEARMOR_P0A1_TENANT_SECURITY_IMPLEMENTATION_PLAN.md`](HIVEARMOR_P0A1_TENANT_SECURITY_IMPLEMENTATION_PLAN.md) | **P0-A1 master plan** — current tenant-flow trace, per-item design (items 1–8 + cross-cutting), 20-task table (P0A1-T01…T20), implementation order, acceptance gate, RLS-spike deferral | plan complete |
| 8 | [`HIVEARMOR_P0A1_TASKS_T02_T08_EXPANDED.md`](HIVEARMOR_P0A1_TASKS_T02_T08_EXPANDED.md) | Full breakdowns: T02 ListRequest tenant field · T03 manager forced predicate · T04 backend propagation · T05 by-hostname · T06 agents-with-commands · T07 command reads · T08 EDR authoritative tenant | complete |
| 9 | [`HIVEARMOR_P0A1_TASKS_T09_T20_EXPANDED.md`](HIVEARMOR_P0A1_TASKS_T09_T20_EXPANDED.md) | Full breakdowns: T09 EDR read scoping · T10 collector authz · T11 collector tenant · T12 response target authz · T13 unique(tenant,hostname) · T14 background context · T15 admin model · T16 error semantics · T17 audit · T18 tests · T19 OpenSearch verify · T20 RLS spike | complete |
| 10 | [`HIVEARMOR_P0A1_SCHEMA_DRAFTS.md`](HIVEARMOR_P0A1_SCHEMA_DRAFTS.md) | Exact **proposed** edits (not applied): `ListRequest.tenant_id = 5` in `common.proto` + the `20260909001_ha_edr_event_tenant.xml` Liquibase changeset + `UtmEdrEvent` field + `master.xml` include | drafts ready |
| 11 | [`HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md`](HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md) | ~45 named negative test cases across 10 surfaces + layer mapping. **A green run of this matrix IS the P0-A1 acceptance gate.** | spec complete |

### P0-A1 task → document map

| Task | Title | Detailed in | Depends on |
|---|---|---|---|
| P0A1-T01 | Tenant-scope helper + manager require-tenant rule | Plan (7) | — |
| P0A1-T02 | `ListRequest.tenant_id` proto field | T02–T08 (8), Schema (10) | T01 |
| P0A1-T03 | Manager forced tenant predicate (`ListAgents`) | T02–T08 (8) | T02 |
| P0A1-T04 | Backend agent-list tenant propagation | T02–T08 (8) | T02, T03 |
| P0A1-T05 | get-agent-by-hostname + duplicate handling | T02–T08 (8) | T02, T04 |
| P0A1-T06 | agents-with-commands scoping | T02–T08 (8) | T02, T03 |
| P0A1-T07 | agent-command reads (query-level) | T02–T08 (8) | T02 |
| P0A1-T08 | EDR authoritative tenant (write) | T02–T08 (8), Schema (10) | telemetry agent→tenant resolver |
| P0A1-T09 | EDR event tenant scoping (reads) | T09–T20 (9) | T08 |
| P0A1-T10 | `/api/collectors` authorization | T09–T20 (9) | — |
| P0A1-T11 | Collector tenant scoping (via group) | T09–T20 (9) | T10 |
| P0A1-T12 | Response target tenant authorization | T09–T20 (9) | T05 |
| P0A1-T13 | `unique(tenant_id, hostname)` constraint | T09–T20 (9) | T02/T03 |
| P0A1-T14 | Background/internal service tenant context | T09–T20 (9) | T01 |
| P0A1-T15 | Admin / selected-tenant model + audit | T09–T20 (9) | T02, T14 |
| P0A1-T16 | Error-semantics convention (404/403/empty) | T09–T20 (9) | T04–T12 |
| P0A1-T17 | Cross-tenant audit logging | T09–T20 (9) | T04–T12, T16 |
| P0A1-T18 | Cross-tenant negative test matrix | Test Matrix (11) | T02–T17 |
| P0A1-T19 | OpenSearch `visibleBy` verification (recs) | T09–T20 (9) | — |
| P0A1-T20 | RLS defense-in-depth spike (report) | T09–T20 (9) | T01–T17 shipped |

---

## 4. Implementation order (from the P0-A1 plan)

1. T01 helper → 2. **T02 proto field** (unblocks all read scoping) → 3. T03/T04 agent list → 4. T05 by-hostname (+ can-run-command) → 5. T06/T07 with-commands + commands → 6. T08/T09 EDR write + read → 7. T10/T11 collectors → 8. T12 response authz → 9. T13–T17 constraint + background + admin + error-semantics + audit → 10. **T18 regression suite (= gate)** → 11. T19 OpenSearch verify → 12. T20 RLS spike.

All behind feature flags `tenant_scoped_reads` (+ `edr_event_tenant`, `response_tenant_authz`, `collector_tenant_scope`) for atomic staging/rollback.

---

## 5. Acceptance gate — P0-A1 (from plan §19)

Green, automated proof that: Tenant A cannot enumerate / by-hostname / read-commands / issue-response-to / modify-collectors-of Tenant B; EDR events persist with **server-assigned** authoritative tenant and a client tenant cannot override; EDR/endpoint searches never cross tenants; no background flow silently spans all tenants; `/api/collectors` requires authorization. The T18 matrix is that gate; the **paging-boundary** and **payload-override** cases are the mandatory CI regressions.

---

## 6. Open decisions before implementation starts

From the Decision Brief (doc 6) — three internal choices, no external blockers:
1. Root threshold/custody → **recommended 2-of-3, 3 HSM/KMS custodians**.
2. Initial signing algorithm → **recommended ECDSA P-256 default** (agility retained).
3. Tenant defense-in-depth → **recommended PG-RLS on sensitive tables + `visibleBy` on EDR events** (app-layer stays primary; RLS is a follow-on backstop, T20).

Note: decisions 1 and 2 affect the **later** trust batches (command signing, mTLS, signed updates), not P0-A1 itself — P0-A1 (tenant closure) can proceed while they are being finalized. Decision 3's RLS piece is explicitly deferred to T20 after the app-layer fix ships.

---

## Status summary
- Audit + architecture (V2) + freeze: **done / approved / frozen.**
- Decision brief: **recommendations pending your sign-off** (3 items).
- P0-A1: **fully planned** — 20 tasks broken down, schema drafts ready, test matrix specified, ordered, gated. **Ready for implementation to begin** (starting T01→T02) once the batch is greenlit.
