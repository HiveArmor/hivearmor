# UTMStack Codebase Analysis

## Step 1 — Repository Mapping

```
UTMStack-11/
├── .github/                        # CI/CD workflows, PR templates, AI review prompts
│   ├── ISSUE_TEMPLATE/             # Bug report, feature request, docs templates (YAML)
│   ├── ai-prompts/                 # AI code review prompts (architecture, bugs, security)
│   ├── scripts/                    # Shell scripts for CI (ai-review, approver, go-deps)
│   └── workflows/                  # GitHub Actions (v10/v11 pipelines, PR checks, reusable)
│
├── agent/                          # Endpoint agent — Go 1.25.5
│   ├── agent/                      # gRPC client, registration, ping, log processing
│   ├── cmd/                        # Cobra CLI (install, run, uninstall, config commands)
│   ├── collector/                  # Log collectors (syslog, file, netflow, auditd, platform)
│   ├── config/                     # Platform-specific config (linux, windows, macos)
│   ├── conn/                       # Connection management
│   ├── database/                   # SQLite local database
│   ├── dependency/                 # OS dependency management (auditd, etc.)
│   └── updater/                    # Self-update mechanism
│
├── agent-manager/                  # Agent management server — Go 1.25.5
│   ├── agent/                      # gRPC server impl, agent CRUD
│   ├── database/                   # PostgreSQL via GORM, migrations
│   └── updates/                    # Agent update distribution
│
├── as400/                          # IBM AS/400 log collector — Go 1.25.5
│   ├── agent/                      # Registration & ping with server
│   ├── collector/                  # AS/400-specific log collection
│   ├── config/                     # Configuration & secrets (ldflags)
│   ├── conn/                       # gRPC connection
│   ├── database/                   # Local SQLite DB
│   ├── serv/                       # Main service loop
│   └── updater/                    # Self-update
│
├── backend/                        # REST API — Java 17, Spring Boot 3.1, JHipster 7.3
│   ├── src/main/java/com/park/utmstack/
│   │   ├── config/                 # Spring Security, DB, gRPC, web configs
│   │   ├── domain/                 # 30+ domain packages (incidents, compliance, alerts...)
│   │   ├── event_processor/        # gRPC client to event processor
│   │   ├── grpc/                   # gRPC service definitions
│   │   ├── repository/             # JPA repositories
│   │   ├── security/               # JWT, SAML2, API Key, InternalApiKey providers
│   │   ├── service/                # Business logic services
│   │   └── web/                    # REST controllers
│   ├── src/main/resources/config/  # application.yml, liquibase changelogs
│   ├── filters/                    # YAML log-parsing filter definitions
│   ├── rules/                      # YAML correlation rule definitions
│   ├── Dockerfile                  # eclipse-temurin:17, WAR deployment
│   └── pom.xml                     # Maven build config
│
├── etc/                            # Infrastructure configuration
│   ├── iso/                        # ISO image build configs
│   └── opensearch/                 # OpenSearch cluster configuration
│
├── filters/                        # Log parsing filters (25 integrations)
│   ├── antivirus/ aws/ azure/ cisco/ crowdstrike/ fortinet/
│   ├── generic/ github/ google/ ibm/ json/ linux/ macos/
│   ├── mikrotik/ netflow/ office365/ paloalto/ pfsense/
│   ├── sonicwall/ sophos/ suricata/ syslog/ utmstack/
│   ├── vmware/ windows/
│   └── README.md
│
├── frontend/                       # Web UI — Angular 7, TypeScript 3.2, Node 14
│   └── src/app/
│       ├── account/                # User profile management
│       ├── active-directory/       # AD integration views
│       ├── admin/                  # System administration
│       ├── app-management/         # Application management
│       ├── app-module/             # Integration modules
│       ├── assets-discover/        # Data sources / asset discovery
│       ├── compliance/             # Compliance reporting
│       ├── core/                   # Auth guards, interceptors, services
│       ├── dashboard/              # Custom dashboards
│       ├── data-management/        # Alert management
│       ├── graphic-builder/        # Chart/visualization builder
│       ├── incident/               # Incident management
│       ├── incident-response/      # SOAR / automated response
│       ├── log-analyzer/           # Log search & discovery
│       ├── report/                 # Reporting (currently disabled)
│       ├── rule-management/        # Correlation rule editor
│       ├── threatwind/             # Threat intelligence feeds
│       └── shared/                 # Common components, pipes, directives
│
├── installer/                      # Server installer — Go 1.25.1
│   ├── config/                     # Build-time config (ldflags injection)
│   ├── docker/                     # compose.go (dynamic Docker Swarm stack generation)
│   ├── setup/                      # First-time setup (certs, DB init, nginx)
│   ├── system/                     # Resource detection & memory balancing
│   ├── updater/                    # Background update service
│   └── build.sh                    # Build script with ldflags
│
├── plugins/                        # Event processor plugins — 17 Go modules
│   ├── alerts/                     # Alert generation
│   ├── aws/                        # AWS log normalization
│   ├── azure/                      # Azure log normalization
│   ├── bitdefender/                # Bitdefender integration
│   ├── compliance-orchestrator/    # Compliance automation (NOT in Dockerfile yet)
│   ├── config/                     # Plugin configuration
│   ├── crowdstrike/                # CrowdStrike integration
│   ├── events/                     # Core event processing
│   ├── feeds/                      # Threat intel feeds
│   ├── gcp/                        # Google Cloud log normalization
│   ├── geolocation/                # IP geolocation enrichment
│   ├── inputs/                     # Input handling
│   ├── modules-config/             # Module configuration
│   ├── o365/                       # Office 365 log normalization
│   ├── soc-ai/                     # AI-powered analysis
│   ├── sophos/                     # Sophos integration
│   └── stats/                      # Statistics/metrics
│
├── rules/                          # Correlation rules (23 categories)
│   ├── antivirus/ cisco/ cloud/ crowdstrike/ fortinet/ generic/
│   ├── github/ ibm/ json/ linux/ macos/ mikrotik/ netflow/
│   ├── nids/ office365/ paloalto/ pfsense/ sonicwall/
│   ├── sophos/ suricata/ syslog/ vmware/ windows/
│
├── shared/                         # Shared Go library — Go 1.25.1
│   └── (archive, exec, fs, http, logger, svc utilities)
│
├── user-auditor/                   # User audit service — Java 11, Spring Boot 2.7
│   ├── src/                        # JPA + PostgreSQL, audit trail storage
│   ├── Dockerfile
│   └── pom.xml
│
├── utmstack-collector/             # Cloud/SaaS collector — Go 1.25.5
│   ├── agent/                      # Registration & ping
│   ├── collector/                  # Cloud source collection logic
│   ├── config/                     # Config with ldflags secrets
│   ├── conn/                       # gRPC connection
│   ├── database/                   # Local SQLite DB
│   └── serv/                       # Main service loop
│
├── web-pdf/                        # PDF report generator — Java 11, Spring Boot 2.7
│   ├── src/                        # Selenium-based HTML→PDF conversion
│   ├── Dockerfile
│   └── pom.xml
│
├── event_processor.Dockerfile      # Docker image for event processor + 16 plugins
├── AGENTS.md                       # Build & architecture guide
├── README.md                       # Installation & feature overview
├── CONTRIBUTING.md                 # Contribution guidelines
├── SECURITY.md                     # Security policy
└── LICENSE                         # AGPL-3.0
```

