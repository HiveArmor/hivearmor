# 04 — Data Model and Storage

## Storage Layers

| Layer | Engine | Purpose | Managed By |
|---|---|---|---|
| PostgreSQL `utmstack` | PostgreSQL | App data: users, alerts config, rules, incidents, dashboards, compliance | Liquibase |
| PostgreSQL `agentmanager` | PostgreSQL | Agent/collector registrations | GORM auto-migrate |
| PostgreSQL `userauditor` | PostgreSQL | User session and activity audit log | JPA DDL / migrations |
| OpenSearch `v11-*` | OpenSearch | All indexed log events and alerts | Dynamic mapping |
| SQLite (endpoint) | SQLite | Local agent state and log buffer | In-process migrations |
| SQLite (collector) | SQLite | Local collector state and log buffer | In-process migrations |

---

## PostgreSQL Schema — `utmstack` Database

Schema managed by **Liquibase** (`backend/src/main/resources/config/liquibase/master.xml`).
200+ changesets from `20231013` to `20260623`.

### Core User / Auth Tables

| Table | Key Columns | Notes |
|---|---|---|
| `jhi_user` | `id`, `login`, `password_hash`, `email`, `activated`, `created_date`, `last_modified_date` | JHipster standard user |
| `jhi_authority` | `name` (PK) | `ROLE_ADMIN`, `ROLE_USER` |
| `jhi_user_authority` | `user_id`, `authority_name` | M:N join |
| `jhi_persistent_audit_event` | `event_id`, `principal`, `event_date`, `event_type`, `data` | Spring audit events |
| `jhi_persistent_audit_evt_data` | — | Audit event key/value pairs |

### Alert Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_alert_log` | `id`, `alert_id`, `user_id`, `action`, `created_date` | Alert state change audit |
| `utm_alert_last` | `id`, `alert_id`, `status`, `created_date` | Last alert state per source |
| `utm_alert_tag` | `id`, `tag_name`, `tag_color`, `tag_description` | Named alert tags |
| `utm_alert_tag_rule` | `id`, `rule_name`, `rule_conditions`, `tag_id`, `created_by`, `created_date` | Auto-tagging rules |

### Incident Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_incident` | `id`, `incident_name`, `incident_description`, `incident_status`, `incident_severity`, `created_by`, `created_date` | Case management |
| `utm_incident_alert` | `id`, `incident_id`, `alert_id` | Alert-to-incident linking |
| `utm_incident_history` | `id`, `incident_id`, `action`, `user`, `created_date` | Incident audit trail |
| `utm_incident_note` | `id`, `incident_id`, `note`, `user`, `created_date` | Free-text notes |

### SOAR Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_incident_action` | `id`, `action_name`, `action_type`, `action_command`, `action_params_def` | Playbook action definitions |
| `utm_incident_action_command` | `id`, `action_id`, `command` | Commands within actions |
| `utm_incident_job` | `id`, `job_name`, `job_status`, `started_at`, `finished_at`, `agent_id` | Job execution records |
| `utm_incident_variable` | `id`, `var_name`, `var_value`, `var_type` | Automation variables |
| `utm_alert_response_rule` | `id`, `rule_name`, `rule_conditions`, `action_def`, `active` | Automated response rules |
| `utm_alert_response_rule_execution` | `id`, `rule_id`, `alert_id`, `executed_at` | Execution tracking |
| `utm_alert_response_rule_history` | `id`, `rule_id`, `action`, `created_date` | Rule change history |

### Correlation / Rules Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_correlation_rules` | `id`, `rule_name`, `rule_active`, `rule_definition_def`, `rule_category`, `rule_technique`, `rule_confidentiality`, `rule_integrity`, `rule_availability`, `rule_last_update` | YAML-format rules stored as JSON |
| `utm_group_rules_data_type` | `rule_id`, `data_type_id` | Rule ↔ data type mapping |
| `utm_data_types` | `id`, `data_type` | Registered log data types |
| `utm_regex_pattern` | `pattern_id`, `pattern_definition`, `last_update` | Regex library for parsing |
| `utm_tenant_config` | `id`, `asset_name`, `asset_hostname_list_def`, `asset_ip_list_def`, `asset_confidentiality`, `asset_integrity`, `asset_availability`, `last_update` | Asset/tenant config for impact scoring |

