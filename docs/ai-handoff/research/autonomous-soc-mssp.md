# Autonomous SOC — MSSP portal research (Wave C3)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave C3 routes
(`/mssp/*`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Azure Lighthouse — delegated multi-tenant management

- Source: [https://learn.microsoft.com/en-us/azure/lighthouse/concepts/architecture](https://learn.microsoft.com/en-us/azure/lighthouse/concepts/architecture)
- Date consulted: **2026-08-25**
- Paraphrase: MSSP-style portals separate **managing tenant** authority from **customer tenant** scope. Operators authenticate once, then act only within delegated customer boundaries. Hardcoded fictional customers are not a substitute for an authorized inventory.
- HiveArmor implication: Nest `/mssp/*` under authenticated AppLayout; gate with `MSSP_ADMIN` (human label: MSSP Administrator). Masthead tenant switcher must not imply live inventory when placeholders remain.

### Okta / IdP multi-tenant administration — least privilege copy

- Source: [https://developer.okta.com/docs/concepts/multi-tenancy/](https://developer.okta.com/docs/concepts/multi-tenancy/)
- Date consulted: **2026-08-25**
- Paraphrase: Tenant-local roles (admin/analyst/viewer) must not be confused with platform-wide administrator roles in operator UI.
- HiveArmor implication: Label membership roles as Tenant Admin / Tenant Analyst / Tenant Viewer. Access-denied copy uses human permission names, never raw `MSSP_ADMIN`.

### NIST SP 800-53 AC-2 / AU-2 — account management and audit authenticity

- Source: [https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- Date consulted: **2026-08-25**
- Paraphrase: Privileged multi-tenant actions require authenticated sessions and accurate failure signaling — conflating authorization failure with “not found” misleads operators and auditors.
- HiveArmor implication: All `/api/ha-mssp/*` calls must send Bearer JWT. HTTP 404 → not found; 401/403 → access restricted; never navigate React Router to API `Location` paths.

## Synthesized Wave C3 operator journey

1. Authenticate → AppLayout shell.
2. MSSP Portal nav (MSSP Administrator only) → Overview / Tenants.
3. Create tenant → navigate to `/mssp/tenants/{id}` UI path.
4. Manage membership with tenant-scoped role labels.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| C3-01 | Routes outside AuthGuard/AppLayout | High | Closed — nested under AppLayout + AuthGuard |
| C3-02 | Missing Bearer on live MSSP fetches | High | Closed — `msspFetch` |
| C3-03 | Post-create navigate to API Location | High | Closed — UI path only |
| C3-05 | 401/403 shown as not-found | Med | Closed |
| C3-04/07 | Hardcoded tenants / “Production” env | Med | Closed — live inventory + Local/Deployed |
| C3-06/08 | Role/permission human labels | Med | Closed |
| C3-09 | Duplicate membership types | Low | Closed |
| C3-13 | STAGING banner | Low | Closed on overview |

## Limitations and refresh trigger

Refresh when Azure Lighthouse, Okta multi-tenancy, or NIST AC/AU guidance changes, or when HiveArmor ships authorized masthead tenant inventory. Do not vendor live. Backend `/api/ha-mssp/*` is real (not greenfield) and remains `MSSP_ADMIN`-gated.
