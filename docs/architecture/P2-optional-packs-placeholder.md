# P2 — Optional packs placeholder (purple-team / honeytoken)

**Status:** STAGING CANDIDATE — planning doc only  
**Date:** 2026-08-24  
**Phase:** P2 (16–28 weeks) — optional packs (purple-team / honeytoken as MSSP add-ons)  
**Implementation:** **None.** No honeytoken runtime, purple-team tooling, APIs, UI, or content packs ship with this document.

## Purpose

Reserve product space for two **MSSP add-on** content packs that sit on top of the existing HiveArmor spine (event-processor CEL → OpenSearch → SOAR playbooks). This note defines scope, non-goals, and a later integration sketch so P0/P1 work is not blocked and so nobody mistakes planning for delivery.

## Pack sketches (future)

| Pack | Customer value (MSSP) | Intended shape (later) |
|------|----------------------|-------------------------|
| **Purple-team** | Controlled ATT&CK emulation signals that prove detection + response coverage per tenant | Content pack: labeled emulation scenarios, expected CEL hits, optional playbook “validation” steps — **not** a red-team C2 framework |
| **Honeytoken** | High-fidelity “someone touched a decoy” alerts with tenant isolation | Content + metadata: canary credentials/files/URLs as **detections and case tags** — **not** a token minting / vault / implant service in-core |

Both packs are **optional, licensed add-ons** for MSSP multi-tenant deployments. Core SIEM/XDR remains usable without them.

## In scope (when a future epic opens)

- Catalog entries and tenant entitlement flags for “optional packs” (admin / MSSP control plane).
- Detection content that loads through the **existing** CEL rule pipeline (`event-processor/builtin-rules`, `cel_pack_test.go` gate).
- Playbook starters that consume those alerts via current SOAR execute paths (webhook, ticket, identity, EDR steps already on the spine).
- Explicit labeling so purple-team / honeytoken alerts are distinguishable from organic detections (tags, rule IDs, MITRE mapping).
- Tenant isolation requirements aligned with P1 MSSP isolation CI (tenant A never sees tenant B’s decoys or emulation artifacts).

## Explicit non-goals (this document and near-term P2)

- **Do not implement** honeytoken minting, distribution, rotation, or agent-side decoy droppers.
- **Do not implement** purple-team / adversary-emulation runtimes, payload generation, or attack orchestration.
- Do not add a new message broker or bypass event-processor (see `CLAUDE.md` firm constraints and `ADR-20260824-connector-ingest.md`).
- Do not claim PRODUCTION READY or LIVE VERIFIED for either pack until separate staging evidence exists.
- Do not ship UI that implies packs are available while entitlement and content are absent.

## Later plug-in: CEL and playbooks

When an implementation epic is approved, prefer **content and wiring only** on the current spine:

```text
[Pack content]
  ├─ CEL YAML under event-processor/builtin-rules/… (pack-prefixed IDs)
  │     → EP correlation → OpenSearch v3-hive-<type>-YYYY.MM.DD
  └─ Playbook JSON starters (SOAR)
        → steps: enrich / ticket / notify / optional isolate
        → conditions on pack tags / rule IDs (not a parallel engine)
```

1. **CEL** — Pack rules use the same loader and CI pack test floor as core CEL. Rule IDs and tags encode pack + tenant-safe metadata; no separate correlation engine.
2. **Playbooks** — Starters live with existing SOAR packs; steps call already-shipped actions (and Connector SDK capabilities where relevant). Purple-team “coverage checks” are playbook assertions against expected alerts, not live attack tooling.
3. **MSSP** — Entitlement and tenant scope gate pack activation; isolation CI must cover any new tables or OpenSearch fields before staging candidacy advances beyond planning.

## Related

- Local planning (gitignored): `.plan/research/AISOC-VS-HIVEARMOR-IMPROVEMENT-PLAN.md` P2 item 12; `.plan/research/P1-IMPLEMENTATION-PLAN.md` (CEL / playbook depth, MSSP isolation)
- `event-processor/rules/cel_pack_test.go` — CEL pack load/test gate
- [`ADR-20260824-connector-ingest.md`](./ADR-20260824-connector-ingest.md) — no EP bypass for alert write paths
- `CLAUDE.md` — no message broker without an explicit architecture decision
