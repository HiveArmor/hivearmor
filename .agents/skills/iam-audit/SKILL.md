---
name: iam-audit
description: IAM security audit and design — AWS/GCP/Azure over-permissive policies, stale keys, shadow admin, MFA bypass, JIT privilege, service account keys. Triggered by "IAM audit", "identity access review", "AWS IAM policy", "service account keys", "privilege access management".
---

# IAM Audit & Design

Covers three engagement modes: audit existing IAM, design greenfield IAM, migrate to a target model.

## Pre-Audit Questions

1. Which cloud providers and account IDs are in scope?
2. Is this an audit of existing configuration or design review of new setup?
3. Is live CLI access available, or reviewing IaC (Terraform/Pulumi)?

## AWS Audit

```bash
# Start with the credential report
aws iam generate-credential-report
aws iam get-credential-report --output text | base64 -d > credential-report.csv

# Find AdministratorAccess assignments
aws iam list-attached-user-policies --user-name <user> | grep AdministratorAccess
aws iam list-policies --scope Local | jq '.Policies[].PolicyName'

# Wildcard policies
aws iam get-policy-version --policy-arn <ARN> --version-id v1 | \
  jq '.PolicyVersion.Document.Statement[] | 
    select(.Effect=="Allow" and ((.Action[]?=="*") or (.Resource[]?=="*")))'

# Stale access keys (>90 days)
aws iam list-access-keys | \
  jq '.AccessKeyMetadata[] | select(.Status=="Active") | {UserName, AccessKeyId, CreateDate}'

# Cross-account trust policies
aws iam get-role --role-name <name> | jq '.Role.AssumeRolePolicyDocument'
# Watch for: Principal: { AWS: "*" } — exposes role to any AWS account

# Access Analyzer (automated finding discovery)
aws accessanalyzer list-findings | jq '.findings[] | select(.status=="ACTIVE")'
```

## GCP Audit

```bash
# Primitive roles (Owner/Editor) — highest risk
gcloud projects get-iam-policy <PROJECT> | \
  grep -A2 "roles/editor\|roles/owner"

# Downloaded service account keys — should be zero
gcloud iam service-accounts keys list --iam-account <SA_EMAIL> \
  --filter="keyType=USER_MANAGED"

# allUsers or allAuthenticatedUsers bindings
gcloud projects get-iam-policy <PROJECT> --flatten="bindings[].members" \
  --filter="bindings.members:(allUsers OR allAuthenticatedUsers)"
```

## Azure Audit

```bash
# Excessive Owner/Contributor at subscription level
az role assignment list --subscription <id> | \
  jq '.[] | select(.roleDefinitionName=="Owner" or .roleDefinitionName=="Contributor")'

# Client secrets expiration
az ad app list | jq '.[] | {displayName, passwordCredentials: .passwordCredentials[].endDateTime}'
```

## Common Anti-Patterns

| Anti-Pattern | Risk |
|-------------|------|
| Role explosion | Hundreds of overlapping roles — nobody deletes old ones |
| Permission accretion | Temporary incident access never revoked after incident resolved |
| Shadow admin | Non-admin role that can transitively assume an admin role |
| MFA bypass | IMAP/SMTP legacy auth protocols circumvent MFA policies |
| Static service account keys | Every downloaded key is a credential rotation problem |

## Design Principles

1. **Federate** — IdP is the authority; don't manage users natively in cloud providers
2. **Groups, not direct** — people get access via groups, not individual bindings
3. **Workload identity** — service-to-service uses workload identity federation, never static keys
4. **JIT privilege** — privileged access is just-in-time, not standing
5. **Break-glass** — emergency accounts must be tested quarterly, with alerts on use
6. **Observable enforcement** — least privilege requires observable enforcement, not just policy statements
7. **Log authorization decisions** — every authorization decision should be auditable

## Auth Flow Standards

- Browser/mobile: Authorization Code + PKCE (implicit flow is deprecated)
- Server-to-server: Client Credentials with short-lived tokens
- Refresh tokens: `HttpOnly Secure` cookies, never `localStorage`

## Migration Playbook

Seven steps: inventory → target design → parallel setup → pilot → wave migration → deprecation deadline → audit trail.

**Migrations without deadlines never finish.** Set a hard cutoff for the legacy system.
