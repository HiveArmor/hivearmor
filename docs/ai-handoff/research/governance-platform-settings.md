# Governance and platform settings research

Retrieved: **2026-08-23**

Scope: audit evidence, retention and legal hold, governed configuration change, and API lifecycle administration for `/admin/audit`, `/admin/retention`, `/admin/settings` and `/settings/system`.

This is an offline, paraphrased decision record for models without web access. It does not replace the linked authoritative sources.

## Primary-source findings

### NIST — security log management

- Sources: [NIST SP 800-92](https://csrc.nist.gov/pubs/sp/800/92/final) and the [SP 800-92 Rev. 1 initial public draft](https://csrc.nist.gov/pubs/sp/800/92/r1/ipd).
- Conclusion: logging is a lifecycle, not a table. An operator needs collection and storage provenance, access control, monitoring, analysis, retention and disposal policy. Security-relevant logs should be handled as evidence whose availability and trust properties are explicit.
- HiveArmor implication: audit browsing stays read-only and separate from change authority. The UI must show when tenant scope, exact totals, correlation identifiers, integrity proof, retention or export provenance are not reported. A generic application log index must not be labelled immutable merely because the page is named Audit.
- Limitation: SP 800-92 is technology-neutral and does not prescribe HiveArmor's endpoint shape, pagination or cryptographic proof format.

### Elastic — audit event separation and lifecycle management

- Sources: [Elasticsearch audit logging](https://www.elastic.co/guide/en/elasticsearch/reference/current/enable-audit-logging.html), [index lifecycle concepts](https://www.elastic.co/guide/en/elasticsearch/reference/current/ilm-concepts.html), and the [index lifecycle API](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-lifecycle-management-api.html).
- Conclusion: security audit logging is a separately enabled capability and lifecycle administration acts on managed data through explicit phases and policies. Lifecycle configuration has operational consequences beyond a single retention-days number.
- HiveArmor implication: keep audit evidence, retention policy and platform configuration in distinct workspaces. Retention needs effective index bindings, searchable/archive/delete phases, current state, policy version, volume impact and an explanation of which preservation hold prevents deletion. Unknown lifecycle state must not be shown as healthy.
- Limitation: Elasticsearch-specific ILM phases are an OEM implementation model, not a requirement to adopt Elastic's storage stack or API names.

### Splunk — audit controls and index retention

- Sources: Splunk Enterprise [`audit.conf`](https://help.splunk.com/en/splunk-enterprise/administer/admin-manual/9.0/welcome-to-splunk-enterprise-administration/configuration-file-reference/9.0.8-configuration-file-reference/audit.conf), [index storage configuration](https://help.splunk.com/en/splunk-enterprise/administer/manage-indexers-and-indexer-clusters/9.4/manage-index-storage/configure-index-storage), and [indexed-data archiving](https://help.splunk.com/en/splunk-enterprise/administer/manage-indexers-and-indexer-clusters/9.1/back-up-and-archive-your-indexes/archive-indexed-data).
- Conclusion: audit behavior, active storage sizing/age and archival are separately administered. Retention can be governed by age and capacity; archival requires an explicit operational destination and recovery design.
- HiveArmor implication: show the active searchable window, archive target, compression, measured volume and effective deletion boundary independently. A retention proposal needs preview and rollback/restore consequences; a browser form must not imply that storage policy has been enforced.
- Limitation: Splunk configuration files and bucket terminology are vendor-specific and should not leak into the public HiveArmor contract.

### ServiceNow — governed policy change and approval trace

- Sources: [change approval policy](https://www.servicenow.com/docs/r/it-service-management/change-management/change-approval-policy.html), [dynamic policy approval](https://www.servicenow.com/docs/r/governance-risk-compliance/policy-and-compliance-management/dynamic-approval-config-for-a-policy.html), and [control-tailoring approval](https://www.servicenow.com/docs/r/governance-risk-compliance/grc-continuous-authorization-and-monitoring-workspace/approve-reject-control-tailoring-request.html?contentId=emapq_b9mUyt3vcIBSSMPg).
- Conclusion: impactful changes are reviewable objects with policy-driven approvals and a traceable approve/reject outcome; reviewers need before/after context rather than an unversioned edit form.
- HiveArmor implication: configuration and retention changes require a draft, normalized diff, validation, blast-radius preview, separation-of-duties-aware approval, scheduled rollout, per-instance application state, rollback target and immutable decision evidence. Hive Intelligence may explain or draft a change, but cannot approve or execute it.
- Limitation: ServiceNow workflow names and roles are examples. HiveArmor authority remains server-derived and tenant-specific.

## Resulting enterprise workflow

1. **Observe:** start with a compact read-only audit ledger, bounded retention inventory or secret-safe effective configuration. Display source, scope and freshness before actions.
2. **Inspect:** select one row to open progressive full-height context. Preserve keyboard navigation and avoid loading payload/detail fields in list projections.
3. **Propose:** create a versioned draft containing purpose, reason, scope, base version and requested window. Raw secret values are write-only and never appear in the diff.
4. **Preview:** return authoritative validation, affected tenants/indices/instances, projected volume or availability impact, dependency warnings and rollback eligibility.
5. **Approve:** evaluate risk-based policy, separation of duties and change-window constraints. Record explicit decisions and reasons.
6. **Roll out:** apply in bounded stages with per-target receipts, cancellation boundaries and observable failure/partial states.
7. **Verify or roll back:** compare effective state to the approved version, surface drift and preserve the resulting audit evidence.

The implemented frontend provides the Observe/Inspect shell and a deliberately disabled preview of the later stages. It does not manufacture authoritative mutations over the currently incomplete backend.

## API lifecycle administration decision

Treat an API as deprecated only after all of the following are true: a successor is deployed, ownership and affected consumers are known, migration status is measured, a removal gate exists, and responses advertise the standard `Deprecation`, `Sunset` and successor `Link` headers. The checked-in `/api/ha-settings` and `/api/ha-admin/settings` overlap is therefore recorded as a migration requirement, not as a completed deprecation.

## Refresh triggers

Refresh this note when NIST finalizes SP 800-92 Rev. 1, Elastic/Splunk lifecycle or audit guidance materially changes, ServiceNow governance behavior changes, HiveArmor deploys its versioned settings/change-control service, or `GOV-001`–`GOV-010` changes status.
