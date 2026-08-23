# Integration and notification operations research

Retrieved: **2026-08-22**

Scope: enterprise connector discovery, setup, credentials, health, delivery routing and service access. This note preserves the official-source conclusions needed by an offline continuation model; it does not copy vendor UI or claim HiveArmor implements the cited capabilities.

## Official sources and durable conclusions

### Microsoft Sentinel content and connector operations

- Source: [Microsoft Sentinel out-of-the-box content overview](https://learn.microsoft.com/en-us/azure/sentinel/sentinel-solutions)
- Source: [Discover and manage Sentinel content](https://learn.microsoft.com/en-us/azure/sentinel/sentinel-solutions-deploy)
- Source: [Monitor data connector health](https://learn.microsoft.com/en-us/azure/sentinel/monitor-data-connector-health)
- Conclusion: Sentinel separates catalog discovery and solution installation from configuring a data connector. Content exposes provider/support ownership, version/update state and bundled capabilities. Connector operations then expose connectivity and ingestion health through a dedicated health dataset/workbook rather than treating “configured” as “healthy.”
- HiveArmor implication: keep catalog metadata, configured connection instances and runtime health as separate models. Show support owner, version/update state, required permissions, last event/receipt and health provenance. Activation follows validation and observed data; a stored record is not a successful connection.

### Elastic integrations and Fleet

- Source: [Manage Elastic Agent integrations](https://www.elastic.co/docs/reference/fleet/manage-integrations)
- Source: [Add an integration to an Elastic Agent policy](https://www.elastic.co/docs/reference/fleet/add-integration-to-policy)
- Source: [Elastic Agent policies](https://www.elastic.co/docs/reference/fleet/agent-policy)
- Conclusion: Elastic separates installable integration packages, reusable integration policies, agent policies and enrolled agents. Configuration is applied through policy, compatibility is checked, orphaned integration policies are visible and changes have an explicit distribution lifecycle.
- HiveArmor implication: make connection configuration reusable across authorized scopes, disclose compatibility and rollout state, identify orphaned/unowned connections and distinguish configured policy from runtime receipt. Versioned policy and rollback history are backend requirements, not browser-local state.

### Splunk data onboarding

- Source: [How do you want to add data?](https://help.splunk.com/en/splunk-enterprise/get-data-in/get-started-with-getting-data-in/10.2/how-to-get-data-into-your-splunk-deployment/how-do-you-want-to-add-data)
- Source: [Monitor data](https://help.splunk.com/en/splunk-enterprise/get-started/get-data-in/10.2/how-to-get-data-into-your-splunk-deployment/monitor-data)
- Conclusion: Splunk chooses an onboarding path by source/transport—monitor, forward or guided data onboarding—and makes application context and permissions part of setup. Its workflow links source-specific configuration to operational diagnostics rather than using one undifferentiated connection form.
- HiveArmor implication: the setup wizard selects capability and transport first, then renders type-specific connection, scope, parsing and validation steps. Do not reuse an inbound data-source form for outbound response or notification destinations.

### ServiceNow IntegrationHub credentials and aliases

- Source: [Credentials, connections and aliases](https://www.servicenow.com/docs/r/xanadu/platform-security/connections-and-credentials/credentials-connections-alias.html)
- Source: [Create connection attributes](https://www.servicenow.com/docs/r/platform-security/connections-and-credentials/create-connection-attributes.html)
- Source: [Using the Connections dashboard](https://www.servicenow.com/docs/r/pt-BR/integrate-applications/integration-hub/connections-dashboard.html)
- Conclusion: ServiceNow explicitly separates connection endpoints, credential material and reusable aliases. Aliases decouple workflow metadata from environment-specific credentials, can resolve multiple connections and are managed through role-protected configuration templates with test actions.
- HiveArmor implication: store only credential references on connectors, destinations and playbooks. Secrets are write-only and rotated centrally. A production/staging alias can change without editing every workflow. Setup and tests must be admin-governed and auditable.

## Resulting HiveArmor information architecture

Use one operations workbench with five distinct views:

1. Operations: trust chain, measured attention and reliability summary.
2. Connections: inbound, outbound and bidirectional configured instances with environment, owner, support, credential alias, health and last successful operation.
3. Delivery: reusable destinations plus ordered routing, suppression/throttle, escalation and authoritative delivery receipts.
4. Service access: one-time, hash-only API keys with narrow scopes, owner, expiry, last use, rotation/revocation and audit.
5. Activity: immutable configuration, health, credential and delivery receipts correlated by request/trace ID.

The guided lifecycle is `discover → configure → authorize → validate → activate → observe → rotate/upgrade/retire`. Validation is bounded and produces an authoritative receipt. Provider queue acknowledgement, simulated success or a saved entity is never labeled delivered/healthy.

## Security and reliability boundary

- Webhook targets require HTTPS, DNS/IP re-resolution, private/link-local/metadata denial, redirect limits, egress allowlists, payload/response limits, connection/read timeouts and request signing. The current raw `RestTemplate` dispatch does not meet this boundary.
- Configuration APIs return redacted DTOs, never persistence entities or `configJson`. Write-only secret input becomes an opaque secret/credential alias.
- Delivery needs idempotency/deduplication, rate controls, bounded retry with jitter, dead-letter state, replay preview, provider receipt and immutable audit.
- Health values include observed/generated time, measurement window, source, configured policy and partial dependency errors. Unknown is not healthy.
- API keys need a service identity/owner, tenant scope, narrow permissions, expiry, usage telemetry, rotation overlap, immediate revocation and anomaly/rate controls.

## Limitations and refresh trigger

The OEM documentation describes product workflow patterns, not HiveArmor API compatibility. Some ServiceNow documentation is release-specific and some Elastic features vary by subscription. Refresh this note when Sentinel connector/content management, Elastic Fleet integration-policy semantics, Splunk guided onboarding, ServiceNow credential aliases, or HiveArmor `INO-001`–`INO-010` materially change.
