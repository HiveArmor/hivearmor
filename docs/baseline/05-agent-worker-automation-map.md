# 05 — Agent, Worker & Automation Map

## Endpoint Agent (`agent/`)

**Binary**: `utmstack_agent_service` (Go 1.25.5)
**Platforms**: Linux (amd64/arm64), Windows (amd64/arm64), macOS (arm64)
**Interface**: Cobra CLI with subcommands; runs as system service via `kardianos/service`

### Responsibilities
- Register with agent-manager at first run (receives UUID + key)
- Maintain persistent gRPC bidirectional stream to agent-manager
- Collect logs from configured sources
- Buffer logs locally in SQLite
- Forward collected logs via gRPC to event processor (inputs plugin)
- Receive and execute remote commands from SOC console
- Self-update via embedded updater service

### Inputs
- Syslog (UDP/TCP, configurable port)
- File tail (configurable path)
- Netflow (UDP)
- Linux auditd (via `elastic/go-libaudit/v2`)
- Platform-native events (Windows Event Log, macOS system logs, Linux journal)

### Outputs
- gRPC log stream → EventProcessor inputs plugin (via TLS, authenticated with `REPLACE_KEY`)
- gRPC stream → AgentManager (heartbeat, command results)
- SQLite local buffer (retry on failure)

### Failure Handling
- Local SQLite buffer absorbs network outages
- Reconnect logic with exponential backoff
- `utils.WaitForReconnect` pattern in gRPC streams

### Security Boundary
- `REPLACE_KEY` embedded at build time via ldflags (`-X config.REPLACE_KEY=<secret>`)
- TLS 1.3 minimum for all gRPC communication
- Agent key (UUID) stored locally and validated by agent-manager on each call
- Commands validated by agent-manager before forwarding

---

## Cloud/SaaS Collector (`utmstack-collector/`)

**Binary**: `utmstack_collector` (Go 1.25.5)
**Platform**: Linux only (deployed server-side)

### Responsibilities
- Register with agent-manager (receives collector ID + key)
- Pull logs from cloud APIs on schedule
- Buffer locally in SQLite
- Forward logs via gRPC to event processor

### Inputs (Cloud Sources)
- AWS (CloudTrail, CloudWatch via AWS SDK)
- Azure (Activity Logs, AD Logs via Azure SDK)
- GCP (Cloud Logging via GCP client)
- Office 365 (Audit logs via Management API)
- CrowdStrike Falcon (API polling)
- Sophos Central (API polling)
- Bitdefender GravityZone (API polling)
- GitHub Enterprise Audit (API polling)

### Security
- Same `REPLACE_KEY` ldflags pattern as agent
- Cloud API credentials passed via module configuration from agent-manager

---

## IBM AS/400 Collector (`as400/`)

**Binary**: `utmstack_as400_collector_service` (Go 1.25.5)
**Companion**: `utmstack_as400_updater_service`

### Responsibilities
- Dedicated IBM AS/400 (iSeries) log collection
- Register with agent-manager
- Collect system journal/audit logs from AS/400
- Forward via gRPC

---

## Agent Manager (`agent-manager/`)

**Binary**: `agent-manager` (Go 1.25.5)
**Port**: 9000 (gRPC, TLS 1.3), 9001 (secondary)

### Responsibilities
- Accept gRPC connections from agents and collectors
- Authenticate connections via 3-tier model:
  - **`connection-key`** for registration (new agent connecting for first time)
  - **`key/id/type`** for authenticated agent/collector operations
  - **`internal-key`** for backend-originated operations (panel)
- Maintain in-memory stream maps for active agent/collector connections
- Proxy commands from backend (panel) to specific agents
- Distribute configuration updates to collectors
- Track heartbeat (last seen) for all connectors
- Serve agent/collector binaries for self-update
- Maintain PostgreSQL registry of all agents/collectors

### gRPC Services
| Service | Auth Type | Routes |
|---|---|---|
| `AgentService` | key/id/type | `AgentStream`, `UpdateAgent`, `DeleteAgent`, `RegisterAgent` (conn-key) |
| `PanelService` | internal-key | `ProcessCommand`, `ListAgents`, `ListAgentCommands` |
| `CollectorService` | key/id/type | `CollectorStream`, `DeleteCollector`, `GetCollectorConfig`, `RegisterCollector` (conn-key) |
| `PanelCollectorService` | internal-key | `RegisterCollectorConfig`, `ListCollector` |
| `PingService` | key/id/type | `Ping` |
| `HealthService` | any | `Check` (gRPC health) |

---

## Event Processor (External Base + Plugin Host)

The event processor core is an external binary (`threatwinds/eventprocessor/base`). This repo provides only the 16 plugin binaries that extend it.

**Mode**: `manager` (orchestrates workers) or `worker` (processes logs)

### Plugin Map

