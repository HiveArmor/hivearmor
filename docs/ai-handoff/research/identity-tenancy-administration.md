# Identity, tenancy and MSSP administration research

Retrieved: **2026-08-22**

This note preserves the product conclusions used for the HiveArmor Identity & Tenancy control plane. It is an offline continuation aid, not a copy of vendor documentation. Refresh it when the identity, tenant, role, SCIM, OIDC, session or audit contracts change, or when the cited product guidance materially changes.

## Primary sources and conclusions

### Microsoft Entra administration and access reviews

- Sources: [Microsoft Entra admin center](https://learn.microsoft.com/en-us/entra/fundamentals/entra-admin-center), [secure access practices](https://learn.microsoft.com/en-us/entra/architecture/secure-introduction), [access reviews overview](https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview), and [deploy access reviews](https://learn.microsoft.com/en-us/azure/active-directory/governance/deploy-access-reviews).
- Conclusion: identity administration is a lifecycle, not a flat user CRUD screen. Operators need effective role and scope, authentication strength, last use, reviewer, recommendation, decision progress, due date and enforcement outcome. Privileged and emergency access must be scarce, separately observable and periodically reviewed.
- HiveArmor implication: show directory, privileged access, tenant scope and review state together, but keep invitations, suspension, role changes and break-glass actions governed by server-side scope, separation of duties, expiry and immutable audit.

### Microsoft Azure Lighthouse cross-tenant administration

- Sources: [Azure Lighthouse overview](https://learn.microsoft.com/en-us/azure/lighthouse/overview), [view and manage service providers](https://learn.microsoft.com/en-us/azure/lighthouse/how-to/view-manage-service-providers), and [cross-tenant management experience](https://learn.microsoft.com/en-us/azure/lighthouse/concepts/cross-tenant-management-experience).
- Conclusion: an MSSP needs a delegated cross-tenant plane that preserves the customer's tenant boundary and makes delegated principals, roles and scope visible. Platform-global administration, service-provider delegation and tenant-local administration are different authority models.
- HiveArmor implication: label administration mode and tenant scope explicitly. Never infer that a platform role grants every tenant action, and never merge delegated memberships into the global directory without provenance.

### Okta lifecycle management and SCIM

- Sources: [Okta provisioning workflow](https://help.okta.com/oie/en-us/Content/Topics/Provisioning/lcm/lcm-provisioning-workflow.htm) and [SCIM provisioning integration overview](https://developer.okta.com/docs/guides/scim-provisioning-integration-overview/main/).
- Conclusion: authoritative provisioning requires create/update/deactivate semantics, group-to-role mapping, token lifecycle, failure visibility and reconciliation. A configured endpoint or token alone does not prove successful provisioning.
- HiveArmor implication: keep authentication and provisioning visibly separate; show connection state, last activity and secret protection without returning secrets. Add provisioning receipts, mapping/version state and reconciliation failures before declaring SCIM production ready.

### Splunk roles and workload-aware access

- Sources: [define roles with capabilities](https://help.splunk.com/en/splunk-enterprise/administer/manage-users-and-security/9.0/manage-splunk-platform-users-and-roles/define-roles-on-the-splunk-platform-with-capabilities), [manage roles in Splunk Web](https://help.splunk.com/en/splunk-enterprise/administer/manage-users-and-security/9.1/manage-splunk-platform-users-and-roles/create-and-manage-roles-with-splunk-web), [role-based user access](https://help.splunk.com/en/splunk-enterprise/administer/manage-users-and-security/9.0/manage-splunk-platform-users-and-roles/about-configuring-role-based-user-access), and [workload management examples](https://help.splunk.com/en/splunk-enterprise/administer/manage-workloads/10.4/workload-management-examples/workload-management-examples).
- Conclusion: named roles are insufficient without effective capabilities, inherited constraints, data scope and workload/resource boundaries. Security administration must make effective access inspectable.
- HiveArmor implication: the current authority-name list is compatibility data. A production role contract must project effective capabilities, tenant/data scope, inheritance and conflicts, and must validate changes against the same authorization engine used at request time.

### Emergency access

- Source: [Microsoft emergency access accounts](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access).
- Conclusion: emergency access should be deliberately separate, strongly monitored and regularly validated rather than treated as another persistent administrator account.
- HiveArmor implication: future break-glass support needs time-bound activation, strong authentication, out-of-band monitoring, reason, approval/exception policy, automatic expiry and mandatory post-use review. The frontend must not simulate this workflow.

## Adopted interaction model

1. One compact control plane with Directory, Tenants, Access reviews, Federation and Audit activity views.
2. Same-snapshot operational summaries and dense bounded inventories; full-height progressive context is opened only after explicit selection.
3. Explicit source provenance for local, OIDC and SCIM identities; authentication and provisioning are separate stages.
4. Global, delegated/MSSP and tenant-local authority remain visibly distinct.
5. High-impact workflows use reviewable setup and server-authoritative preview/version/idempotency/audit. Unsupported production mutation is disabled rather than simulated.
6. Fictional workflow depth is restricted to development foundation fixtures.

## Known limitations and refresh triggers

- Vendor interfaces evolve; recheck these sources before changing the role, review, federation or delegation model.
- Reconcile this note when `IAM-001`–`IAM-010` change status, when a canonical identity API supersedes the legacy surfaces, or when HiveArmor adds passwordless authentication, JIT/PIM, session risk, customer-managed federation or regional data residency.
