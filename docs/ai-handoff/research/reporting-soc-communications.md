# Reporting and SOC communications research

Retrieved: **2026-08-21**

Purpose: preserve the authoritative research used for the HiveArmor Reporting Operations workspace for future offline/Bedrock sessions. These are paraphrased design conclusions, not copied vendor content or a substitute for current source review.

## Official sources and conclusions

### Splunk Enterprise — scheduled reports and permissions

- Source: https://help.splunk.com/en/splunk-enterprise/create-dashboards-and-reports/reporting-manual/9.3/report-management/schedule-reports
- Source: https://help.splunk.com/en/splunk-enterprise/create-dashboards-and-reports/reporting-manual/9.1/report-management/set-report-permissions
- Conclusion: mature reporting separates saved report definition, schedule, execution identity, permission, output action and generated job. Scheduling is capability-gated; concurrent schedules need windows/priority; deliveries may target email, webhook, lookup or indexed events. Scheduled work runs with an owner identity, making privilege and data-visibility semantics operationally important.
- HiveArmor implication: schedules must expose run-as identity, tenant and field scope, priority/window, recipient/destination authorization, next/last run, delivery health and immutable history. A UI cron string plus recipient list is insufficient.

### Splunk Enterprise — PDF generation and delivery

- Source: https://help.splunk.com/?resourceId=SplunkCloud_Report_GeneratePDFsofyourreportsanddashboards
- Conclusion: PDF generation is a bounded render job with delivery configuration, output naming, page limits and a render timeout. Large tables and slow searches materially affect render behavior.
- HiveArmor implication: generated artifacts need asynchronous progress/cancellation, source snapshot and template version, page/row/byte/time budgets, format/size/hash, expiry and signed download rather than a nullable URL on a metadata row.

### Microsoft Sentinel and Azure Monitor Workbooks

- Source: https://learn.microsoft.com/en-us/azure/sentinel/monitor-your-data
- Source: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview
- Source: https://learn.microsoft.com/en-us/azure/sentinel/resource-context-rbac
- Conclusion: templates and saved workbooks are separate, versionable resources; workbooks can combine multiple data sources, queries, parameters, text, charts and grids. Viewing and editing are role-gated, and access to a workbook does not automatically grant access to every referenced resource. Resource-context RBAC supports narrower data scope than a whole workspace.
- HiveArmor implication: template access, report-definition access and underlying data access are distinct checks. Preview, generation and sharing must reapply tenant/resource/field permissions to every referenced source; report ownership must never become a privilege bridge.

### ServiceNow Security Operations — post-incident review

- Source: https://www.servicenow.com/content/dam/servicenow-assets/public/en-us/doc-type/resource-center/data-sheet/ds-security-operations.pdf
- Conclusion: post-incident review is part of the incident workflow and can preserve distributed assessments as a time-stamped historical audit record, rather than being an isolated free-form export.
- HiveArmor implication: after-action reports should be linked, versioned workflow records with contributing assessments, response measures, lessons and improvement owners. Publication cannot detach the report from its incident/evidence/audit lineage.

### NIST SP 800-61 Rev. 3

- Source: https://csrc.nist.gov/pubs/sp/800/61/r3/final
- Source: https://doi.org/10.6028/NIST.SP.800-61r3
- Conclusion: incident response is integrated across the CSF 2.0 lifecycle, including preparation and lessons learned, rather than being only a terminal incident document. Communications and improvement evidence therefore need to retain context across preparation, detection, response and recovery.
- HiveArmor implication: SITREP, incident and after-action outputs should be typed operational records. Incident reports preserve evidence-backed scope/timeline/impact/response/validation; after-action reports preserve root cause, control gaps, metrics, lessons and owned improvement actions. A generic name/description/type entity cannot support this safely.

## Synthesized enterprise lifecycle

1. Select a versioned template and authorized tenant/entity/incident/time scope.
2. Validate required sources, field permissions, classification and redaction profile.
3. Queue a cancellable generation job bound to source snapshots and evidence citations.
4. Preview the artifact with partial-source, freshness and factual/citation warnings.
5. Review/redact and approve under separation-of-duties policy when required.
6. Publish an immutable version with hash, watermark/classification and retention policy.
7. Deliver only to revalidated recipients/destinations and record outcomes.
8. Preserve bounded audit, schedule history, access/download events and improvement actions.

## Hive Intelligence boundary

AI may draft narrative sections from permission-filtered cited evidence and identify missing sources or inconsistent assertions. It must distinguish fact from inference and retain model/prompt/policy/version provenance. It cannot modify source evidence, expand scope, decide redaction, approve, publish, distribute or silently rewrite an approved artifact.

## Limitations and refresh trigger

Refresh when report generation, scheduler, redaction, recipient authorization, retention/legal-hold or AI governance contracts change, or when Splunk, Microsoft, ServiceNow or NIST guidance is revised.