---

## Step 2 — Architecture Summary

### Microservices

| Service | Language | Port(s) | Purpose |
|---|---|---|---|
| **backend** | Java 17 (Spring Boot 3.1) | 8080 | REST API, business logic, Liquibase migrations |
| **frontend** | Angular 7 (nginx) | 10001→80 (internal) | Web UI (served via nginx proxy) |
| **event-processor-worker** | Go | 50051, 8080 | Real-time log correlation engine (gRPC + HTTP) |
| **event-processor-manager** | Go | 8000 | Event processor cluster manager + SOC AI endpoint (8090) |
| **agentmanager** | Go 1.25.5 | 9000, 9001 | Agent registration/management via gRPC |
| **opensearch (node1)** | OpenSearch | 9200 (internal) | Log storage, full-text search, analytics |
| **postgres** | PostgreSQL | 5432 (internal) | Relational data (users, config, rules, incidents) |
| **user-auditor** | Java 11 (Spring Boot 2.7) | internal | User session & activity auditing |
| **web-pdf** | Java 11 (Spring Boot 2.7) | internal | HTML-to-PDF report generation (Selenium) |
| **filebrowser** | Third-party | internal | File management (referenced in compose, external image) |

### Frontend Stack

- **Framework**: Angular 7.2.0
- **UI Libraries**: Bootstrap 4, ng-bootstrap, ngx-echarts (ECharts 4), ngx-gauge, ngx-spinner, ngx-json-viewer, Monaco Editor
- **Charting**: ECharts 4 (echarts-gl, echarts-leaflet, echarts-wordcloud, echarts-stat)
- **Maps**: Leaflet (with leaflet.heat)
- **State Management**: RxJS 6.3, ngx-webstorage (no NgRx/Redux)
- **Routing**: Angular Router with lazy-loaded modules + route guards
- **i18n**: @ngx-translate
- **Styles**: SCSS, Bootstrap 4, flag-icon-css, Font Awesome 4, animate.css
- **Real-time**: STOMP over WebSocket (sockjs-client + stompjs/webstomp-client)

