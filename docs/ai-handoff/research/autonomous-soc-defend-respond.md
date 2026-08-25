# Autonomous SOC — Defend & Respond research (Wave A3)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave A3 routes
(`/detection-rules`, `/response/playbooks`, `/response/activity`, `/response/authority`,
`/response/quarantine`, `/response/library`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Microsoft Defender XDR — Action center and pending remediation approval

- Source: [https://learn.microsoft.com/en-us/defender-xdr/m365d-action-center](https://learn.microsoft.com/en-us/defender-xdr/m365d-action-center)
- Source: [https://learn.microsoft.com/en-us/defender-office-365/air-review-approve-pending-completed-actions](https://learn.microsoft.com/en-us/defender-office-365/air-review-approve-pending-completed-actions)
- Date consulted: **2026-08-25**
- Paraphrase: Mature response UX centers a **unified Action center** for pending and history remediation actions (isolate, quarantine, restrict execution, etc.). Disruptive automated investigation actions often wait for **explicit Approve/Reject** with permission gates — operators review blast radius before execution continues.
- HiveArmor implication: `/response/activity` should be an authoritative execution ledger; `/response/authority` should be the human-approval queue. Until secured inventory/governance APIs exist, surfaces must **fail closed** (empty + unavailable copy) — never invent live approvals from fixtures in production.

### Elastic Security — automated response actions and Workflows

- Source: [https://www.elastic.co/docs/solutions/security/endpoint-response-actions/automated-response-actions](https://www.elastic.co/docs/solutions/security/endpoint-response-actions/automated-response-actions)
- Source: [https://www.elastic.co/security-labs/security-automation-with-elastic-workflows](https://www.elastic.co/security-labs/security-automation-with-elastic-workflows)
- Date consulted: **2026-08-25**
- Paraphrase: Detection rules can attach **response actions** (isolate, kill/suspend process) with role privileges; broader Workflows/playbooks orchestrate enrichment → case → response, with AI as reviewable steps rather than silent authority.
- HiveArmor implication: Detection rules and playbook/action library stay linked; ActionPalette / `/response/library` must use confirmed `GET /api/response/actions` (not invented `/soar/actions`). Playbook mutate/execute authority must match backend `@PreAuthorize` (today **ROLE_ADMIN** for writes).

### NIST SP 800-61 Rev. 2 — containment, eradication, recovery

- Source: [https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf)
- Date consulted: **2026-08-25**
- Paraphrase: Containment strategy is chosen deliberately (damage vs evidence vs availability); eradication precedes recovery; activity often loops back to detection/analysis. Post-incident lessons close the loop.
- HiveArmor implication: Quarantine/isolation and playbook response are **containment** tools with governed release; honesty on incomplete lift/release (RESP-021) is correct. Detection rule coverage feeds the prepare/detect side of the same lifecycle.

## Synthesized Wave A3 operator journey

1. Detection Rules — author/activate detections that can trigger or inform response.
2. Response Library — browse primitives (catalogue) without side effects.
3. Playbooks — compose/preview/execute with ADMIN write authority aligned to BE.
4. Response Activity — bounded execution ledger (fail closed until RESP-018).
5. Response Approvals — human decision queue (fail closed until RESP-020).
6. Quarantine & Containment — file quarantine + isolation inventory with governed release honesty.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| A3-ACT-01 | `/ha-playbooks/executions*` inventory missing | Critical | Thin honesty — `RESP_018_EXECUTION_INVENTORY=false` |
| A3-AUTH-01 | `/ha-response-governance/**` missing | Critical | Thin honesty — `RESP_020_GOVERNANCE=false` |
| A3-PB-01/02 | SOC Manager mutate UI vs ADMIN-only BE | High | Thin honesty — mutate/Run/Edit ADMIN-only |
| A3-PB-03 | `/ha-playbooks/{id}/audit` missing | Med | Thin honesty — `RESP_PLAYBOOK_AUDIT=false` |
| A3-LIB-01 | Library nav ungated vs page/BE roles | Med | Thin honesty — nav/router/page align to ANALYST+ |
| A3-DET-01 | Detection nav SOC Manager-only vs BE ANALYST read | Med | Thin honesty — list route includes ANALYST |
| A3-QUAR-* | Isolation release / dual `/edr/quarantine` | Low–Med | Documented; RESP-021 honesty retained |
| A3-META-01 | No Defend source-scan tests | Med | Closed in thin PR |

## Limitations and refresh trigger

Refresh when Defender Action center, Elastic Workflows/response actions, or NIST IR guidance changes, or when HiveArmor playbook/governance contracts land. Do not vendor live. No Kafka/Neo4j assumptions.
