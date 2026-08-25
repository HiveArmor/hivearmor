# Autonomous SOC — Endpoint defense research (Wave B1)

Retrieved: **2026-08-25**

Purpose: preserve OEM/standard conclusions for HiveArmor Wave B1 routes
(`/edr/endpoints`, `/edr/fim`, `/edr/policies`, `/posture/sensors`).
Paraphrased design conclusions only — not copied vendor content. Status vocabulary
remains **STAGING CANDIDATE**; never claim `PRODUCTION READY` from this note alone.

## Official sources and conclusions

### Microsoft Defender for Endpoint — device and file response actions

- Source: [https://learn.microsoft.com/en-us/defender-endpoint/respond-machine-alerts](https://learn.microsoft.com/en-us/defender-endpoint/respond-machine-alerts)
- Source: [https://learn.microsoft.com/en-us/defender-endpoint/api/isolate-machine](https://learn.microsoft.com/en-us/defender-endpoint/api/isolate-machine)
- Date consulted: **2026-08-25**
- Paraphrase: Endpoint response is **action-scoped and permission-gated** (isolate device, stop/quarantine file, restrict execution). Isolation is an explicit operator action with types (full/selective) and audit comments — not a silent side effect of listing hosts.
- HiveArmor implication: SensorGrid isolate/kill must stay independently live-verified; inventory (`/ha-edr/isolation`) and mutate (`/api/edr/*`) paths may differ and must not be conflated in UI copy. Agent list identity must use stable agent ids for timeline/ProcessCommand.

### CrowdStrike Falcon — host network containment

- Source: [https://developer.crowdstrike.com/api-reference/collections/hosts/](https://developer.crowdstrike.com/api-reference/collections/hosts/)
- Source: [https://www.crowdstrike.com/en-us/resources/videos/how-to-contain-an-infected-system/](https://www.crowdstrike.com/en-us/resources/videos/how-to-contain-an-infected-system/)
- Date consulted: **2026-08-25**
- Paraphrase: Containment is a deliberate host action (contain / lift_containment) that limits network communication while preserving management channel connectivity; operators confirm and can reverse after remediation.
- HiveArmor implication: Keep host isolation **fail-closed** until ProcessCommand isolate is proven; quarantine release/lift remains RESP-021 honesty. Do not invent push/contain UX on unused `/api/agent-policies` paths.

### NIST SP 800-61 Rev. 2 — containment before eradication/recovery

- Source: [https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf)
- Date consulted: **2026-08-25**
- Paraphrase: Containment strategy balances damage, evidence, and availability; eradication precedes recovery. Endpoint isolation and file quarantine are containment tools within that lifecycle.
- HiveArmor implication: Endpoints/FIM/policies/sensors are the containment control plane; role gates must match Analyst+ read and Admin|SOC Manager mutate for disruptive actions.

## Synthesized Wave B1 operator journey

1. Endpoints — select agent by stable id → timeline.
2. Sensors — fleet health; kill when live-verified; isolate gated separately.
3. FIM — integrity changes filtered by agent list (shared adapter).
4. Agent Policies — read Analyst+; mutate Admin|SOC Manager; POL-001/003 honesty retained.

## Gap matrix seeds (audit)

| Gap ID | Theme | Severity | Status |
|---|---|---|---|
| B1-SENS-01 / B1-EP-02 | AgentDTO ↔ FE field mismatch | Critical | Thin honesty — `adaptAgentWireToSensor` |
| B1-SENS-02 | Shared LIVE_VERIFIED overclaimed isolate | High | Split kill vs isolate flags |
| B1-EP-01 / B1-FIM-01 | Ungated endpoints/FIM routes | High | Analyst+ AuthGuard + nav |
| B1-EP-03 | Hostname fallback for timeline | Med | Prefer `agentId` only |
| B1-FIM-03 | Silent agent list failure | Low | Warning strip |
| A3 quarantine dual route | `/edr/quarantine` role hole | Med | Align AuthGuard |

## Limitations and refresh trigger

Refresh when Defender endpoint response APIs, CrowdStrike contain actions, or NIST IR guidance changes, or when HiveArmor agent DTO / EDR ProcessCommand contracts change. Do not vendor live. No Kafka/Neo4j assumptions.