### Database Layer

| Database | Service | Data |
|---|---|---|
| **PostgreSQL** | backend | Users, authorities, integrations, configuration, compliance templates, incidents, dashboards, visualizations, correlation rules, API keys, identity providers, alert response rules, schedules |
| **PostgreSQL** | agentmanager | Agent registration, agent metadata (separate `agentmanager` database) |
| **PostgreSQL** | user-auditor | User audit logs (separate `userauditor` database) |
| **OpenSearch** | event-processor/backend | All indexed log events, alerts, GeoIP data, threat intel |
| **SQLite** | agent (on endpoint) | Local agent state, configuration cache |
| **SQLite** | utmstack-collector | Local collector state |
| **SQLite** | as400 | Local AS/400 collector state |

Schema management: **Liquibase** (200+ changelogs since Oct 2023). Initial schema in `20231013001_init_database.xml`.

### Message Broker / Event Streaming

**No traditional message broker** (no Kafka, RabbitMQ, etc. for inter-service messaging). Instead:
- **gRPC** for agent↔server communication (agent-manager on ports 9000/9001)
- **gRPC** for backend↔event-processor communication
- **Direct HTTP** between backend and event-processor-manager (SOC AI at :8090)
- **WebSocket (STOMP)** for real-time frontend notifications
- Correlation happens **before data ingestion** in the event processor — logs flow directly from agents/collectors through gRPC to the event processor, which writes to OpenSearch.

### Authentication / Authorization

- **JWT tokens** (configurable validity: 86400s default, 2592000s remember-me)
- **SAML2 SSO** (identity provider integration — full Saml2Login configuration)
- **API Keys** (stored in `utm_api_keys` table, custom filter chain)
- **Internal API Keys** (for inter-service auth between backend components)
- **BCrypt** password encoding
- **2FA/TOTP** (configurable, mandatory in production, disabled in dev/rc)
- **Roles**: `ROLE_ADMIN`, `ROLE_USER`, `PRE_VERIFICATION_USER`
- **Fail2ban-style** login attempt tracking
- **Agent auth**: TLS + encrypted `REPLACE_KEY` injected at build time via ldflags

### Agent Architecture

```
Endpoint (Win/Linux/macOS)          Server
┌──────────────────────┐            ┌───────────────┐
│  UTMStack Agent      │───gRPC────▶│ Agent Manager │
│  (Go binary)         │  TLS+Key   │  (9000/9001)  │
│                      │            └───────┬───────┘
│  Collectors:         │                    │
│  - Syslog (UDP/TCP)  │                    ▼
│  - File tail         │            ┌───────────────┐
│  - Netflow           │            │Event Processor│
│  - Auditd (Linux)    │            │  (Correlation)│
│  - Platform events   │            └───────┬───────┘
└──────────────────────┘                    │
                                            ▼
Cloud/SaaS Collectors                ┌───────────────┐
┌──────────────────────┐            │  OpenSearch   │
│ utmstack-collector   │───gRPC────▶│  (Storage)    │
│ as400 collector      │            └───────────────┘
└──────────────────────┘
```

- Agent registers with agent-manager, receives config and updates
- Agent self-updates via background updater service
- Agent collects logs locally and streams them via gRPC
- Separate collectors for cloud APIs (AWS, Azure, GCP, O365, Sophos, CrowdStrike, Bitdefender)

