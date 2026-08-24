# ADR-20260824 — Hybrid response mesh (vendor EDR beside HA agent)

**Status:** Accepted (code complete)  
**Date:** 2026-08-24  
**Label:** **STAGING CANDIDATE** — not PRODUCTION READY. No live vendor kinetic isolate.

## Context

P2 item from AiSOC comparison: optional vendor EDR adapters alongside the first-party HiveArmor agent. CrowdStrike already advertises `ISOLATE_HOST` when `hivearmor.connectors.vendor-isolate-enabled=true`. Playbook isolate historically required an HA `agentId` only.

## Decision

1. **HA agent remains primary.** When a non-blank agent id is present (treated as enrolled for playbook/EDR), isolate always uses `EdrService` → ProcessCommand.
2. **Vendor path is feature-flagged.** Only when the HA agent is absent **and** `hivearmor.connectors.vendor-isolate-enabled=true` **and** a registered connector declares `ISOLATE_HOST`, the mesh selects `VENDOR_CONNECTOR`.
3. **No live vendor calls in this slice.** Vendor selection returns a dry-run / planned payload (`executed=false`). Live CrowdStrike RTR (etc.) requires a follow-up with credentials, audit, and staging proof.
4. Routing lives in `HybridIsolateRouter` + `HybridResponseMeshDispatcher`; playbook `isolate_host` consults the mesh before EDR dispatch.

## Non-goals

- Do not replace first-party agent isolate with vendor-only.
- Do not store or log connector secrets in mesh results.
- Do not write OpenSearch from connector kinetic actions.

## Related

- `hivearmor.connectors.vendor-isolate-enabled` / `HIVEARMOR_CONNECTOR_VENDOR_ISOLATE`
- `ADR-20260824-connector-ingest.md` (pull_alerts dry-run)
- `.plan/research/AISOC-VS-HIVEARMOR-IMPROVEMENT-PLAN.md` §P2 item 10
