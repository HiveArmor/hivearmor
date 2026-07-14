# HiveArmor Plugin for Microsoft Office 365 (O365)

## Overview

The HiveArmor O365 Plugin is a Go-based connector that ingests audit and compliance logs from Microsoft Office 365 and streams them into the HiveArmor correlation pipeline for real-time threat detection and incident response.

The plugin authenticates to the Office 365 Management Activity API using OAuth2, manages event subscriptions for each configured log type, and forwards all collected content to the HiveArmor Event Processor via a gRPC Unix socket. Collected events are correlated against HiveArmor YAML rules, enriched with geolocation and threat-feed data, and indexed to OpenSearch under the `_v3_hive_o365-YYYY.MM.DD` index pattern.

Plugin binary name: `com.hivearmor.o365.plugin`

---

## Architecture

```
Office 365 Management API (OAuth2)
         |
    Subscription Management
    (start / list / stop per content type)
         |
    Content Enumeration + Fetch
         |
    gRPC Unix Socket  ────────►  HiveArmor Event Processor
                                       |
                                  Correlation Engine
                                  (YAML rules + CEL filters)
                                       |
                                  OpenSearch  (_v3_hive_o365-YYYY.MM.DD)
                                       |
                                  HiveArmor UI  (localhost:3000 / prod UI)
```

---

## Supported Log Types

| Content Type | Description |
|---|---|
| `Audit.AzureActiveDirectory` | Azure AD sign-in events, directory changes, role assignments, MFA activity |
| `Audit.Exchange` | Exchange Online mailbox and admin audit events |
| `Audit.General` | General O365 workload audit events not covered by other types |
| `DLP.All` | Data Loss Prevention policy matches and overrides across all workloads |
| `Audit.SharePoint` | SharePoint Online and OneDrive file access, sharing, and admin events |

All five content types are subscribed and polled independently. Each type maps to its own set of HiveArmor detection rules in the Event Processor.

---

## Prerequisites

- A valid Microsoft Office 365 tenant with an active subscription.
- An Azure AD application registration with the following API permissions granted:
  - `ActivityFeed.Read` (Office 365 Management APIs)
  - `ActivityFeed.ReadDlp` (required for `DLP.All`)
  - `ServiceHealth.Read` (optional, for health monitoring)
- Admin consent granted for the application in the Azure portal.
- HiveArmor v11.x or later with the Event Processor running and the gRPC Unix socket available.

---

## Configuration

The plugin is configured through the HiveArmor backend. Navigate to **Settings > Integrations > Microsoft Office 365** in the HiveArmor UI and supply the following values:

| Field | Description |
|---|---|
| **Tenant ID** | Azure AD tenant (directory) ID |
| **Client ID** | Application (client) ID from the Azure AD app registration |
| **Client Secret** | Client secret generated under the app registration Certificates and Secrets blade |
| **Publisher Identifier** | Your tenant ID (also used as the publisher GUID for subscription management) |

Credentials are stored encrypted in PostgreSQL and are never written to disk or exposed through the API in plaintext.

Once saved, the plugin performs an initial subscription check: any content type not yet subscribed is automatically activated via `POST /subscriptions/start`. Existing subscriptions are verified and resumed as needed.

---

## How It Works

### Authentication

The plugin uses the OAuth2 client credentials flow to obtain an access token from Microsoft identity platform:

```
POST https://login.microsoftonline.com/{tenant_id}/oauth2/token
  grant_type=client_credentials
  client_id={client_id}
  client_secret={client_secret}
  resource=https://manage.office.com
```

Tokens are cached in memory and refreshed before expiry. No user interaction is required after initial configuration.

### Subscription Management

On startup and at each polling interval, the plugin calls the Office 365 Management Activity API to:

1. List active subscriptions (`GET /subscriptions/list`).
2. Start any missing subscriptions (`POST /subscriptions/start?contentType=<type>`).
3. Enumerate available content blobs for each active subscription (`GET /subscriptions/content`).

Subscriptions are tenant-scoped. If a subscription is found in a disabled state, the plugin restarts it automatically and logs the event to the HiveArmor audit trail.

### Log Collection

For each content blob URI returned by the subscriptions/content endpoint, the plugin fetches the full event payload and deserializes the JSON array. Each event is individually wrapped in a HiveArmor log envelope and sent downstream.

Blob URIs are tracked to prevent duplicate ingestion across restarts. Tracking state is held in memory; a full restart will re-fetch blobs within the current rolling 24-hour window (the maximum lookback supported by the Office 365 Management API).

