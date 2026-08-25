# Autonomous SOC — Cross-product closure research (Wave D)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave D
(cross-cutting WCAG/density/theme/deprecation honesty across visible routes).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### WCAG 2.2 — operable UI and honest status

- Source: [https://www.w3.org/TR/WCAG22/](https://www.w3.org/TR/WCAG22/)
- Date consulted: **2026-08-25**
- Paraphrase: Status messages and live regions must reflect true conditions. Presenting a static inventory as a live stream misleads operators relying on assistive tech and visual status docks.
- HiveArmor implication: StatusDock `mode="live"` only when SSE/live projection is active; fixture and snapshot hubs use `historical`.

### NIST SP 800-53 AC-6 — least privilege and role clarity

- Source: [https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- Date consulted: **2026-08-25**
- Paraphrase: Privileged roles must be identifiable and free of invented authorities. Operators should see human permission names, not internal constants.
- HiveArmor implication: Drop fictional `ROLE_INCIDENT_COMMANDER`; map `ROLE_*` through `formatAuthorityLabel` / program human labels (Platform Administrator, Standard User).

### OWASP ASVS — deprecate safely

- Source: [https://owasp.org/www-project-application-security-verification-standard/](https://owasp.org/www-project-application-security-verification-standard/)
- Date consulted: **2026-08-25**
- Paraphrase: Deprecated entry points should redirect to canonical surfaces rather than continue exposing alternate live UIs that diverge from the governed path.
- HiveArmor implication: `*-old` / `playbooks-legacy` / lossy `/rules/:id/*` redirects become Navigate-only to canonical detection/admin/response routes.

## Synthesized Wave D closure themes

1. Deprecation — aliases redirect; no dual live legacy mounts.
2. Live honesty — fixture/snapshot StatusDock historical.
3. Role honesty — human labels; no fictional roles.
4. Theme — first visit respects `prefers-color-scheme`.
5. Fixture boundary — correlated findings fixture-disabled twin.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| D-01 | Legacy routes mount live UI | High | Closed — Navigate redirects |
| D-02 | StatusDock live on fixtures/snapshots | High | Closed — historical when fixture |
| D-03/04 | ROLE_* / fictional commander | High | Closed |
| D-05 | correlatedFindings fixture-disabled | High | Closed |
| D-07 | Lossy rules redirects | Med | Closed — preserve id |
| D-08 | backdrop-filter glass | Med | Closed |
| D-09 | Theme ignores OS preference | Med | Closed |
| D-10 | Hardcoded Production envs | Med | Thin honesty |
| D-11 | RoleBadge / ROLE_LABELS | Med | Closed |
| D-12 | HelpButton console.log | Low | Closed |

## Limitations and refresh trigger

Refresh when WCAG, NIST AC, or ASVS guidance changes. Staging rebuild still deferred. Do not claim PRODUCTION READY from Wave D alone.
