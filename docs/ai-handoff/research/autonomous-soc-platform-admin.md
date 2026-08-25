# Autonomous SOC — Platform admin research (Wave C2)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave C2 routes
(`/admin/*`, `/inputs/sources`, `/settings/api-keys`, connectors).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### NIST SP 800-92 — log management and audit evidence

- Source: [https://csrc.nist.gov/pubs/sp/800/92/final](https://csrc.nist.gov/pubs/sp/800/92/final)
- Date consulted: **2026-08-25**
- Paraphrase: Audit logs support accountability when records are **protected, reviewed, and disclosed carefully**. Export and UI views should prefer safe fields; raw event payloads and unnecessary identifiers increase exposure risk.
- HiveArmor implication: Governance audit drawer must not render raw `payload` JSON. Keep “payload omitted” honesty aligned with NDJSON export safe-field policy. Source IP remains admin-only audit context.

### Microsoft Entra / identity administration — least privilege and role clarity

- Source: [https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference)
- Date consulted: **2026-08-25**
- Paraphrase: Identity and directory administration separate **read** and **privileged mutate** roles. Invented role names that do not exist in the authorization model create false confidence.
- HiveArmor implication: Remove non-existent `ROLE_OPERATOR` from AuthGuard/page gates. Align `/inputs/sources` with BE `ROLE_ADMIN | ROLE_ANALYST`. Keep invite/suspend disabled until identity mutation workflow contracts land.

### Elastic / Splunk platform monitoring — ingestion honesty

- Source: [https://www.elastic.co/guide/en/kibana/current/monitoring-data.html](https://www.elastic.co/guide/en/kibana/current/monitoring-data.html) (Stack Monitoring overview)
- Date consulted: **2026-08-25**
- Paraphrase: Pipeline and integration health UIs distinguish **measured** signals from **unconfigured** or fixture review. Replay and parser deploy are governed actions, not silent clicks.
- HiveArmor implication: Keep onboarding/replay/propose CTAs disabled. StatusDock should not imply live EPS on design fixtures. Integration list GET must be ADMIN-gated like mutates.

## Synthesized Wave C2 operator journey

1. Identity & Tenancy — inventory users/tenants; federation/SCIM deep-links for ADMIN.
2. Integrations & API keys — connector/delivery/access inventory; connection-keys alias → API keys.
3. Pipeline & Data sources — ADMIN for signals hub; ANALYST may view sources list.
4. Governance — audit/retention/settings propose-disabled; audit payload omitted.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| C2-02/03 | ROLE_OPERATOR + AuthGuard drift | High | Closed — ADMIN\|ANALYST |
| C2-01 | Admin fixture-disabled aliases | Med | Closed |
| C2-10 | Audit payload render | Med | Closed — omitted |
| C2-04 | connection-keys → api-keys | Med | Closed — redirect |
| C2-11 | Integrations GET PreAuthorize | Med | Closed — ADMIN |
| C2-12 | aiStatus ROLE_ prefix | Med | Closed |
| C2-09 | StatusDock live on fixtures | Low | Closed — historical |
| C2-07 | audit-old / settings-old placeholders | Low | Closed → Governance |

## Limitations and refresh trigger

Refresh when NIST log-management, Entra RBAC, or Elastic/Splunk monitoring guidance changes, or when HiveArmor IAM/INO/GOV/ING contracts land. Do not vendor live. SEC-05 remains sensors-only.