### gRPC Transport

The plugin communicates with the HiveArmor Event Processor exclusively through a **gRPC Unix socket** located in the HiveArmor working directory. No TCP port is opened by this plugin. The Unix socket path is resolved at runtime from the HiveArmor plugin host environment and is not user-configurable.

---

## Collected Event Fields

Each forwarded event preserves the original Office 365 Management API fields. Key fields used by HiveArmor correlation rules include:

| Field | Description |
|---|---|
| `CreationTime` | UTC timestamp of the event |
| `UserId` | UPN of the user who performed the operation |
| `Operation` | The specific action that was audited |
| `ResultStatus` | Success, Failure, or PartiallySucceeded |
| `ClientIP` | IP address of the client (enriched with geolocation by Event Processor) |
| `Workload` | The O365 service that generated the event |
| `ObjectId` | Resource (file, mailbox, user) affected by the operation |
| `RecordType` | Numeric record type as defined by the O365 schema |

---

## Detection Coverage

HiveArmor ships built-in correlation rules for O365 events covering:

- Brute-force and password spray attacks against Azure AD
- Impossible travel and anomalous sign-in location changes
- Mailbox delegation and forwarding rule creation
- Bulk file download and exfiltration from SharePoint / OneDrive
- DLP policy violation spikes
- Privileged role assignment and admin account changes
- OAuth application consent grants to new or unrecognized apps

Rules are maintained as YAML files in the Event Processor `rules/` directory and can be extended or overridden without modifying the plugin binary.

---

## OpenSearch Index

Collected O365 events are stored under the locked HiveArmor index pattern:

```
_v3_hive_o365-YYYY.MM.DD
```

Do not change this pattern. All cross-service queries, dashboards, and retention policies are bound to it. Index rollover happens daily at UTC midnight.

---

## Building

The plugin is part of the HiveArmor mono-repo. Build it from the repo root:

```bash
cd plugins/o365
go build -o com.hivearmor.o365.plugin .
```

The output binary must be named exactly `com.hivearmor.o365.plugin`. The Event Processor resolves plugin binaries by this name at startup; a mismatch will prevent the plugin from loading.

For production builds, inject the shared secret via ldflags as required by the HiveArmor build system:

```bash
go build -ldflags "-X main.replaceKey=${AGENT_SECRET_PREFIX}" \
  -o com.hivearmor.o365.plugin .
```

Go module path: `github.com/hivearmor/plugins/o365`

---

## Local Development

Start the full stack:

```bash
cd local-dev
docker compose up -d
```

The HiveArmor UI is available at `http://localhost:3000` and the backend API at `http://localhost:8088`. Use credentials `admin / localdev123!`.

To test the plugin locally without a live O365 tenant, supply a mock token endpoint and a static content fixture by setting the `O365_MOCK=true` environment variable before launching the plugin binary. Mock mode replays a set of sample audit events from `testdata/` and sends them through the gRPC socket to the local Event Processor.

---

## Troubleshooting

**Plugin does not start or fails to register subscriptions**
- Verify that the Azure AD application has `ActivityFeed.Read` permission with admin consent.
- Confirm the Tenant ID and Client ID match the values in the Azure portal.
- Check that the client secret has not expired (Azure AD secrets have a maximum 24-month lifetime).

**No events appearing in HiveArmor after configuration**
- The Office 365 Management API has a propagation delay of up to 12 hours after a new subscription is started before content becomes available.
- Confirm the subscription status in the HiveArmor integration settings; the plugin displays the current subscription state for each content type.

**gRPC connection refused**
- Verify the HiveArmor Event Processor is running and the Unix socket file exists in the working directory.
- Confirm the plugin binary is being run by the same OS user as the Event Processor, or that socket permissions allow cross-user access.

**DLP.All subscription fails with 403**
- The Azure AD application must have the `ActivityFeed.ReadDlp` permission in addition to `ActivityFeed.Read`. Grant the permission and re-consent in the Azure portal.

---

## Support and Resources

| Resource | Link |
|---|---|
| Documentation | https://docs.hivearmor.io |
| GitHub | https://github.com/hivearmor |
| Support | support@hivearmor.io |
| Community (free tier) | https://github.com/hivearmor/discussions |

HiveArmor v11.x is supported under LTS through November 2030.

---

## License

This plugin is part of HiveArmor and is distributed under the same license terms as the parent project. See `LICENSE` at the repository root for full terms. Community (free) and enterprise license tiers are available; contact support@hivearmor.io for enterprise licensing.