### Data Parsing Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_logstash_filter` | `id`, `filter_name`, `logstash_filter`, `module_name`, `is_active`, `updated_at` | Log parsing filter definitions (YAML/Logstash DSL) |
| `utm_logstash_filter_group` | `id`, `group_name`, `module_name` | Filter groups |
| `utm_logstash_pipeline` | `id`, `pipeline_name`, `pipeline_description`, `pipeline_status`, `module_name` | Pipeline definitions |
| `utm_group_logstash_pipeline_filters` | `pipeline_id`, `filter_id` | Pipeline ↔ filter mapping |

### Dashboard / Visualization Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_dashboard` | `id`, `dashboard_name`, `dashboard_description`, `owner`, `created_date` | Custom dashboards |
| `utm_visualization` | `id`, `name`, `description`, `chart_type`, `chart_config`, `owner` | Chart/visualization configs |
| `utm_dashboard_visualization` | `id`, `dashboard_id`, `visualization_id`, `position`, `size_x`, `size_y` | Gridster layout |
| `utm_dashboard_authority` | `dashboard_id`, `authority_name` | Role-based dashboard access |

### Compliance Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_compliance_standard` | `id`, `standard_name`, `standard_description` | PCI-DSS, HIPAA, etc. |
| `utm_compliance_standard_section` | `id`, `standard_id`, `section_name`, `section_description` | Standard sections |
| `utm_compliance_control_config` | `id`, `section_id`, `control_name`, `query_config_id` | Control configuration |
| `utm_compliance_query_config` | `id`, `query_name`, `query_definition`, `query_index_pattern` | OpenSearch queries for controls |
| `utm_compliance_report_config` | `id`, `name`, `standard_id`, `sections_def` | Report templates |
| `utm_compliance_report_schedule` | `id`, `report_config_id`, `cron_expression`, `recipients`, `last_run` | Scheduled report delivery |

### Integration / Module Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_module` | `id`, `module_name`, `module_active`, `module_category`, `module_icon` | Integration modules |
| `utm_module_group` | `id`, `group_name`, `module_id` | Module configuration groups |
| `utm_module_group_configuration` | `id`, `group_id`, `conf_name`, `conf_value`, `conf_type` | Per-module config values |

### System Tables

| Table | Key Columns | Notes |
|---|---|---|
| `utm_api_keys` | `id`, `key_name`, `key_value`, `key_hash`, `created_by`, `created_date`, `active` | External API access keys |
| `utm_client` | `id`, `client_name`, `client_key`, `license_type` | Customer/tenant identifier |
| `utm_server` | `id`, `server_name`, `server_address` | Server registration |
| `utm_server_module` | `id`, `server_id`, `module_name` | Server ↔ module mapping |
| `utm_configuration_parameter` | `id`, `section_id`, `param_name`, `param_value`, `param_type` | System config params |
| `utm_configuration_section` | `id`, `section_name`, `section_description` | Config sections |
| `utm_menu` | `id`, `name`, `url`, `icon`, `parent_id`, `active`, `type` | Navigation menu |
| `utm_menu_authority` | `menu_id`, `authority_name` | Menu role access |
| `utm_notification` | `id`, `notification_title`, `notification_body`, `notification_type`, `user`, `read`, `created_date` | In-app notifications |
| `utm_schedule` | `id`, `schedule_name`, `schedule_type`, `schedule_cron`, `last_run`, `next_run` | Generic task schedule |
| `utm_images` | `id`, `image_name`, `image_content`, `image_type` | Stored image assets |
| `utm_asset_metrics` | `id`, `asset_id`, `metric_type`, `metric_value`, `created_date` | Asset performance data |
| `utm_getting_started` | `id`, `step_name`, `step_done`, `step_order` | Onboarding wizard state |
| `utm_index_pattern` | `id`, `pattern_name`, `pattern_title`, `time_field_name` | OpenSearch index patterns |
| `utm_data_input_status` | `id`, `module_name`, `data_type`, `last_update`, `status` | Ingestion health tracking |
| `utm_space_notification_control` | — | Disk space notification state |
| `utm_federation_service_client` | `id`, `client_name`, `client_url`, `client_key` | Federation service registry |
| `idp_config` | `id`, `provider_name`, `provider_type`, `metadata_url`, `client_id` | SAML2 / SSO provider config |

---

## OpenSearch Index Structure

All indices follow the `v11-<type>-<date>` pattern.

| Index Pattern | Content |
|---|---|
| `v11-alert-YYYY.MM.DD` | Generated security alerts |
| `v11-*-YYYY.MM.DD` | Indexed log events (one index per log data type per day) |
| `v11-statistics-YYYY.MM` | Ingestion statistics (per data source / data type) |
| `logstash-*` | Legacy Logstash index pattern (may exist from earlier installations) |

**Index lifecycle**: Managed via OpenSearch ISM (Index State Management) policies. The backend provides `IndexPolicyResource` and `IndexPolicyService` for CRUD on ISM policies.

**Alert document structure** (from `plugins/alerts/main.go`):
```json
{
  "@timestamp": "...",
  "id": "...",
  "name": "...",
  "category": "...",
  "description": "...",
  "severity": 1/2/3,
  "severityLabel": "Low/Medium/High",
  "status": 1-5,
  "statusLabel": "Automatic review/Open/In Review/Ignored/Completed",
  "technique": "...",
  "dataSource": "...",
  "dataType": "...",
  "adversary": "...",
  "target": "...",
  "parentId": "...",
  "events": [...],
  "tags": [...],
  "deduplicatedBy": [...],
  "groupedBy": [...],
  "incidentDetail": { "createdBy": "...", "source": "..." },
  "isIncident": false,
  "lastEvent": {...}
}
```

---

## Database Migration Strategy

- **Liquibase** manages `utmstack` PostgreSQL schema
- Master file: `backend/src/main/resources/config/liquibase/master.xml`
- All changesets are XML files in `changelog/` directory, date-prefixed
- Running: automatically on Spring Boot startup in all profiles
- **No rollback scripts** observed
- **No blue/green migration strategy** — schema changes deploy alongside application

### Migration Risk Areas
- Changesets that remove tables/columns cannot be rolled back without data loss
- Multiple mass filter removals (`20260218*` series removed redis, nginx, mysql, kafka, etc.)
- No down-migration support

### Notable Data Migrations

| Changeset | Date | Description | Risk |
|---|---|---|---|
| `20260703001` | 2026-07-03 | **Rebrand — `conf_param_short` key rename**: `UPDATE utm_configuration_parameter SET conf_param_short = replace(conf_param_short, 'utmstack.', 'nilachakra.')`. Renames all `utmstack.*` config keys (e.g. `utmstack.mail.host`) to `nilachakra.*` equivalents. Must be deployed simultaneously with the matching `Constants.java` and `application.yml` renames or Spring `@Value` bindings will fail on startup. Idempotent — safe on fresh DB (no rows) or existing DB. | HIGH — requires coordinated deploy of backend and config changes |

---

## Agent-Manager PostgreSQL Schema (`agentmanager`)

Managed by **GORM auto-migrate** (no Liquibase).

| Table | Key Columns | Notes |
|---|---|---|
| `agents` | `id`, `hostname`, `ip`, `os`, `platform`, `version`, `mac`, `agent_key`, `deleted_by` | Endpoint agent registry |
| `agent_commands` | `id`, `agent_id`, `cmd_id`, `command`, `command_status`, `result`, `executed_at` | Command history |
| `collectors` | `id`, `hostname`, `ip`, `module`, `version`, `collector_key`, `deleted_by` | Cloud/SaaS collector registry |
| `last_seen` | `id`, `connector_type`, `connector_id`, `last_ping` | Heartbeat tracking |

---

## Sensitive Data Handling

| Data Type | Storage Location | Encryption |
|---|---|---|
| User passwords | `jhi_user.password_hash` | BCrypt |
| JWT signing secret | In-memory (ephemeral, rotates on restart) | HMAC-SHA512 |
| Agent keys | `agents.agent_key` PostgreSQL | UUID (not encrypted at rest) |
| API keys | `utm_api_keys.key_hash` | Stored as hash; raw value shown once |
| SMTP credentials | `utm_configuration_parameter` | Plaintext in DB |
| OpenSearch credentials | Environment variables | Plaintext env vars |
| SAML2 metadata | `idp_config.metadata_url` | URL reference only |
| Encryption keys | Environment variable `ENCRYPTION_KEY` | Plaintext env var |
| TFA codes | Caffeine in-memory cache | Plaintext in memory, short TTL |
| Customer logs | OpenSearch indices | No field-level encryption |
| Installer salt | Build-time ldflags `REPLACE` | Embedded in binary |
