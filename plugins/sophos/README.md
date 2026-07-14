# HiveArmor Plugin for Sophos Central

## Overview

The HiveArmor Sophos Central plugin is a connector developed in Go that synchronizes and processes logs from Sophos Central and forwards them to the HiveArmor event processing engine for correlation, enrichment, and alerting.

This plugin is part of the HiveArmor correlation engine plugin suite and runs as a managed binary under the event processor. It communicates with the HiveArmor processing engine via a gRPC client over a Unix socket located in the HiveArmor working directory.

**Plugin binary name:** `com.hivearmor.sophos.plugin`

**Go module path:** `github.com/hivearmor/plugins/sophos`

---

## How It Works

1. The plugin authenticates with the Sophos Central API using a `ClientID` and `ClientSecret` credential pair.
2. It queries the Sophos Central SIEM service to retrieve security events and alerts.
3. The `DataRegion` parameter determines the regional API endpoint from which logs are fetched.
4. Collected log events are forwarded to the HiveArmor event processor over a gRPC Unix socket for parsing, correlation, and indexing into OpenSearch.

---

## Requirements

### Sophos Central Account

A valid Sophos Central account with SIEM API access is required. The plugin will not function without proper credentials.

### Credentials

| Parameter | Description |
|---|---|
| `ClientID` | OAuth2 client ID issued by Sophos Central |
| `ClientSecret` | OAuth2 client secret issued by Sophos Central |
| `DataRegion` | Sophos Central data region code (e.g., `us01`, `eu01`) that determines the API endpoint |

### Obtaining Credentials

1. Log in to your Sophos Central account.
2. Navigate to **Global Settings > API Credentials Management**.
3. Create a new API credential set with SIEM access.
4. Record the `ClientID` and `ClientSecret` values.
5. Note your data region from your account dashboard or from the Sophos Central documentation for your tenancy.

---

## Architecture

```
Sophos Central API (SIEM service)
        |
        | HTTPS (ClientID / ClientSecret auth, DataRegion endpoint)
        |
com.hivearmor.sophos.plugin  (Go binary)
        |
        | gRPC over Unix socket
        |
HiveArmor Event Processor
        |
        | parse → enrich → correlate → index
        |
OpenSearch (_v3_hive_sophos-YYYY.MM.DD)
```

The plugin connects to the event processor through a Unix socket located in the HiveArmor working directory. No network port is required for internal communication.

---

## Plugin Configuration

Configuration is managed by the HiveArmor backend and injected at runtime. The following parameters are required:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ClientID` | string | Yes | Sophos Central API client ID |
| `ClientSecret` | string | Yes | Sophos Central API client secret |
| `DataRegion` | string | Yes | Sophos Central regional endpoint identifier |

---

## Deployment

This plugin is automatically managed by the HiveArmor event processor. Manual deployment steps:

1. Ensure the compiled binary is named exactly `com.hivearmor.sophos.plugin` — the event processor loads plugins by this exact binary name.
2. Place the binary in the configured HiveArmor plugins directory.
3. The event processor will start and supervise the plugin process on startup.
4. Credentials are supplied via the HiveArmor backend configuration interface, not via environment variables or local files.

### Build

```bash
cd plugins/sophos
go build -o com.hivearmor.sophos.plugin .
```

If building as part of the full plugin suite, use the top-level build script which injects required ldflags.

---

## Log Coverage

This plugin ingests the following Sophos Central SIEM event categories:

- Endpoint threat and malware detections
- Firewall and network events
- Email security events
- Policy and configuration violations
- Admin audit events

All events are indexed under the OpenSearch pattern `_v3_hive_sophos-YYYY.MM.DD`.

---

## Compatibility

| HiveArmor Version | Sophos Central API |
|---|---|
| v11.x LTS | v1 SIEM API |

Supported platforms for the event processor host: Ubuntu 22.04/24.04, Debian 12, RHEL/Rocky/AlmaLinux 8/9.

---

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor

---

HiveArmor — Hyper-scale Incident Visibility Engine