### Integration Points

- **AWS**: CloudWatch Logs, CloudTrail (via utmstack-collector)
- **Azure**: Activity Logs, AD Logs (via utmstack-collector)
- **GCP**: Cloud Logging (via utmstack-collector)
- **Office 365**: Audit logs, Exchange, SharePoint (via utmstack-collector)
- **CrowdStrike**: Falcon API (via utmstack-collector)
- **Sophos Central**: API integration (via utmstack-collector)
- **Bitdefender GravityZone**: API integration (via utmstack-collector)
- **IBM AS/400**: Dedicated collector
- **ThreatWinds**: Threat intelligence feed API
- **SAML2 IdPs**: SSO (Okta, Azure AD, etc.)
- **SMTP**: Email notifications and alerts
- **Syslog (UDP/TCP)**: Any network device/application
- **Netflow**: Network traffic analysis

---

## Step 3 — Feature Inventory

### Detection & Alerting
- Real-time log correlation engine (custom Go-based, not ELK)
- YAML-based correlation rules (23+ technology categories)
- Custom rule creation & management UI
- Alert classification and tagging
- Alert response rules (automated actions on alert trigger)
- SOC AI-powered alert analysis and investigation assistance
- Threat intelligence integration (ThreatWinds feeds)
- Adversary/attacker tracking

### Log Ingestion Sources (25+)
- **Network**: Cisco (ASA, Firepower, Switch, Meraki), FortiGate, Fortiweb, PaloAlto, pfSense, SonicWall, MikroTik, Netflow, Suricata/NIDS
- **Endpoints**: Windows Event Logs, Linux (syslog, auditd), macOS
- **Cloud**: AWS (CloudTrail, CloudWatch), Azure, GCP, Office 365
- **Security**: Sophos (XG + Central), Bitdefender, CrowdStrike, Kaspersky, SentinelOne, Deceptive Bytes
- **Infrastructure**: VMware ESXi, GitHub audit, IBM AS/400, IBM AIX, Oracle
- **Generic**: Syslog, JSON, Generic log format

### Dashboard & Visualization
- Custom dashboard builder (drag-and-drop gridster)
- Visualization/chart builder (ECharts-based)
- Pre-built dashboards per integration (Windows, Bitdefender, VMware, O365, etc.)
- Geographic visualizations (Leaflet maps, heatmaps)
- Word clouds, gauges, line/bar/pie charts, 3D charts (echarts-gl)
- Monaco Editor integration (for advanced queries)

### Compliance & Reporting
- Compliance module (control configs + query configs)
- Compliance report scheduling
- PDF report generation (web-pdf service using Selenium)
- Report templates

### Incident Management & SOAR
- Incident creation, tracking, lifecycle management
- Incident response automation (SOAR)
- Response action templates
- Automation variables
- Alert-to-incident escalation

### User & Tenant Management
- User CRUD with role-based access (Admin, User)
- Two-factor authentication (TOTP)
- SAML2 SSO integration
- API key management
- User activity auditing (dedicated user-auditor service)
- Password reset flow
- Session management

### Additional Features
- Log analyzer (search, filter, explore raw logs)
- Data source / asset discovery
- Active Directory integration views
- Integration module management (enable/disable data sources)
- Data parsing pipeline configuration
- Index pattern management
- Getting started wizard
- Application management
- Notification system
- Vulnerability scanner module (code exists but currently disabled in routing)

---

