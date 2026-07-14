# HiveArmor Plugin for Microsoft Azure

## Overview

The HiveArmor Azure Plugin is a connector written in Go that retrieves logs from Azure Monitor's Log Analytics workspace and forwards them to the HiveArmor event processing pipeline for correlation, enrichment, and threat detection.

This plugin is part of the HiveArmor Hyper-scale Incident Visibility Engine and integrates natively with the platform's plugin framework. It is identified by the binary name `com.hivearmor.azure.plugin`.

## How It Works

The plugin operates as a long-running service that periodically queries an Azure Log Analytics workspace and streams the resulting log records into HiveArmor's correlation engine.

**Transport:** The plugin communicates with the HiveArmor Event Processor via a gRPC client over a Unix socket located in the HiveArmor working directory. This keeps inter-process communication fast and local, with no external network dependency between the plugin and the core engine.

**Azure SDK:** Log retrieval is handled by the official Azure Go SDK:

- `azidentity` — authenticates to Azure using a service principal (Client ID + Client Secret + Tenant ID)
- `azquery` — issues Kusto (KQL) queries against the target Log Analytics workspace and paginates through results

Collected log data is normalized and forwarded to the Event Processor, where it passes through the standard HiveArmor pipeline: parsing (YAML filters), enrichment (geolocation, threat feeds), and correlation (YAML rules with CEL expressions and time-window logic) before being indexed to OpenSearch under the `_v3_hive_azure-YYYY.MM.DD` index pattern.

## Requirements

### Azure Service Principal Credentials

Before configuring the plugin, create an Azure Active Directory service principal with read access to the target Log Analytics workspace. The following values are required:

| Credential | Description |
|---|---|
| **Tenant ID** | The Azure Active Directory tenant (directory) ID |
| **Client ID** | The application (client) ID of the registered service principal |
| **Client Secret** | A valid client secret for the service principal |
| **Workspace ID** | The Log Analytics workspace ID to query |

The service principal must be assigned at minimum the **Log Analytics Reader** role on the target workspace. Without a valid Azure subscription and appropriate RBAC assignment, the plugin will not be able to retrieve logs.

## Configuration

Plugin configuration is managed through the HiveArmor management interface or via the configuration plugin (`com.hivearmor.config.plugin`). Credentials are stored encrypted and are never written to disk in plaintext.

Environment-level configuration (for container or bare-metal deployments) can be supplied via the HiveArmor instance configuration managed by the CM server (`cm.onlyhacker.org` for production, `cmdev.onlyhacker.org` for development).

## Plugin Identity

| Property | Value |
|---|---|
| Binary name | `com.hivearmor.azure.plugin` |
| Language | Go |
| Transport | gRPC over Unix socket |
| Go module path | `github.com/hivearmor/plugins/azure` |
| Docker image | `hivearmor/azure-plugin` (local), `ghcr.io/hivearmor/azure-plugin` (CI/prod) |

## Supported HiveArmor Versions

| Plugin Version | HiveArmor Version | Support Status |
|---|---|---|
| Current | v11.x LTS | Supported until Nov 2030 |
| Previous | v10.x | Supported until Jul 2026 |

## Supported Platforms

The plugin runs as part of the HiveArmor server stack and is supported on:

- Ubuntu 22.04 / 24.04
- Debian 12
- RHEL / Rocky Linux / AlmaLinux 8 and 9

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor