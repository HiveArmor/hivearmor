---
name: cloud-audit
description: Cloud infrastructure security audit — AWS/GCP/Azure IAM, network, storage, compute, logging. CIS Benchmarks, IMDSv2, public bucket detection. Triggered by "cloud security audit", "AWS security review", "S3 bucket exposure", "cloud IAM audit", "GCP security check".
---

# Cloud Infrastructure Security Audit

Audits AWS, GCP, and Azure environments for misconfigurations, permission excess, and exposure gaps.

## Scope First

Before running anything:
- Which cloud provider(s) and account IDs are in scope
- Active regions
- Whether live CLI access exists or reviewing IaC (Terraform, CloudFormation, Pulumi)

## Key Audit Domains

### Identity & Access (IAM)

```bash
# AWS — find overly permissive policies
aws iam list-policies --scope Local | jq '.Policies[].PolicyName'
aws iam get-policy-version --policy-arn <ARN> --version-id v1 | \
  jq '.PolicyVersion.Document.Statement[] | select(.Effect=="Allow" and (.Action[]?=="*" or .Resource[]?=="*"))'

# Find root account activity
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=root \
  --start-time $(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ)

# Stale access keys (>90 days)
aws iam list-access-keys | jq '.AccessKeyMetadata[] | select(.CreateDate < now-7776000)'
```

Check for:
- Root/admin accounts lacking MFA
- Stale access keys (>90 days)
- Policies containing `"Action": "*"` or `"Resource": "*"`
- GCP: primitive roles (Owner/Editor) assigned broadly
- Azure: excessive Owner/Contributor assignments, privileged guest users

### Network

```bash
# AWS — find security groups with 0.0.0.0/0 ingress
aws ec2 describe-security-groups | jq '.SecurityGroups[] | 
  select(.IpPermissions[].IpRanges[].CidrIp == "0.0.0.0/0") | 
  {GroupId, GroupName, FromPort: .IpPermissions[].FromPort}'

# Verify VPC Flow Logs enabled
aws ec2 describe-flow-logs | jq '.FlowLogs[] | select(.FlowLogStatus != "ACTIVE")'
```

Flags:
- Firewall rules permitting `0.0.0.0/0` ingress
- Open SSH (22) or RDP (3389) from internet
- Disabled VPC flow logs
- Databases in public subnets

### Storage

```bash
# AWS S3 — check for public buckets
aws s3api list-buckets | jq '.Buckets[].Name' | \
  while read bucket; do
    aws s3api get-public-access-block --bucket $bucket 2>/dev/null || echo "PUBLIC: $bucket"
  done

# Check encryption
aws s3api get-bucket-encryption --bucket <name>
```

- S3: public access blocked, encryption enabled, versioning on, lifecycle policies set
- GCP: no `allUsers` access
- Azure: no anonymous blob access

### Compute

```bash
# Verify IMDSv2 enforcement (AWS EC2)
aws ec2 describe-instances | jq '.Reservations[].Instances[] | 
  select(.MetadataOptions.HttpTokens != "required") | 
  {InstanceId, State: .State.Name}'

# Find instances with public IPs
aws ec2 describe-instances | jq '.Reservations[].Instances[] | 
  select(.PublicIpAddress != null) | {InstanceId, PublicIpAddress}'
```

### Logging & Monitoring

```bash
# AWS CloudTrail — verify all regions
aws cloudtrail describe-trails --include-shadow-trails | \
  jq '.trailList[] | {Name, IsMultiRegionTrail, LogFileValidationEnabled}'

# GuardDuty enabled
aws guardduty list-detectors
```

## Finding Disposition

| Status | Meaning |
|--------|---------|
| Fixed | Remediated during audit |
| Deferred | Scheduled with timeline |
| Accepted Risk | Documented business justification |

## Report Structure

```markdown
# Cloud Security Audit Report
**Account(s):** [IDs] | **Provider:** [AWS/GCP/Azure] | **Regions:** [list] | **Date:** [ISO date]

## Summary
- Critical: [N] | High: [N] | Medium: [N] | Low: [N]

## Findings
### [CRITICAL] IAM: Root Account Without MFA
**Resource:** account/root
**Risk:** Full account takeover with no detection or recovery path
**Remediation:** `aws iam enable-mfa-device --user-name root ...`

## Prioritized Action Plan
1. Critical → immediate (this week)
2. High → this sprint
3. Medium → this month
4. Low → next quarter
```

## Boundaries

Audits run only against infrastructure the user controls. Discovered active compromise indicators get flagged immediately. No exploitation of findings on third-party infrastructure.
