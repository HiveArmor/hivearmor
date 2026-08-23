# Compliance assurance workspace research

Retrieved: **2026-08-21**
Applies to: `/compliance` and the future assessment/control/evidence/remediation/report contracts `CMP-001`–`CMP-009`
Refresh trigger: review when an OEM materially changes its assessment model, when HiveArmor adds control/evidence APIs, or at least every six months.

## Research boundary

This note compares workflow structure, not brand styling. HiveArmor retains HiveCarbon Hybrid tokens, the compact 50px operational shell, explicit authorization boundaries and its existing React/TypeScript/AG Grid stack. Vendor terminology is normalized into assessment, control, evidence, action, exception and report concepts.

## Official sources and product implications

### Microsoft Purview Compliance Manager

Source: <https://learn.microsoft.com/en-us/purview/compliance-manager-assessments>

Paraphrased conclusion: Microsoft treats an assessment as the primary work object. The inventory exposes status and progress, then the detail experience separates controls and improvement actions. It supports grouping, service/subscription scope, control-family/status/service filtering, roles at assessment level, template update review, and timestamped snapshot exports.

HiveArmor implication: framework catalog entries and assessment instances must not be conflated. The default page should inventory assessments/framework records, surface scope and freshness, and progressively open control/action details. Export belongs to a snapshot-bound report job, not a client-side CSV over loaded rows.

### AWS Audit Manager

Sources:

- <https://docs.aws.amazon.com/audit-manager/latest/userguide/concepts.html>
- <https://docs.aws.amazon.com/audit-manager/latest/userguide/how-evidence-is-collected.html>
- <https://docs.aws.amazon.com/audit-manager/latest/userguide/examples-of-controls.html>

Paraphrased conclusion: AWS organizes framework → control set → control → evidence source/evidence. Assessments define in-scope accounts and services. Evidence can be automated or manual and preserves its data-source type; control sets can be delegated for review. The dashboard emphasizes controls with non-compliant evidence by domain.

HiveArmor implication: evidence must retain collection provenance, resource scope, timestamps and automated/manual designation. A score without the underlying evidence and scope is only an aggregate technical signal. The detail drawer should progressively load rather than embedding large artifacts in the framework list.

### ServiceNow Governance, Risk, and Compliance

Sources:

- <https://www.servicenow.com/docs/r/governance-risk-compliance/audit-management/continuous-monitoring.html>
- <https://www.servicenow.com/docs/r/governance-risk-compliance/continuous-risk-monitoring/assess-control-effectiveness.html>
- <https://www.servicenow.com/docs/r/governance-risk-compliance/grc-compliance-management-workspace/manage-evidence-requests-ws.html>

Paraphrased conclusion: ServiceNow connects continuous control/risk indicators to evidence, issues and updated risk state. Assessment work separates implementation from design/operating-effectiveness tests; evidence requests have assignees and can require approval or confidentiality controls. Findings can become tracked remediation work or POA&M items.

HiveArmor implication: implementation, technical observation, independent test and attestation require separate states. Failed indicators should lead to governed issues/actions with ownership, due dates, exception/approval and verification—not an unreviewed browser-side “fix” action.

### NIST Cybersecurity Framework 2.0

Sources:

- <https://www.nist.gov/cyberframework/profiles>
- <https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1300.pdf>

Paraphrased conclusion: CSF Organizational Profiles express Current and Target cybersecurity outcomes and make gaps/priorities visible. The CSF is outcome-based and customizable rather than a single prescriptive compliance checklist.

HiveArmor implication: do not label an aggregate percentage “compliant.” Future assessment detail should show Current versus Target outcome status, priority and evidence coverage, with the applicable organizational scope.

### CIS Critical Security Controls

Source: <https://www.cisecurity.org/controls/implementation-groups>

Paraphrased conclusion: CIS Implementation Groups prioritize safeguards according to enterprise risk/resources, with IG1 as essential cyber hygiene and higher groups adding safeguards.

HiveArmor implication: when licensed/applicable mappings exist, the UI should support profile/implementation-group filters and applicability without copying licensed benchmark text. `Not assessed`, `not applicable`, `unsupported` and `failed` remain distinct.

## Resulting HiveArmor information architecture

1. Compact page identity and trustworthy refresh/report pivots.
2. Explicit assurance boundary explaining that technical signals are not certification.
3. Small KPI strip: reported aggregate, framework/assessment coverage, pass/fail/unknown and freshness.
4. Sticky search, assessment-state and sort controls.
5. Virtualized assessment/framework inventory with explicit scope, version and freshness.
6. Full-height framework/assessment context loaded only after explicit selection.
7. Progressive tabs when contracts exist: controls, evidence, improvement actions, exceptions/history and reports.
8. Governed AI summaries only when evidence citations, permission filtering and uncertainty are available.

## Rejected patterns

- A traffic-light percentage presented as legal compliance or certification.
- Auto-selecting the first framework and opening context without user intent.
- An empty “controls compliant” grid when no control-result API exists.
- Client-created evidence, applicability, remediation completion or exceptions.
- Synchronous exports of only the rows currently loaded in the browser.
- Treating missing telemetry or an unassessed framework as a zero score or a pass.
