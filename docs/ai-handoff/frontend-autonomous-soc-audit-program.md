# Frontend Autonomous SOC audit program

Updated: **2026-08-25 15:05:00 IST (UTC+05:30)**

Purpose: validate every visible frontend-v3 surface against real backend capability for an **Enterprise AI-driven Autonomous SIEM / Autonomous SOC**. Page-by-page: **audit → research → implement** (UI/UX, nav, structure, backend connects). Status vocabulary stays honest — never claim `PRODUCTION READY` without gates.

## Operating cadence (mandatory)

For each page (or tightly related hub):

1. **Audit** — route, left-nav placement, roles, services called, backend resources, empty/error/partial honesty, keyboard/density, AI surfaces if any.
2. **Research** — ≥3 primary OEM/standard sources under `docs/ai-handoff/research/` (URL, date, paraphrase, HiveArmor implication).
3. **Implement** — STAGING CANDIDATE slice only: wire real APIs, rearrange nav if needed, enhance structure, add pages only when a secured backend path exists; fail closed where backend is incomplete.
4. **Validate** — focused FE/BE tests, type-check; staging smoke when the slice touches deployable contracts.
5. **Record** — contract register + `next-production-slice.md` timestamp; no vendor live unless explicitly approved.

Authority granted for this program: page-by-page left-menu audit, rearrangement, new page development, page-structure enhancement, and backend connects — within HiveArmor design system and secured `/api/ha-*` contracts.

## North-star workflow (Autonomous SOC)

Prefer this operator journey over alphabetical admin depth:

```
Detect → Triage → Investigate → Decide → Respond → Learn → Govern
```

AI (SOC AI / agentic triage / Hive Intelligence) must appear as **assistive evidence**, never silent autonomous action without authority gates.

## Sequenced page families

| Wave | Family | Routes (nav-primary) | Why first |
|---|---|---|---|
| **A1** | Command & triage | `/dashboard`, `/queue`, `/alerts`, `/correlated-findings`, `/incidents` | **COMPLETE** audit (#55) + gaps (#56) — STAGING CANDIDATE on staging tip |
| **A2** | Investigate & AI | `/search`, `/investigations`, `/entities`, `/intelligence`, `/ueba/risk`, `/constellation` | **COMPLETE** audit (#57) + gaps (#58) — STAGING CANDIDATE (staging rebuild deferred) |
| **A3** | Defend / respond | `/detection-rules`, `/response/playbooks`, `/response/activity`, `/response/authority`, `/response/quarantine`, `/response/library` | **COMPLETE** audit + thin honesty (#59) — STAGING CANDIDATE (staging rebuild deferred) |
| **B1** | Endpoint defense | `/edr/endpoints`, `/edr/fim`, `/edr/policies`, sensors via posture | Containment honesty — **AUDIT + thin honesty in progress** |
| **B2** | Posture & compliance | `/posture/*`, `/compliance` | Exposure → assurance |
| **C1** | Dashboards & reports | `/dashboards`, `/dashboards/studio`, `/reports/*` | Narrative & ops visibility |
| **C2** | Platform admin | `/admin/*`, `/inputs/sources`, `/settings/api-keys`, connectors | Trust, ingest, identity |
| **C3** | MSSP | `/mssp/*` | Multi-tenant ops (if enabled) |
| **D** | Cross-product closure | all visible routes | WCAG, density, dark/light, perf, deprecation — program item 9 |

Hidden / deep-link-only surfaces (hub tabs, aliases) are audited with their parent hub, not as primary nav clutter.

## Per-page audit checklist

- Nav: correct section, label, role gate vs `@PreAuthorize`
- Data: only confirmed endpoints; no mock in production; cancellation + partial states
- Honesty: unavailable/disabled copy uses human role labels
- AI: show provenance, confidence, stub flags; no silent mutate
- Structure: one job per primary surface; progressive disclosure; AG Grid density where lists are high-volume
- Gaps: record contract IDs; do not invent Kafka/Neo4j without ADR

## Immediate pre-audit backlog (thin parallel, then staging)

Before Wave A1 browser audit on staging:

1. RESP-021 remaining depth (thin honesty only — not full governed release)
2. TI optional depth (IOC/MISP freshness honesty — no v1 deprecation without cutover)
3. POL-003 honesty (apply/ack unavailable — no fake host enforcement)
4. Investigate soft-link follow-on (auto-pin alert item if session API allows — no Neo4j)

Then **staging rebuild** of `main` tip and smoke. Then start **Wave A1**.

## Explicit non-goals (until approved)

- Vendor live logins (CrowdStrike/Defender/Entra/AWS/Okta)
- Claiming PRODUCTION READY / LIVE VERIFIED without evidence
- Kafka or Neo4j without architecture decision
- Rewriting the entire nav in one PR — rearrange only when a wave’s research justifies it
