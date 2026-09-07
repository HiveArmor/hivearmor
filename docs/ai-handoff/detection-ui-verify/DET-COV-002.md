# DET-COV-002 — live MITRE coverage (fixtures off)

**Status:** STAGING CANDIDATE (local-dev). Not PRODUCTION READY.

## Contract

Detection Engineering → ATT&CK coverage:

| Mode | Heatmap source | Technique click | Unused-API banner |
|------|----------------|-----------------|-------------------|
| Fixtures on (`VITE_USE_FOUNDATION_FIXTURES=true`) | Inventory projection | Inventory rules | Shown |
| Fixtures off | `GET /api/mitre/coverage` | `GET /api/mitre/rules?techniqueId=` | Hidden |
| Live API `[]` | Empty projection — no invented ATT&CK cells | No fake rule list | Hidden |

`CoverageMatrixPanel` / `GET /api/ha-detection-rules/.../coverage` is not this tab.

## Verification (2026-09-07, Darwin local-dev)

- Fixture UI (`http://localhost:3000`): unused-API banner present; heatmap projected from fictional inventory (21 mapped techniques). Playwright recorded **zero** `/api/mitre/*` calls.
- Fixtures-off Vite (`http://localhost:3001`): session requires Sign in (no Maya Chen auto-auth). After JWT, Coverage tab called `GET /api/mitre/coverage` then click `GET /api/mitre/rules?techniqueId=T1003.001`. Unused-API banner **absent**. Heatmap showed live mapped cells (229 techniques / 14 tactics) — not inventory fiction. Empty `[]` stays empty via `buildMitreHeatmap([])` (unit-tested).
- Live API (JWT admin): coverage **200**, **251** rows (214 labeled `Txxxx`). Rules for `T1003.001` **200**. Not a staging VM. Not PRODUCTION READY.

## Screenshots

- `mitre-live-fixture-banner.png` — unused-API banner only in fixture mode
- `mitre-live-fixture-heatmap.png` — fixture heatmap (21 cells)
- `mitre-live-api-login.png` — fixtures off requires real Sign in
- `mitre-live-api-heatmap.png` — live coverage from `GET /api/mitre/coverage`
- `mitre-live-api-rules.png` — T1003.001 detail from `GET /api/mitre/rules`