## Step 4 — Tech Stack Fingerprint

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Backend Framework** | Spring Boot | 3.1.5 | JHipster 7.3.1 scaffolding |
| **Backend Language** | Java | 17 | WAR packaging |
| **Backend ORM** | Hibernate | 5.4.32.Final | JPA with PostgreSQL |
| **Backend DB Migrations** | Liquibase | 4.24.0 | 200+ changelogs |
| **Backend gRPC** | io.grpc | 1.65.1 | Inter-service communication |
| **Backend Protobuf** | protobuf-java | 4.29.3 | Message serialization |
| **Backend Security** | Spring Security | (Boot 3.1 managed) | JWT + SAML2 + API Keys |
| **Backend Build** | Maven | 3.3.9+ | settings.xml for GitHub Packages |
| **Frontend Framework** | Angular | 7.2.0 | CLI v7.3.6 |
| **Frontend Language** | TypeScript | 3.2.2 | Strict mode off |
| **Frontend Charts** | ECharts | 4.4.0 | + echarts-gl, echarts-leaflet |
| **Frontend Maps** | Leaflet | 1.6.0 | With leaflet.heat |
| **Frontend UI** | Bootstrap | 4.3.1 | + ng-bootstrap 4.1.0 |
| **Frontend Code Editor** | Monaco Editor | 0.20.0 | ngx-monaco-editor 7.0.0 |
| **Frontend i18n** | ngx-translate | 11.0.1 | HTTP loader |
| **Frontend Realtime** | STOMP/WebSocket | sockjs-client + stompjs | Push notifications |
| **Frontend CSS** | SCSS | node-sass 4.x | Requires Node 14 |
| **Frontend Linter** | TSLint | 5.11.0 | Deprecated (not ESLint) |
| **Frontend Test** | Karma + Jasmine | ~2.99.1 | karma-chrome-launcher |
| **Node.js** | Node.js | 14.16.1 | Required for frontend build |
| **Go Modules** | Go | 1.25.5 / 1.25.1 | Agent, plugins, installer |
| **Go gRPC** | google.golang.org/grpc | 1.81.1 | Agent ↔ server |
| **Go Protobuf** | google.golang.org/protobuf | 1.36.11 | Message serialization |
| **Go ORM** | GORM | 1.31.1 | PostgreSQL (agent-manager) |
| **Go SQLite** | glebarez/sqlite | 1.11.0 | Agent local DB |
| **Go CLI** | cobra | 1.10.2 | Agent CLI |
| **Go Service** | kardianos/service | 1.2.4 | System service management |
| **Go Logging** | threatwinds/logger | 1.2.3 | Structured logging |
| **Go HTTP** | gin-gonic/gin | 1.10.1–1.12.0 | REST endpoints in Go services |
| **Go Netflow** | netsampler/goflow2 | 1.3.7 | Netflow collection |
| **Go Auditd** | elastic/go-libaudit/v2 | 2.6.2 | Linux audit log collection |
| **Go AES** | AtlasInsideCorp/AtlasInsideAES | 1.0.0 | Encryption for secrets |
| **Search Engine** | OpenSearch | latest (from GHCR) | Log storage & full-text search |
| **Relational DB** | PostgreSQL | latest (from GHCR) | App data, config, users |
| **User Auditor** | Spring Boot | 2.7.14 | Java 11 |
| **PDF Generator** | Spring Boot + Selenium | 2.7.14 + Selenium 4.5.0 | Java 11, headless browser |
| **Container Runtime** | Docker Swarm | — | Orchestration via `docker stack deploy` |
| **Container Registry** | GHCR | ghcr.io/utmstack/utmstack/* | All images |
| **CI/CD** | GitHub Actions | — | Reusable workflows |
| **Code Signing** | jsign (Windows) + codesign (macOS) | — | GCP KMS for Windows |
| **Geolocation** | MaxMind-style CSV | — | Downloaded from GCS at build time |
| **License Manager** | utmstack/license-manager-sdk | 0.1.0 | License validation |
| **Metrics** | Prometheus | (Spring Actuator) | Exposed at /management/prometheus |
| **Health Checks** | Spring Actuator | — | /api/healthcheck, /management/health |

---

## Step 5 — Identified Issues / Technical Debt

### Critical Issues

1. **`jib-maven-plugin` image mismatch** — `pom.xml` declares `eclipse-temurin:11-jre-focal` for jib but the backend requires Java 17. The actual `Dockerfile` correctly uses `eclipse-temurin:17`, so jib-based builds would produce a broken image.

2. **No `.env.example` file anywhere** — The stack requires numerous environment variables (`DB_PASS`, `INTERNAL_KEY`, `ENCRYPTION_KEY`, `ELASTICSEARCH_PASSWORD`, `GRPC_AGENT_MANAGER_HOST`, etc.) but there is no `.env.example` or `.env.template` documenting them. New developers must reverse-engineer `compose.go`.

3. **Hardcoded credentials in `build.sh`** — The installer's `build.sh` contains placeholder secrets (`"your-encryption-salt-here"`, `"your-public-key-here"`) which is acceptable for dev, but the real CI secrets (`CM_ENCRYPT_SALT`, `CM_SIGN_PUBLIC_KEY`) are injected via GitHub Secrets. If someone runs `build.sh` as-is, services cannot authenticate.

4. **Hardcoded dev SMTP credentials** — `application-dev.yml` has `username: test@domain.local` / `password: Admin123.`. These should be env vars.

5. **Node 14.16.1 requirement** — Node 14 has been EOL since April 2023. The `node-sass@4` dependency prevents upgrading. This is a security risk.

### Outdated Dependencies

| Dependency | Current | Latest Stable | Risk |
|---|---|---|---|
| Angular | 7.2.0 | 19.x | Severely outdated (2018 release). No security patches. |
| TypeScript | 3.2.2 | 5.7+ | Missing years of type safety improvements |
| node-sass | 4.x | Deprecated (use dart-sass) | Blocks Node upgrade |
| TSLint | 5.11.0 | Deprecated (ESLint is replacement) | No security updates |
| jQuery | 3.7.1 | Current | Less critical, but shouldn't be in Angular app |
| Bootstrap | 4.3.1 | 5.3+ | EOL Bootstrap 4 |
| RxJS | 6.3.3 | 7.x | Missing operator tree-shaking |
| Hibernate | 5.4.32 | 6.6+ | Mismatched with Spring Boot 3.1 (which expects Hibernate 6) |
| Selenium | 4.5.0 | 4.27+ | In web-pdf, relatively minor |
| Spring Boot (user-auditor, web-pdf) | 2.7.14 | 3.4+ | Spring Boot 2.7 EOL Nov 2023 |
| Karma | 6.4.1 | Deprecated (use Jest/Vitest) | Test runner is deprecated |
| Protractor | 7.0.0 | Deprecated | E2E framework is deprecated |

### Architectural Debt

6. **No test infrastructure** — Backend has no `src/test/` directory (noted in AGENTS.md). Frontend has Karma/Jasmine config but no evidence of substantial test coverage. No Go test files visible in agent or plugins.

7. **Hibernate version mismatch** — `pom.xml` pins Hibernate 5.4.32 but Spring Boot 3.1 ships with Hibernate 6.x. This forced downgrade may cause subtle issues.

8. **Frontend components likely lack loading/error states** — Angular 7 era components predate modern best practices. The large number of modules (25+) with no observable error boundary pattern suggests inconsistent UX for failure cases.

9. **compliance-orchestrator plugin not in Dockerfile** — 17 plugins exist but only 16 are copied into `event_processor.Dockerfile`. The compliance-orchestrator is built but never deployed.

10. **Geolocation data not in repo** — The `geolocation/` directory is gitignored and must be manually downloaded from GCS. No automation or fallback exists for local dev.

11. **Mixed Java versions** — Backend uses Java 17, user-auditor and web-pdf use Java 11 (Spring Boot 2.7). This creates maintenance burden and potential classpath issues in shared dependencies.

12. **No health checks on several services** — `backend/Dockerfile` has a health check, but `compose.go` shows no health check configuration for postgres, user-auditor, agentmanager, or web-pdf containers.

13. **Report module disabled** — The frontend routing shows the `/reports` route is commented out, and the `report/` module folder still exists. Dead code.

14. **Vulnerability scanner module disabled** — Route is commented out in `app-routing.module.ts` but the code (`vulnerability-scanner/`, `scanner/`) remains in the repo.

15. **filebrowser referenced but not defined** — `compose.go` references a `filebrowser` service dependency for `frontend`, but no service definition for it exists in the visible compose generation code. It may be added elsewhere or is a leftover.

16. **CORS wildcard in dev** — `application-dev.yml` sets `allowed-origins: '*'` with `allow-credentials: false`. Acceptable for dev but dangerous if dev config leaks to production.

17. **Docker Swarm** — Production uses Docker Swarm (`docker stack deploy`) rather than Kubernetes. While functional, Swarm has limited community support and fewer operational tools compared to K8s.

18. **No rate limiting visible** — The backend security configuration shows no rate limiting beyond the fail2ban-style login tracking. API endpoints may be vulnerable to abuse.

---

*Generated: June 21, 2026*
*Most urgent items: Node 14 EOL dependency chain, mixed Java versions, lack of test infrastructure.*
