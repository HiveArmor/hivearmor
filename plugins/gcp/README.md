# HiveArmor GCP Plugin

Google Cloud Platform log collection plugin for [HiveArmor](https://hivearmor.io) — Hyper-scale Incident Visibility Engine.

**Plugin name:** `com.hivearmor.gcp`
**Module:** `github.com/hivearmor/plugins/gcp`
**Language:** Go 1.25+

---

## Overview

The GCP plugin connects HiveArmor to Google Cloud Platform's observability pipeline by pulling structured log data from a Cloud Pub/Sub subscription. Logs are received in real time, normalized to HiveArmor's internal event schema, and forwarded to the Event Processor for correlation and indexing.

Multiple GCP projects or organizational units can be monitored simultaneously by configuring independent module groups, each with its own Pub/Sub subscription.

---

## Supported Log Sources

All GCP log types are routed through Cloud Logging log sinks, exported to Pub/Sub, and consumed by this plugin. The following sources are fully supported:

| Source | Description |
|---|---|
| **Cloud Logging (formerly Stackdriver)** | Application and infrastructure logs from all GCP services |
| **Cloud Audit Logs** | Admin Activity, Data Access, System Event, and Policy Denied audit records |
| **VPC Flow Logs** | Network traffic metadata for VPC subnets (source/dest IP, port, bytes, packets) |
| **Cloud DNS Logs** | DNS query and response logs from Cloud DNS-managed zones |
| **Cloud Armor Logs** | WAF request evaluation logs including rule matches and action decisions |

Additional sources (GKE, Cloud Run, Cloud Functions, Firebase, BigQuery) are collected automatically when their logs are included in the log sink filter.

---

## Architecture

```
GCP Cloud Logging
      |
      v
 Log Sink (filter expression)
      |
      v
 Pub/Sub Topic
      |
      v
 Pub/Sub Subscription  <---  com.hivearmor.gcp  (this plugin)
                                     |
                                     v
                              HiveArmor Event Processor
                                     |
                                     v
                         OpenSearch (_v3_hive_google-YYYY.MM.DD)
```

The plugin subscribes to a Pub/Sub subscription using the GCP Go SDK. Each received message is acknowledged immediately after being enqueued to HiveArmor's internal log channel. On startup the plugin streams its configuration from the HiveArmor backend over gRPC and reacts to live configuration updates without restarting the process.

---

## Prerequisites

### GCP Side

1. A GCP project with Cloud Logging API and Pub/Sub API enabled.
2. A Pub/Sub topic that will receive exported logs.
3. A Pub/Sub subscription attached to that topic (pull delivery).
4. A Cloud Logging sink that routes the desired log entries to the topic.
5. A service account (or Workload Identity / ADC environment) with the following IAM roles:

   | Role | Purpose |
   |---|---|
   | `roles/pubsub.subscriber` | Pull messages from the subscription |
   | `roles/pubsub.viewer` | Inspect subscription metadata |

### HiveArmor Side

- HiveArmor v11.x or later with the Event Processor running.
- The GCP plugin binary deployed and registered as `com.hivearmor.gcp.plugin` on the Event Processor host.
- `INTERNAL_KEY` environment variable set consistently across backend, agent-manager, and event-processor.

---

## GCP Setup

### 1. Create a Pub/Sub topic and subscription

```bash
gcloud pubsub topics create hivearmor-logs --project=YOUR_PROJECT_ID

gcloud pubsub subscriptions create hivearmor-logs-sub \
  --topic=hivearmor-logs \
  --ack-deadline=60 \
  --project=YOUR_PROJECT_ID
```

### 2. Create a Cloud Logging sink

```bash
gcloud logging sinks create hivearmor-sink \
  pubsub.googleapis.com/projects/YOUR_PROJECT_ID/topics/hivearmor-logs \
  --log-filter='severity >= WARNING' \
  --project=YOUR_PROJECT_ID
```

Grant the sink's service account permission to publish to the topic:

```bash
SINK_SA=$(gcloud logging sinks describe hivearmor-sink \
  --project=YOUR_PROJECT_ID \
  --format='value(writerIdentity)')

gcloud pubsub topics add-iam-policy-binding hivearmor-logs \
  --member="$SINK_SA" \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID
```

### 3. Create a service account for the plugin

```bash
gcloud iam service-accounts create hivearmor-gcp-plugin \
  --display-name="HiveArmor GCP Plugin" \
  --project=YOUR_PROJECT_ID

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:hivearmor-gcp-plugin@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/pubsub.subscriber

gcloud iam service-accounts keys create credentials.json \
  --iam-account=hivearmor-gcp-plugin@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --project=YOUR_PROJECT_ID
```

Store the contents of `credentials.json` for use in the HiveArmor configuration.

---

## Authentication

The plugin supports two authentication methods for the GCP Pub/Sub client.

### Service Account JSON Key (recommended for production)

Supply the full contents of a GCP service account key file in the `jsonKey` configuration field. The plugin passes the key material directly to the GCP Go SDK (`option.WithCredentialsJSON`), so no file system access or environment variables are required on the plugin host.

### Application Default Credentials (ADC)

When no JSON key is configured, the GCP Go SDK falls back to Application Default Credentials. ADC resolves credentials in the following order:

1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to a key file.
2. User credentials from `gcloud auth application-default login`.
3. The attached service account on GCE/GKE/Cloud Run instances (Metadata Server).

ADC is suitable for deployments where the plugin runs inside a GCP-managed environment (GKE Pod with Workload Identity, Compute Engine instance with an attached service account).

---

## Configuration

Configuration is delivered to the plugin at runtime by the HiveArmor backend via a bidirectional gRPC stream. No local config file is needed on the plugin host. Settings are managed through the HiveArmor UI under **Settings > Integrations > Google Cloud Platform**.

### Module Group Fields

Each integration is a named module group. Multiple groups can run concurrently.

| Field | Key | Required | Description |
|---|---|---|---|
| Group Name | `groupName` | Yes | Display label for this integration (e.g., `prod-us-central1`) |
| GCP Project ID | `projectId` | Yes | The GCP project ID that owns the Pub/Sub subscription |
| Service Account JSON Key | `jsonKey` | No | Full JSON contents of the service account key file. Leave blank to use ADC |
| Pub/Sub Subscription Name | `subscription` | Yes | Name of the Pub/Sub subscription (not the full resource path, just the subscription ID) |

### Log Filter Expression

Log filtering is applied at the Cloud Logging sink level using GCP's [Logging query language](https://cloud.google.com/logging/docs/view/logging-query-language), not inside the plugin. Define your filter expression when creating or updating the sink. Example filters:

```text
# All audit logs
logName=~"cloudaudit.googleapis.com"

# VPC flow logs only
logName=~"compute.googleapis.com%2Fvpc_flows"

# Severity WARNING and above from all sources
severity >= WARNING

# Cloud Armor WAF logs
resource.type="http_load_balancer" AND jsonPayload.enforcedSecurityPolicy.outcome="DENY"

# Combined: audit logs and VPC flow logs
logName=~"cloudaudit.googleapis.com" OR logName=~"compute.googleapis.com%2Fvpc_flows"
```

---

## Build

```bash
cd plugins/gcp
go build -o com.hivearmor.gcp.plugin .
```

The output binary must be named exactly `com.hivearmor.gcp.plugin`. The Event Processor loads plugins by this name at startup.

Place the binary in the Event Processor's plugin directory alongside the other plugin binaries.

---

## Log Schema

Each log message pulled from Pub/Sub is forwarded to the Event Processor with the following metadata:

| Field | Value |
|---|---|
| `dataType` | `google` |
| `dataSource` | The module group name configured in HiveArmor |
| `timestamp` | UTC timestamp at time of receipt (RFC3339Nano) |
| `raw` | Full Pub/Sub message payload (JSON-encoded Cloud Logging LogEntry) |

The Event Processor applies YAML-based parser filters and correlation rules to normalize and enrich the raw payload before indexing to OpenSearch under the `_v3_hive_google-YYYY.MM.DD` index pattern.

---

## Operational Notes

### Connection Resilience

The plugin validates outbound connectivity to `https://cloud.google.com/iam` before processing configuration changes. If the check fails, the plugin retries indefinitely and logs a structured error via the HiveArmor catcher SDK.

Pub/Sub client creation uses an exponential back-off retry (up to 3 attempts, starting at 2 seconds). If all retries fail, the affected group is skipped and a structured error is logged; other groups continue operating.

If the Pub/Sub `Receive` call returns an error (e.g., transient network failure), the plugin sleeps 5 seconds and resumes — the subscription cursor is preserved by GCP, so no messages are lost.

### Live Reconfiguration

Changes made in the HiveArmor UI take effect within seconds. The plugin compares incoming configuration against active groups and only restarts goroutines where credentials, project ID, or subscription name have changed. Groups not affected by a configuration push continue without interruption.

### Scaling

The plugin spawns `2 * NumCPU` goroutines for log forwarding and notification delivery. For very high log volumes, run the plugin on a host with sufficient CPU cores and ensure the Pub/Sub subscription's message retention and ack deadline settings match expected throughput.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| No logs appearing in HiveArmor | Log sink not exporting to Pub/Sub | Verify the sink filter and that the sink's service account has `pubsub.publisher` on the topic |
| `failed to create client` errors in plugin logs | Invalid or expired service account JSON key | Rotate the service account key and update the `jsonKey` field in HiveArmor |
| `connection failed` on startup | Plugin host cannot reach `cloud.google.com` | Check firewall/egress rules; GCP APIs require outbound HTTPS on port 443 |
| Plugin not receiving config | `internalKey` or `modulesConfigHost` misconfigured | Verify `INTERNAL_KEY` is consistent across all HiveArmor services |
| Messages accumulating in Pub/Sub but not in HiveArmor | Ack deadline too short or plugin throughput insufficient | Increase the Pub/Sub subscription ack deadline; add more plugin instances if needed |
| `Stream closed by server, reconnecting` | Normal behavior after backend restart or config push | Informational only; the plugin reconnects automatically |

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- Support: [support@hivearmor.io](mailto:support@hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)

**Version compatibility:** HiveArmor v11.x LTS (supported until November 2030)
