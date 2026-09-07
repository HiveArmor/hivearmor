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

- Fixture UI (`http://localhost:3000`): unused-API banner present; heatmap projected from fictional inventory; T1078 detail lists fixture-mapped rules. Live `/api/mitre/*` was not called.
- Fixtures-off Vite (`http://localhost:3001`): `VITE_USE_FOUNDATION_FIXTURES` inlined as `"false"`; session requires Sign in (no Maya Chen auto-auth).
- Live API (backend up, JWT admin): `GET /api/mitre/coverage` → **200**, **251** rows (216 with `Txxxx` ids). `GET /api/mitre/rules?techniqueId=T1003.001` → **200**, mapped correlation-rule refs. Empty `[]` stays empty via `buildMitreHeatmap([])` (unit-tested). Not a staging VM. Not PRODUCTION READY.

## Screenshots

- `mitre-live-fixture-banner.png` — unused-API banner only in fixture mode
- `mitre-live-fixture-heatmap.png` — fixture heatmap + T1078 detail
- `mitre-live-api-login.png` — fixtures off requires real Sign in
