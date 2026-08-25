# Autonomous SOC — Posture & compliance research (Wave B2)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave B2 routes
(`/posture/*`, `/compliance`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Microsoft Security Exposure Management — attack paths and choke points

- Source: [https://learn.microsoft.com/en-us/security-exposure-management/work-attack-paths-overview](https://learn.microsoft.com/en-us/security-exposure-management/work-attack-paths-overview)
- Source: [https://learn.microsoft.com/en-us/security-exposure-management/cross-workload-attack-surfaces](https://learn.microsoft.com/en-us/security-exposure-management/cross-workload-attack-surfaces)
- Date consulted: **2026-08-25**
- Paraphrase: Mature exposure UX centers an **enterprise exposure graph** with attack paths, entry points, critical assets, and choke points — empty path lists mean missing graph coverage or integration, not proof of zero risk. Remediation focuses on high-impact choke points.
- HiveArmor implication: `/posture/exposure` must stay fail-closed when EXP contracts are missing; never invent paths from asset inventory. Disable KPI/filter chrome when `contractState: 'missing'`.

### NIST CSF 2.0 — Govern through Recover posture outcomes

- Source: [https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf)
- Source: [https://www.nist.gov/cyberframework/faqs](https://www.nist.gov/cyberframework/faqs)
- Date consulted: **2026-08-25**
- Paraphrase: CSF 2.0 organizes outcomes as **Govern, Identify, Protect, Detect, Respond, Recover**. Identify covers asset/risk understanding; Protect covers access and platform safeguards; Detect/Respond map to coverage and response readiness. Zero scores without assessment timestamps must not be read as failed attestation.
- HiveArmor implication: Compliance aggregates (`/ha-posture/*`) are assurance inventory, not full control/evidence workspace (CMP-002/003 blocked). Assets/identities/vuln/CIS map to Identify/Protect; Detection Coverage maps to Detect readiness.

### CIS Benchmark / configuration assessment practice

- Source: [https://www.cisecurity.org/cis-benchmarks](https://www.cisecurity.org/cis-benchmarks) (program overview)
- Date consulted: **2026-08-25**
- Paraphrase: Benchmark results are configuration assessments with clear pass/fail evidence; mutations (exceptions, rescans) are governed actions, not silent toggles.
- HiveArmor implication: Keep CIS mutate endpoints fail-closed (`CIS_MUTATION_AVAILABLE=false`); technical pass-rate labeling stays honest; do not invent exception/rescan success.

## Synthesized Wave B2 operator journey

1. Assets / Identities — inventory with analyst-tier authority.
2. Vulnerabilities / CIS — findings and benchmarks; mutations blocked.
3. Exposure / AD — missing-contract honesty until graph/directory APIs land.
4. Detection Coverage — technique projection from correlation rules (authorized).
5. Compliance — framework aggregates only; evidence drawer blocked.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| B2-COV-01 | MitreCoverageResource missing `@PreAuthorize` | High | Closed — Analyst\|SOC Manager\|Admin |
| B2-AST-01 / B2-ID-01 | Nav open vs BE analyst-tier | Med | Closed — nav + AuthGuard aligned |
| B2-EXP-01/02 | Exposure open + interactive chrome when missing | Med | Closed — roles + disable chrome |
| B2-ID-02 | Dead `/ha-entities/{id}/risk` helper | Med | Closed — removed |
| B2-CMP-01 | Compliance nav ungated | Med | Closed — Analyst+ |
| B2-ID-03 / B2-CMP-02 | Missing fixture-disabled aliases | Low | Closed |
| B2-COV-02 | Empty coverage ambiguous copy | Med | Thin copy honesty |
| B2-VULN-02 / B2-CIS-01 | Mutation flags | Low | Capability constants |

## Limitations and refresh trigger

Refresh when Microsoft Exposure Management, NIST CSF, or CIS benchmark program guidance changes, or when HiveArmor EXP/ADP/CMP contracts land. Do not vendor live. No Kafka/Neo4j assumptions.