| Plugin | Type | External Dep | Function |
|---|---|---|---|
| `com.utmstack.inputs` | Input | gRPC/HTTP server | Receives logs from agents; serves as log auth proxy |
| `com.utmstack.config` | Configuration | PostgreSQL | Polls DB every 30s for rule/filter/asset changes; writes YAML files to working dir |
| `com.utmstack.events` | Analysis | OpenSearch | Forwards processed events for indexing |
| `com.utmstack.alerts` | Correlation | OpenSearch | Deduplication, grouping, severity assignment, alert indexing |
| `com.utmstack.geolocation` | Parsing | MaxMind-style CSV | IP → country/city/ASN enrichment |
| `com.utmstack.feeds` | Intelligence | ThreatWinds API | Threat indicator ingestion and matching |
| `com.utmstack.soc-ai` | AI | SOC AI service | AI-powered alert analysis via internal HTTP |
| `com.utmstack.stats` | Notification | OpenSearch | Collects processing statistics, writes every 10 minutes |
| `com.utmstack.aws` | Parsing | — | AWS log field normalization |
| `com.utmstack.azure` | Parsing | — | Azure log field normalization |
| `com.utmstack.gcp` | Parsing | — | GCP log field normalization |
| `com.utmstack.o365` | Parsing | — | Office 365 log normalization |
| `com.utmstack.bitdefender` | Parsing | — | Bitdefender log normalization |
| `com.utmstack.crowdstrike` | Parsing | — | CrowdStrike log normalization |
| `com.utmstack.sophos` | Parsing | — | Sophos log normalization |
| `com.utmstack.modules-config` | Configuration | — | Module-specific configuration management |
| `com.utmstack.compliance-orchestrator` | Compliance | — | **NOT deployed** — exists in plugins/ but excluded from Dockerfile |

### Plugin SDK Pattern
All plugins use `github.com/threatwinds/go-sdk`. Each registers itself by type:
```go
plugins.InitAnalysisPlugin("com.utmstack.events", analyze)
plugins.InitCorrelationPlugin("com.utmstack.alerts", correlate)
plugins.InitParsingPlugin("com.utmstack.geolocation", parseLog)
plugins.InitNotificationPlugin("com.utmstack.stats", notify)
```

---

## Backend Scheduled Workers (`service/` layer)

| Worker | Schedule | Function |
|---|---|---|
| `AssetSynchronizationService` | Every 60s (init 120s) | Sync assets from OpenSearch to DB |
| `UtmLogstashPipelineService` | Every 20s (init 30s) | Sync pipeline configs to event processor |
| `UserService` | Daily 1 AM | Cleanup expired accounts and activation keys |
| `UtmNotificationService` | Every ~72 min | Check disk space and send notifications |
| `UtmAlertTagRuleService` | Every 30s (init 10s) | Evaluate auto-tagging rules on new alerts |
| `UtmDataTypesService` | Every 60s (init 10s) | Sync correlation data types from OpenSearch |
| `UtmAlertResponseRuleService` | Every 30s | Evaluate automated SOAR response rules |
| `UtmComplianceReportScheduleService` | Every 5s (init 30s) | Run pending compliance report schedules |
| `ElasticsearchService` | Every 60s (init 60s) | OpenSearch cluster health check and email alerts |

---

## User Auditor Service (`user-auditor/`)

**Language**: Java 11, Spring Boot 2.7
**Dependency**: PostgreSQL `userauditor` + OpenSearch

### Responsibilities
- Tracks user sessions (login, logout, idle)
- Records user activity events
- Writes audit records to PostgreSQL AND OpenSearch indices
- Exposes API for querying audit records

---

## Web-PDF Service (`web-pdf/`)

**Language**: Java 11, Spring Boot 2.7 + Selenium 4.5.0

### Responsibilities
- Accepts HTTP request with URL + credentials
- Opens headless Chrome via Selenium
- Navigates to compliance/dashboard report URL (authenticated)
- Captures full page as PDF
- Returns PDF bytes

### Inputs: URL, JWT token
### Outputs: PDF binary
### Risk: Headless browser = large attack surface; `shm_data` volume for Chrome shared memory

---

## Installer (`installer/`)

**Language**: Go 1.25.1
**Compiled with**: 4 ldflags (DEFAULT_BRANCH, INSTALLER_VERSION, REPLACE salt, PUBLIC_KEY)

### Responsibilities
- Provision all system dependencies (Docker, nginx, etc.) on Ubuntu 22.04
- Generate TLS certificates, encryption keys, INTERNAL_KEY, POSTGRES_PASSWORD
- Write `/root/utmstack.yml` with all generated secrets
- Create `docker-compose.yml` (or swarm stack) dynamically via `docker/compose.go`
- Pull all Docker images from GHCR
- Start the full stack
- Run as background update service post-install (`--run` flag)

### Update Flow
- Installer binary runs as a service after install
- Polls Customer Manager (CM) API for available version updates
- Pulls new images and applies rolling update to running stack
