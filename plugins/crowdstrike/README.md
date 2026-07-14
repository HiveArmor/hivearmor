# HiveArmor Plugin — CrowdStrike Falcon

## Overview

The HiveArmor CrowdStrike Falcon plugin is a Go-based connector that ingests real-time security events from **CrowdStrike Falcon Event Streams** and forwards them to the HiveArmor Event Processor for correlation, enrichment, and indexing.

Plugin binary name: `com.hivearmor.crowdstrike.plugin`

Go module path: `github.com/hivearmor/plugins/crowdstrike`

## How It Works

The plugin opens a persistent gRPC connection over a Unix socket to the HiveArmor Event Processor running on the same host. It uses the **CrowdStrike GoFalcon SDK** to authenticate against the Falcon API via OAuth2, perform stream discovery, and subscribe to one or more Falcon Event Streams. Incoming events are batched, serialized as structured JSON, and forwarded to the Event Processor for YAML-rule correlation and indexing into OpenSearch (`_v3_hive_crowdstrike-YYYY.MM.DD`).

```
CrowdStrike Falcon API
    |
    |  OAuth2 token exchange
    v
Falcon Event Streams  ──(GoFalcon SDK)──>  com.hivearmor.crowdstrike.plugin
                                                |
                                          gRPC / Unix socket
                                                |
                                          HiveArmor Event Processor
                                                |
                                          OpenSearch  ──>  HiveArmor UI
```

## Features

- **Real-time event streaming** — persistent SSE connection to Falcon Event Streams with automatic reconnect
- **Stream discovery** — dynamically enumerates all available streams on startup; no manual stream IDs required
- **OAuth2 authentication** — client credentials flow; tokens are refreshed automatically before expiry
- **Event batching** — events are accumulated and flushed in configurable batches to reduce gRPC round trips
- **Timeout controls** — per-batch flush timeouts prevent pipeline stalls on low-volume streams
- **MSSP support** — optional `member_cid` parameter for multi-tenant Falcon environments
- **Multi-region** — supports all Falcon cloud regions (`us-1`, `us-2`, `eu-1`, `us-gov-1`)
- **Structured JSON output** — every event is emitted as normalized JSON compatible with HiveArmor's ingestion schema

## Prerequisites

- HiveArmor Event Processor running on the same host (provides the Unix socket)
- CrowdStrike Falcon subscription with Event Streams API access
- API client credentials with the **Event Streams** scope enabled

## Configuration

Plugin configuration is managed through the HiveArmor module configuration interface. The following parameters are required:

| Parameter | Required | Description |
|---|---|---|
| `client_id` | Yes | OAuth2 Client ID issued by the CrowdStrike Falcon console |
| `client_secret` | Yes | OAuth2 Client Secret issued by the CrowdStrike Falcon console |
| `member_cid` | No | Member CID for MSSP/Flight Control environments; leave blank for single-tenant deployments |
| `cloud` | Yes | Falcon cloud region: `us-1`, `us-2`, `eu-1`, or `us-gov-1` |

### Creating API Credentials

1. Log in to the CrowdStrike Falcon console at https://falcon.crowdstrike.com
2. Navigate to **Support and resources > API clients and keys**
3. Create a new API client
4. Under **API Scopes**, enable **Event streams — Read**
5. Copy the **Client ID** and **Client Secret** — the secret is shown only once
6. Enter both values into the HiveArmor module configuration for this plugin

For full CrowdStrike API documentation: https://falcon.crowdstrike.com/support/api-clients-and-keys

## Event Types

The plugin streams all event types surfaced by the Falcon Event Streams API, including but not limited to:

- Detection summary events
- Incident summary events
- Authentication events
- User activity audit events
- Firewall match events
- Discover service events
- Identity protection events

All events are tagged with source `crowdstrike` and routed through the HiveArmor correlation engine before indexing.

## Build

The plugin is built as part of the HiveArmor Event Processor container image. To build standalone:

```bash
cd plugins/crowdstrike
go build -o com.hivearmor.crowdstrike.plugin .
```

The `REPLACE_KEY` ldflag is injected by CI for production builds:

```bash
go build -ldflags "-X main.agentKey=${AGENT_SECRET_PREFIX}" \
  -o com.hivearmor.crowdstrike.plugin .
```

## Deployment

The plugin binary is placed in the Event Processor's plugin directory. The Event Processor loads all plugins matching the naming pattern `com.hivearmor.*.plugin` at startup. No manual registration is required.

Plugin configuration is applied through the HiveArmor UI under **Settings > Integrations > CrowdStrike** or via the REST API:

```
POST /api/ha-integrations/crowdstrike
Authorization: Bearer <token>
```

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Plugin fails to start | Invalid or expired API credentials | Regenerate credentials in the Falcon console and update the module configuration |
| No events received | Incorrect `cloud` region | Verify the region matches your Falcon tenant |
| MSSP stream missing | `member_cid` not set | Supply the target member CID in configuration |
| gRPC connection refused | Event Processor not running | Ensure the HiveArmor Event Processor service is healthy before starting the plugin |
| Token refresh failures | Network restrictions | Confirm the host can reach `api.crowdstrike.com` (or the appropriate regional endpoint) on port 443 |

Logs are written to the standard Event Processor log stream and are visible in the HiveArmor UI under **System > Services**.

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor