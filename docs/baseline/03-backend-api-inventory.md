# 03 — Backend API Inventory

## Framework

- **Spring Boot 3.1.5** + JHipster 7.3.1 scaffolding
- **Java 17**, Maven build
- **WAR packaging** → `target/utmstack.war`
- **Base path**: `/api/`
- **API documentation**: SpringDoc/Swagger at `/management/swagger-ui.html` (dev only)
- **No API versioning**: All endpoints use the flat `/api/` prefix with no version segment

---

## API Versioning Assessment

There is **no API versioning strategy**. All endpoints are at `/api/<resource>`. This creates a risk for:
- Breaking changes when modifying request/response shapes
- Frontend assumptions about field names/types
- Agent-manager gRPC API (proto-defined, versioned only by protobuf field numbering)

---

## Authentication Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/authenticate` | public | JWT login — returns token + TFA info |
| `GET` | `/api/account` | JWT | Get current account |
| `POST` | `/api/account` | JWT | Update account |
| `GET` | `/api/account/reset-password/init` | public | Password reset init |
| `POST` | `/api/account/reset-password/finish` | public | Password reset finish |
| `GET` | `/api/check-credentials` | JWT | Verify password before sensitive operations |
| `GET` | `/api/tfa/refresh` | pre-auth JWT | Refresh TFA code |
| `POST` | `/api/tfa/verify-code` | pre-auth JWT | Verify TFA code, receive full JWT |
| `GET` | `/api/enrollment/**` | pre-auth JWT | TFA enrollment flow |
| `GET` | `/api/utm-providers` | public | List SSO identity providers |
| `GET` | `/api/ping` | public | Health ping |
| `GET` | `/api/healthcheck` | public | Application health |
| `GET` | `/api/info/version` | public | Version info |

---

## User & Admin Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/users` | ADMIN | User CRUD |
| `GET` | `/api/authorities` | ADMIN | List roles |
| `GET` | `/api/utm-api-keys` | ADMIN | API key listing |
| `POST` | `/api/utm-api-keys` | ADMIN | Create API key |
| `DELETE` | `/api/utm-api-keys/{id}` | ADMIN | Delete API key |
| `GET` | `/api/utm-menu` | JWT | Navigation menu |
| `GET/POST/PUT` | `/api/utm-configuration-parameters` | ADMIN | System config params |
| `GET/POST` | `/api/utm-configuration-sections` | ADMIN | Config sections |
| `GET/POST/PUT` | `/api/idp-providers` | ADMIN | Identity provider management |

---

## Alert Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/utm-alerts` | JWT | List/filter alerts (paginated) |
| `PUT` | `/api/utm-alerts` | JWT | Update alert status/tags |
| `GET` | `/api/utm-alerts/{id}` | JWT | Get alert detail |
| `GET` | `/api/utm-alert-tags` | JWT | List alert tags |
| `POST/PUT/DELETE` | `/api/utm-alert-tags` | JWT | Manage alert tags |
| `GET/POST/PUT/DELETE` | `/api/utm-alert-tag-rules` | JWT | Alert auto-tagging rules |
| `GET` | `/api/utm-alerts/count-open-alerts` | JWT | KPI: open alert count |
| `GET` | `/api/utm-alert-logs` | JWT | Alert audit log |
| `POST` | `/api/utm-soc-ai/analyze` | JWT | Trigger SOC AI analysis |

---

## Incident Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/api/utm-incidents` | JWT | Incident CRUD |
| `PUT` | `/api/utm-incidents/{id}` | JWT | Update incident |
| `GET/POST` | `/api/utm-incident-alerts` | JWT | Link alerts to incidents |
| `GET` | `/api/utm-incident-history` | JWT | Incident audit history |
| `GET/POST` | `/api/utm-incident-notes` | JWT | Incident notes |

---

## SOAR / Incident Response Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/utm-incident-actions` | JWT | SOAR action management |
| `GET/POST/PUT/DELETE` | `/api/utm-incident-action-commands` | JWT | Commands within actions |
| `GET` | `/api/utm-incident-jobs` | ADMIN | Job execution listing |
| `POST` | `/api/utm-incident-jobs` | ADMIN | Trigger job |
| `GET/POST/PUT/DELETE` | `/api/utm-incident-variables` | JWT | Automation variables |
| `GET/POST/PUT/DELETE` | `/api/utm-alert-response-rules` | JWT | Automated alert response rules |
| `GET` | `/api/utm-alert-response-rule-executions` | JWT | Rule execution history |

---

## Correlation Rules & Data Parsing

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/utm-correlation-rules` | JWT | Correlation rule CRUD |
| `GET/POST/DELETE` | `/api/utm-data-types` | JWT | Data type registry |
| `GET/POST/PUT/DELETE` | `/api/utm-regex-patterns` | JWT | Regex pattern library |
| `GET/POST/PUT/DELETE` | `/api/utm-tenant-config` | JWT | Per-tenant asset config |
| `GET/POST/PUT` | `/api/utm-logstash-filters` | JWT | Log parsing filter management |
| `GET/POST/DELETE` | `/api/utm-logstash-filter-groups` | JWT | Filter group management |
| `GET/POST/PUT/DELETE` | `/api/utm-logstash-pipelines` | JWT | Pipeline management |

---

## Dashboard & Visualization Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/utm-dashboards` | JWT | Dashboard CRUD |
| `GET/POST/PUT/DELETE` | `/api/utm-visualizations` | JWT | Visualization (chart) CRUD |
| `GET/POST/DELETE` | `/api/utm-dashboard-visualizations` | JWT | Dashboard ↔ visualization association |
| `GET` | `/api/utm-dashboard-authorities` | JWT | Dashboard role access |

---

## Compliance Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/utm-compliance-standards` | JWT | Compliance standard list |
| `GET/POST/PUT` | `/api/utm-compliance-control-configs` | JWT | Control configuration |
| `GET` | `/api/utm-compliance-control-evaluations` | JWT | Evaluation results |
| `GET/POST/PUT/DELETE` | `/api/utm-compliance-report-schedules` | JWT | Schedule compliance reports |
| `GET/POST` | `/api/utm-compliance-report-configs` | JWT | Report configuration |

---

## Integration & Module Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/PUT` | `/api/utm-modules` | JWT | Enable/disable integration modules |
| `GET/PUT` | `/api/utm-module-groups` | JWT | Module group management |
| `GET/POST/PUT/DELETE` | `/api/utm-module-group-configurations` | JWT | Module config params |
| `GET/POST/DELETE` | `/api/utm-integrations` | JWT | Integration management |

---

## Search & OpenSearch Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/elasticsearch/search` | JWT | Full-text log search |
| `GET` | `/api/elasticsearch/cluster/status` | JWT | OpenSearch cluster health |
| `GET/POST/DELETE` | `/api/utm-index-patterns` | JWT | Index pattern management |
| `GET/POST/PUT/DELETE` | `/api/index-policies` | ADMIN | ISM policy management |
| `GET` | `/api/log-analyzer` | JWT | Log analyzer query |

---

## Asset & Network Scan Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/utm-network-scan` | JWT | Network asset discovery |
| `GET/POST/PUT/DELETE` | `/api/utm-asset-groups` | JWT | Asset grouping |
| `GET` | `/api/utm-asset-types` | JWT | Asset type list |
| `GET/POST/DELETE` | `/api/utm-asset-metrics` | JWT | Asset metrics |

---

## Miscellaneous Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/overview/*` | JWT | Overview KPI data |
| `GET/POST` | `/api/utm-notifications` | JWT | User notifications |
| `GET/POST` | `/api/utm-schedules` | JWT | Scheduled task management |
| `POST` | `/api/pdf-generator` | JWT | Trigger PDF generation |
| `GET` | `/api/utm-images` | public | Image assets |
| `GET/POST` | `/api/utm-clients` | JWT | Client management |
| `GET` | `/api/utm-servers` | JWT | Server info |
| `GET` | `/api/utm-auditor-users` | ADMIN | User audit records |
| `GET` | `/api/getting-started` | JWT | Getting started steps |
| `GET` | `/api/utm-data-input-status` | JWT | Data ingestion status |
| `GET` | `/api/adversary-alerts` | JWT | Adversary/threat tracking |
| `GET/POST` | `/api/utm-collectors` | JWT | Collector registry |
| `GET/POST` | `/api/agent-manager` | JWT | Agent management proxy |
| `GET/POST/DELETE` | `/api/utm-federation-service` | ADMIN | Federation service management |
| `GET` | `/api/isLiteMode` | public | Lite mode flag |

---

## Management / Actuator Endpoints

| Path | Description |
|---|---|
| `/management/health` | Spring Boot Actuator health |
| `/management/info` | App info (git, build) |
| `/management/prometheus` | Prometheus metrics scrape |
| `/management/jhimetrics` | JHipster metrics |
| `/management/loggers` | Runtime log level management |

---

## API Design Notes

- **No versioning**: All at `/api/`. Breaking changes require coordinated frontend+backend deployment.
- **Pagination**: JHipster-style `page`, `size`, `sort` query params; `X-Total-Count` response header.
- **Filtering**: URL query parameters (field-specific: `name.contains=...`, `status.equals=...` etc.)
- **Error format**: Zalando Problem RFC-7807 (`application/problem+json`)
- **Custom headers**: `X-UtmStack-alert`, `X-UtmStack-error`, `X-UtmStack-params` in exposed CORS headers
- **OpenAPI doc**: Accessible at `/v3/api-docs` (dev profile only)
