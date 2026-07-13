# 08 — Integrations and Connectors

## Integration Architecture

Integrations fall into two categories:
1. **Agent-side**: Logs collected by the endpoint agent or cloud collector, forwarded via gRPC
2. **Filter-defined**: Log parsing rules that normalize the raw data in the event processor

Each integration has a corresponding:
- **Filter file** in `filters/<vendor>/` (Logstash-compatible YAML, stored in `utm_logstash_filter` DB table)
- **Correlation rule file(s)** in `rules/<vendor>/` (YAML rule definitions)
- **Frontend module** in `frontend/src/app/app-module/` (enable/disable UI, integration guide)
- **Module record** in `utm_module` DB table

---

## Integration Catalog

### Network / Firewall

| Integration | Collection Method | Filter Dir | Rules Dir |
|---|---|---|---|
| Cisco ASA | Syslog (agent) | `filters/cisco/` | `rules/cisco/` |
| Cisco Firepower | Syslog (agent) | `filters/cisco/` | `rules/cisco/` |
| Cisco Switch | Syslog (agent) | `filters/cisco/` | — |
| Cisco Meraki | Syslog (agent) | `filters/cisco/` | — |
| FortiGate | Syslog (agent) | `filters/fortinet/` | `rules/fortinet/` |
| Fortiweb | Syslog (agent) | `filters/fortinet/` | — |
| PaloAlto Networks | Syslog (agent) | `filters/paloalto/` | `rules/paloalto/` |
| pfSense | Syslog (agent) | `filters/pfsense/` | `rules/pfsense/` |
| SonicWall | Syslog (agent) | `filters/sonicwall/` | `rules/sonicwall/` |
| MikroTik | Syslog (agent) | `filters/mikrotik/` | `rules/mikrotik/` |
| Netflow (v5/v9/IPFIX) | Netflow UDP (agent) | `filters/netflow/` | `rules/netflow/` |
| Suricata / NIDS | Syslog (agent) | `filters/suricata/` | `rules/nids/` + `rules/suricata/` |

### Endpoints

| Integration | Collection Method | Filter Dir | Rules Dir |
|---|---|---|---|
| Windows Event Log | Platform events (agent) | `filters/windows/` | `rules/windows/` |
| Linux (syslog/auditd) | Syslog + auditd (agent) | `filters/linux/` | `rules/linux/` |
| macOS | Platform events (agent) | `filters/macos/` | `rules/macos/` |
| IBM AIX | Syslog (agent) | `filters/ibm/` | `rules/ibm/` |
| IBM AS/400 | Dedicated collector binary | `filters/ibm/` | `rules/ibm/` |

### Cloud & SaaS

| Integration | Collection Method | Filter Dir | Rules Dir | Plugin |
|---|---|---|---|---|
| AWS CloudTrail | Cloud collector API | `filters/aws/` | `rules/cloud/` | `com.utmstack.aws` |
| AWS CloudWatch | Cloud collector API | `filters/aws/` | — | `com.utmstack.aws` |
| Microsoft Azure | Cloud collector API | `filters/azure/` | `rules/cloud/` | `com.utmstack.azure` |
| Azure AD | Cloud collector API | `filters/azure/` | — | `com.utmstack.azure` |
| GCP Cloud Logging | Cloud collector API | `filters/google/` | `rules/cloud/` | `com.utmstack.gcp` |
| Office 365 | Cloud collector API | `filters/office365/` | `rules/office365/` | `com.utmstack.o365` |
| GitHub Enterprise | Cloud collector API | `filters/github/` | `rules/github/` | — |

### Security Tools / EDR

| Integration | Collection Method | Filter Dir | Rules Dir | Plugin |
|---|---|---|---|---|
| Sophos XG / Central | Cloud collector API | `filters/sophos/` | `rules/sophos/` | `com.utmstack.sophos` |
| Bitdefender GravityZone | Cloud collector API | `filters/antivirus/` | `rules/antivirus/` | `com.utmstack.bitdefender` |
| CrowdStrike Falcon | Cloud collector API | `filters/crowdstrike/` | `rules/crowdstrike/` | `com.utmstack.crowdstrike` |
| Kaspersky | Syslog (agent) | `filters/antivirus/` | `rules/antivirus/` | — |
| SentinelOne | Syslog (agent) | `filters/antivirus/` | — | — |
| Deceptive Bytes | Syslog (agent) | `filters/antivirus/` | — | — |
| VMware ESXi | Syslog (agent) | `filters/vmware/` | `rules/vmware/` | — |

### Generic

| Integration | Collection Method | Filter Dir |
|---|---|---|
| Syslog (generic) | Syslog UDP/TCP (agent) | `filters/syslog/` |
| JSON (generic) | File/syslog (agent) | `filters/json/` |
| Generic logs | Various (agent) | `filters/generic/` |

---

## Removed Integrations (via Liquibase changelogs 2026-02)

These were removed from the module database in `20260218xxx` changesets:
- Redis, Nginx, PostgreSQL, Apache, MySQL, MongoDB, Elasticsearch, Logstash, Kibana, Kafka, NATS, Traefik, HaProxy, IIS, osquery, audit

---

## External Service Integrations

| Service | Direction | Purpose | Auth |
|---|---|---|---|
| **ThreatWinds API** | Outbound | Threat intelligence feed | API key (GitHub secrets: `THREATWINDS_API_KEY`, `THREATWINDS_API_SECRET`) |
| **Customer Manager (CM)** | Outbound | Version registration, update scheduling | Service account key pair |
| **SAML2 IdP** (Okta, Azure AD, etc.) | Inbound | SSO authentication | SP/IdP metadata exchange |
| **SMTP server** | Outbound | Email notifications, TFA codes, alerts | Configurable via `utm_configuration_parameter` |
| **GCS (Google Cloud Storage)** | Outbound (build-time) | Geolocation CSV download, AS400 JAR | Public bucket, no auth |
| **GHCR (GitHub Container Registry)** | Outbound | Docker image pull | `GITHUB_TOKEN` (CI), no auth for public images |
| **GCP KMS** | Outbound (CI) | Windows agent code signing | GCP service account |

---

## Agent Manager gRPC API (Agent-Facing)

The agent-manager is the main integration point for all endpoint agents and cloud collectors.

**Registration endpoint**: `RegisterAgent` / `RegisterCollector` — requires `connection-key` (Panel connection key validated against backend)

**Operational streams**:
- `AgentStream` — bidirectional: backend sends commands, agent sends results
- `CollectorStream` — bidirectional: backend pushes config, collector acknowledges
- `Ping` — heartbeat

**Panel (backend) endpoints** (internal-key auth):
- `ProcessCommand` — send command to specific agent
- `RegisterCollectorConfig` — push config to collector
- `ListAgents`, `ListCollectors`, `ListAgentCommands`

---

## Frontend Integration Configuration

Integration modules managed via `app-module/` in the frontend:
- Each integration has a guide component (`guide-*`) with installation steps
- Module enable/disable via `PUT /api/utm-modules/{id}`
- Module configuration via `utm_module_group_configuration` table
- Config UI uses dynamic form generation from `AppConfigParamsComponent`

---

## Integration Health Monitoring

- `UtmDataInputStatusResource` / `UtmDataInputStatusService` — tracks per-source ingestion health
- `utm_data_input_status` table records last event time per module/data type
- Frontend shows health status in data sources view
- Note: Scheduled sync of this status appears to be commented out in some scheduler configs — verify in production
