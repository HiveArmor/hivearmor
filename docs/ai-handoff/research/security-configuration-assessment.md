# Security configuration assessment research brief

Retrieved: **2026-08-13**  
Purpose: offline design and contract input for `/posture/cis-benchmark`.  
Method: official CIS and NIST primary sources; conclusions below are paraphrased and do not reproduce benchmark content.

## Analyst decision model

A useful security-configuration assessment answers these questions in order:

1. Which benchmark, release, platform and profile was evaluated?
2. Was the recommendation applicable to this endpoint and was the check automated or manual?
3. What was observed, what was expected and what authoritative source produced the evidence?
4. Is the result pass, fail, not applicable, collection error or not assessed?
5. What operational impact, owner, exception and maintenance window govern remediation?
6. Did a new assessment verify the change without introducing a regression?

A percentage is a technical assessment rate, not a compliance attestation. `ERROR`, `NOT_APPLICABLE`, `NOT_ASSESSED`, stale and partial-source states must remain distinguishable. The fleet aggregate should be computed from eligible check counts for a common benchmark/profile/version, not as an unweighted average of endpoint percentages.

## Primary sources and product implications

### CIS Benchmarks

Sources:

- https://www.cisecurity.org/cis-benchmarks
- https://www.cisecurity.org/insights/blog/cis-benchmarks-101

Conclusion: CIS Benchmarks are consensus-developed, prescriptive secure-configuration recommendations for specific technologies. Benchmark identity and version matter because recommendations evolve with the target platform. Level 1 is intended as a practical baseline with limited operational impact; Level 2 is defense in depth and can have greater operational consequences. Profiles do not remove the need to evaluate organizational applicability.

Product implication: every result and summary needs benchmark name, benchmark version, target platform/version, profile, recommendation version and assessment method. The UI must explain Level 1/2 rather than present Level 2 as universally “better.” Benchmark text and licensed content should be referenced through approved pack provenance, not copied into browser fixtures or logs.

### NIST National Checklist Program

Source: https://checklists.nist.gov/

Conclusion: the National Checklist Program provides a repository and process for security configuration checklists. Checklist metadata—including authority, target product, version and status—is necessary to determine whether a checklist is appropriate.

Product implication: benchmark packs require an authoritative catalog, provenance, lifecycle and compatibility model. Results from different packs or versions must not be silently combined. Withdrawn, superseded, unsupported or partially applicable packs need explicit states.

### NIST SP 800-128 — security-focused configuration management

Source: https://csrc.nist.gov/pubs/sp/800/128/final

Conclusion: secure configuration is a lifecycle involving baseline definition, controlled change, monitoring and assessment. Security-focused configuration management is integrated with organizational change control rather than being an isolated scanner score.

Product implication: remediation must use governed preview/approval/change windows, produce immutable audit, and create a fresh verification assessment. Exceptions require owner, rationale, expiry and reevaluation. A failed check should pivot to the affected asset, change context and supporting evidence; it must not provide a one-click ungoverned configuration mutation.

## Long-duration interaction guidance

- Default the queue to failed checks needing review while preserving one-click access to errors and coverage gaps.
- Keep filters and pager visible; use bounded, cancellable, deterministic server pagination.
- Show endpoint, check, outcome, profile, pack and observation freshness in the grid; progressively load detailed evidence only after selection.
- Separate observed and expected values in a full-height context panel, with provenance and redaction descriptors.
- Provide row density and keyboard navigation; do not rely on color alone for outcome.
- Treat collection errors as unknown. Do not mix them into “failed” counts or hide them in a success rate.
- Preserve source coverage and freshness near every aggregate. A zero-row result is not proof of secure configuration.
- Rank remediation using policy, criticality, exposure, disruption and exception state only when the backend returns those verified inputs.

## AI boundary for Hive Intelligence

Hive Intelligence may summarize failed recommendations, identify common configuration themes and draft a reviewable remediation plan grounded in authorized evidence. It must include citations, uncertainty, missing-source warnings, model/prompt/version and expiry. It cannot decide applicability, approve an exception, change configuration, accept risk or claim compliance autonomously. Browser-displayed benchmark text, observed values and logs are untrusted prompt inputs.

## Current HiveArmor contract gap

The checked-in backend exposes an offset-paged result projection and per-agent/pack summaries. It does not currently expose complete authorized tenant scope, benchmark version/platform/profile metadata, eligibility and coverage, evidence provenance, lifecycle history, governed remediation/exception/rescan, snapshot-bound aggregation, or Hive Intelligence evidence contracts. The ingestion path accepts an untyped JSON payload asynchronously and the checked-in endpoint agent producer was not found during this audit.

## Refresh triggers

Refresh this note when CIS changes benchmark profile/version guidance, NIST updates the National Checklist Program or SP 800-128, HiveArmor licenses or changes benchmark content, the SCA producer/schema changes, or the product adds remediation/exception/verification workflows.
