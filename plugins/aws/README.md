# HiveArmor Plugin for Amazon Web Services (AWS)

> Part of the [HiveArmor](https://github.com/hivearmor) Hyper-scale Incident Visibility Engine platform.

## Overview

The HiveArmor AWS plugin is a Go-based connector that ingests logs from **AWS CloudWatch Logs** and forwards them to the HiveArmor Event Processor for correlation and analysis.

The plugin uses the **AWS Go SDK** to communicate with the CloudWatch Logs service and a **gRPC client over a Unix socket** to deliver log data to the HiveArmor processing pipeline. Once ingested, logs flow through the Event Processor correlation engine and are indexed in OpenSearch under the `_v3_hive_aws-YYYY.MM.DD` index pattern, where they become available for alerting, dashboards, and incident workflows in the HiveArmor UI.

**Plugin binary name:** `com.hivearmor.aws.plugin`

> A valid AWS account with appropriate IAM permissions is required. The plugin will not function without valid credentials.

---

## Architecture

```
AWS CloudWatch Logs
        |
        |  AWS Go SDK (HTTPS)
        v
com.hivearmor.aws.plugin
        |
        |  gRPC (Unix socket)
        v
HiveArmor Event Processor
        |
        v
OpenSearch (_v3_hive_aws-YYYY.MM.DD)
        |
        v
HiveArmor UI / Alerts / Incidents
```

---

## Requirements

- HiveArmor v11.x (LTS) or later
- Go 1.21+ (for building from source)
- A valid AWS account
- IAM user or role with `logs:DescribeLogGroups`, `logs:DescribeLogStreams`, and `logs:GetLogEvents` permissions on the target log groups
- HiveArmor Event Processor running and accessible via Unix socket

---

## Configuration

The plugin is configured through the HiveArmor plugin management interface or via environment variables. The following parameters are required:

| Parameter | Environment Variable | Description |
|---|---|---|
| AWS Access Key ID | `AWS_ACCESS_KEY_ID` | The access key ID for an IAM user with CloudWatch Logs read permissions |
| AWS Secret Access Key | `AWS_SECRET_ACCESS_KEY` | The secret access key paired with the above access key ID |
| AWS Region | `AWS_REGION` | The AWS region where the target CloudWatch log groups reside (e.g., `us-east-1`) |
| Log Group Names | `AWS_LOG_GROUP_NAMES` | Comma-separated list of CloudWatch log group names to ingest (e.g., `/aws/lambda/my-function,/aws/eks/cluster`) |

### IAM Policy Example

The IAM user or role used by this plugin requires the following minimum permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

For least-privilege environments, restrict the `Resource` field to the specific log group ARNs you intend to monitor.

---

## Communication

- **Inbound (from AWS):** The plugin polls CloudWatch Logs using the AWS Go SDK over HTTPS. No inbound network exposure is required.
- **Outbound (to Event Processor):** The plugin connects to the HiveArmor Event Processor via a gRPC client over a Unix socket located in the HiveArmor working directory. No TCP port is required for this leg.

---

## Supported Log Sources

The following AWS services write logs to CloudWatch Logs and are supported by this plugin:

- AWS Lambda function logs
- Amazon EKS control plane and node logs
- Amazon ECS task logs (via FireLens or awslogs driver)
- AWS CloudTrail (when delivered to CloudWatch Logs)
- Amazon VPC Flow Logs (when delivered to CloudWatch Logs)
- Amazon RDS and Aurora instance logs
- AWS WAF logs
- AWS API Gateway access logs
- Any custom application log group

---

## Building from Source

```bash
cd plugins/aws
go build -o com.hivearmor.aws.plugin .
```

Place the resulting binary in the HiveArmor plugins directory. The Event Processor loads plugins by their exact binary name (`com.hivearmor.aws.plugin`).

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Plugin fails to start | Invalid or missing AWS credentials | Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set and correct |
| No logs ingested | Log group name mismatch | Confirm log group names match exactly, including leading `/` if present |
| gRPC connection refused | Event Processor not running | Ensure the HiveArmor Event Processor is running and the Unix socket exists |
| `AccessDeniedException` from AWS | Insufficient IAM permissions | Attach the IAM policy shown in the Configuration section |
| Logs appear stale | Polling interval | The plugin polls on a fixed interval; recent events may take up to one polling cycle to appear |

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)
- Support: support@hivearmor.io
- Enterprise support: available under HiveArmor enterprise tier

---

## License

This plugin is part of the HiveArmor platform. See the root `LICENSE` file for terms. Community and enterprise licensing tiers are available. v11.x LTS is supported until November 2030.
