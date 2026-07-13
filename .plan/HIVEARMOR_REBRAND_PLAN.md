# HiveArmor Complete Rebrand & Independence Plan

**Brand:** HiveArmor (Hyper-scale Incident Visibility Engine)  
**Short name:** `ha`  
**Replaces:** UTMStack, NilaChakra, ArmorSight, AtlasInside  
**Date:** 2026-07-11  
**Author:** Single developer + Claude Code AI

---

## Decision Record

| Decision | Value |
|---|---|
| Go module org | `github.com/hivearmor` |
| Container registry | `ghcr.io/hivearmor` |
| Java root package | `com.hivearmor` |
| DB table prefix | `hive_` (migration from `utm_`) |
| OpenSearch index prefix | `_v3_hive_` (new, replaces `v11-`) |
| OpenSearch cluster name | `hivearmor` |
| PostgreSQL DB name | `hivearmor` |
| Angular frontend | Deleted (not rebranded — Next.js replaces it) |
| AES crypto dep | Inlined as `internal/crypto` package |
| Plugin binary naming | `com.hivearmor.<name>.plugin` |
| Agent binary naming | `hivearmor_agent_service`, `hivearmor_collector`, etc. |
| Windows service names | `HiveArmorAgent`, `HiveArmorUpdater`, `HiveArmorCollector` |
| localStorage JWT key | `hivearmor_auth_token` |
| UI display name | `HiveArmor` everywhere |

---

## Scope of Changes (Full Audit)

| Layer | Items | Effort |
|---|---|---|
| Go module paths (28 modules) | All import paths, go.mod files | Sprint 1 |
| Go source strings (131 files) | Binary names, service names, config keys, log paths | Sprint 1 |
| Go AtlasInsideAES dependency | 6 files — inline as internal package | Sprint 1 |
| Java backend package rename | `com.nilachakra` → `com.hivearmor` (400+ files) | Sprint 2 |
| Java user-auditor + web-pdf | `com.utmstack.*` → `com.hivearmor.*` (90+ files) | Sprint 2 |
| Maven pom.xml (3 pom files) | groupId, artifactId, app name, class names | Sprint 2 |
| Spring config YAMLs | app name, pool names, URLs, bootstrap name | Sprint 2 |
| Liquibase: table rename | 45+ tables `utm_` → `hive_` with full migration | Sprint 3 |
| OpenSearch: index prefix | `v11-` → `_v3_hive_` with re-index + alias migration | Sprint 3 |
| OpenSearch: ISM templates | `armorsight-*` → `hivearmor-*` | Sprint 3 |
| OpenSearch: cluster name | `nilachakra` → `hivearmor` | Sprint 3 |
| OpenSearch: geoip snapshot | `.utm_geoip` → `.ha_geoip` | Sprint 3 |
| Backend REST endpoints | 28 `/api/utm-*` → `/api/ha-*` with deprecation bridge | Sprint 4 |
| Backend HTTP error headers | `X-UtmStack-error`, `x-utmstack-params` → `X-HiveArmor-*` | Sprint 4 |
| Docker Compose (local-dev) | Image names, env vars, DB names, cluster names | Sprint 4 |
| Docker images (CI/CD) | Registry: `ghcr.io/utmstack/` → `ghcr.io/hivearmor/` | Sprint 4 |
| GitHub Actions workflows | Image names, org paths, binary names | Sprint 4 |
| Plugin binary names | `com.utmstack.*.plugin` → `com.hivearmor.*.plugin` | Sprint 5 |
| Plugin config keys | `plugin_com.utmstack.*` → `plugin_com.hivearmor.*` | Sprint 5 |
| YAML filter files | Plugin references in `filters/*.yml` | Sprint 5 |
| Event-processor strings | `armorsight-*` cache keys, queue names, service ID | Sprint 5 |
| Installer | All binary names, service names, config paths, URLs | Sprint 5 |
| frontend-v2 brand strings | `ArmorSight` → `HiveArmor` in all TSX/TS files | Sprint 6 |
| frontend-v2 localStorage keys | `utm_token`, `armorsight_*` → `hivearmor_*` | Sprint 6 |
| frontend-v2 API calls | `/api/utm-*` → `/api/ha-*` (once Sprint 4 deploys) | Sprint 6 |
| frontend-v2 package.json | name: `armorsight` → `hivearmor` | Sprint 6 |
| Angular frontend | DELETE entire `/frontend/` directory | Sprint 6 |
| CLAUDE.md + all .plan files | Update references | Sprint 6 |
| Cert/key filenames | `utm.crt`, `utm.key` → `ha.crt`, `ha.key` | Sprint 5 |
| Env vars | `UTMSTACK_TAG` → `HIVEARMOR_TAG`, `UTM_HOST` → `HA_HOST` | Sprint 4 |
| External URLs (installer) | `cm.utmstack.com`, `storage.googleapis.com/utmstack-updates` → HiveArmor URLs | Sprint 5 |

**Total scope:** ~700+ files, ~3000+ string replacements, 1 major DB migration, 1 OpenSearch re-index.

---

## Sprint 1 — Go Module Paths & Source Strings

**Pre-requisite:** Create GitHub org `hivearmor` and repo `hivearmor` (monorepo). Update remote.

### S1-A: Inline AtlasInsideAES dependency

**Why first:** Once we own the crypto code, no external brand in any package.

Files affected (6):
- `agent/utils/crypt.go`
- `agent-manager/utils/aes.go`
- `as400/config/config.go` and `as400/collector/config.go`
- `utmstack-collector/config/config.go`
- `plugins/feeds/utils/aes.go`
- `plugins/modules-config/crypto/crypto.go`

Action:
1. Create `shared/internal/crypto/aes.go` — copy the AES implementation from `github.com/AtlasInsideCorp/AtlasInsideAES`
2. Replace all 6 imports with `github.com/hivearmor/shared/internal/crypto`
3. Remove the AtlasInsideAES dependency from all affected `go.mod` files

### S1-B: Rename Go module paths

Run in every go.mod (28 files):
- `module github.com/encryptshellorg/nilachakra/<service>` → `module github.com/hivearmor/<service>`
- `replace github.com/encryptshellorg/nilachakra/shared` → `replace github.com/hivearmor/shared`

Then find-replace all import paths in all `.go` files:
```
github.com/encryptshellorg/nilachakra/ → github.com/hivearmor/
```

Special case — `plugins/inputs/go.mod`:
- `module github.com/hivearmor/plugins/utmstack-inputs` → rename directory to `plugins/inputs` and use `module github.com/hivearmor/plugins/inputs`

### S1-C: Go source string replacements

In all `.go` files, replace:

| Old | New |
|---|---|
| `"UTMStack"` (display names) | `"HiveArmor"` |
| `"utmstack"` (display names) | `"hivearmor"` |
| `utmstack_agent_service` | `hivearmor_agent_service` |
| `utmstack_updater_service` | `hivearmor_updater_service` |
| `utmstack_collector` | `hivearmor_collector` |
| `utmstack_as400_collector_service` | `hivearmor_as400_collector` |
| `UTMStackComponentsUpdater` | `HiveArmorUpdater` |
| `UTMStackModulesLogsCollector` | `HiveArmorCollector` |
| `UTMStackWindowsLogsCollector` | `HiveArmorWindowsCollector` |
| `UTMStackUpdater` | `HiveArmorUpdater` |
| `utmstack_agent.log` | `hivearmor_agent.log` |
| `utmstack_collector.log` | `hivearmor_collector.log` |
| `utmstack_as400_collector.log` | `hivearmor_as400.log` |
| `utmstack-updater.log` | `hivearmor-updater.log` |
| `utmstack.yml` (config path) | `hivearmor.yml` |
| `/root/utmstack.yml` | `/root/hivearmor.yml` |
| `/utmstack/` (dir paths) | `/hivearmor/` |
| `utmstack.db` | `hivearmor.db` |
| `utmstack.instance.data` | `hivearmor.instance.data` |
| `utmstack.intance.send.logs` | `hivearmor.instance.send.logs` (fix typo too) |
| `utmstack.mail.baseUrl` | `hivearmor.mail.baseUrl` |
| `utmstack.soc-ai` | `hivearmor.soc-ai` |
| `utmstack.alerts` | `hivearmor.alerts` |
| `utmstack.events` | `hivearmor.events` |
| `utmstack.stats` | `hivearmor.stats` |
| `utmstack_indexes` | `hivearmor_indexes` |
| `utmstack_node1` | `hivearmor_node1` |
| `utmstack_postgres` | `hivearmor_postgres` |
| `utm.crt` | `ha.crt` |
| `utm.key` | `ha.key` |
| `UTM_HOST` | `HA_HOST` |
| `cm.utmstack.com` | *(your Customer Manager URL or placeholder)* |
| `storage.googleapis.com/utmstack-updates/` | *(your GCS bucket URL or placeholder)* |
| `nilachakra` (in Go source strings) | `hivearmor` |
| `armorsight-event-processor` | `hivearmor-event-processor` |

### S1-D: Installer build script

Update `installer/build.sh`:
- `GOPRIVATE=github.com/hivearmor`
- All `-X github.com/hivearmor/...` ldflags
- Output binary: `hivearmor_installer`

### S1 Verification
```bash
# After replacements:
grep -r "nilachakra\|utmstack\|armorsight\|atlasinside" --include="*.go" . | grep -v "_test.go" | grep -v vendor
# Expected: 0 results (except go.sum hashes)

cd agent && go build ./...
cd agent-manager && go build ./...
cd shared && go build ./...
# All should compile cleanly
```

---

## Sprint 2 — Java Backend Package Rename

**Why a full package rename is needed:** Spring Boot auto-scans by package prefix. A find-replace of strings is not enough — directory structure must match the package name.

### S2-A: Backend `com.nilachakra` → `com.hivearmor`

This is a bulk operation. Steps:

1. **Rename directory tree:**
   ```bash
   # Move all source files
   find backend/src/main/java/com/nilachakra -name "*.java" | while read f; do
     newf="${f/com\/nilachakra/com\/hivearmor}"
     mkdir -p "$(dirname "$newf")"
     mv "$f" "$newf"
   done
   rmdir backend/src/main/java/com/nilachakra 2>/dev/null || true
   ```

2. **Replace all `package com.nilachakra` and `import com.nilachakra` declarations** in every `.java` file:
   ```
   package com.nilachakra → package com.hivearmor
   import com.nilachakra → import com.hivearmor
   ```

3. **Rename main class:** `UtmstackApp.java` → `HiveArmorApp.java`
   - File: `backend/src/main/java/com/hivearmor/HiveArmorApp.java`
   - Class declaration: `public class HiveArmorApp`
   - `ApplicationWebXml` extends `SpringBootServletInitializer` — update reference

4. **Update `backend/pom.xml`:**
   ```xml
   <groupId>com.hivearmor</groupId>
   <artifactId>hivearmor</artifactId>
   <name>HiveArmor-API</name>
   <start-class>com.hivearmor.HiveArmorApp</start-class>
   ```
   Remove the stale `com.atlasinside.utmstackcloud.domain` comment in Liquibase plugin config.

5. **Update `backend/src/main/jib/entrypoint.sh`:**
   ```
   com.hivearmor.HiveArmorApp
   ```

6. **Update Spring config YAMLs:**
   - `application.yml`: `spring.application.name: HiveArmor-API`, `thread-name-prefix: hivearmor-api-scheduling-`, `support-url: https://hivearmor.io/contact`, `docs-url: https://docs.hivearmor.io`
   - `application-dev.yml`: `poolName: HiveArmor-HikariCP-dev`, logger `com.hivearmor: debug`
   - `application-prod.yml`: `poolName: HiveArmor-HikariCP`, `frontend-url: ${APP_FRONTEND_URL:https://app.hivearmor.io}`, logger `com.hivearmor: info`
   - `bootstrap.yml` and `bootstrap-prod.yml`: `name: hivearmor`

7. **Update `HeaderUtil.java`:**
   ```java
   private static final String APPLICATION_NAME = "HiveArmor";
   ```
   This changes the `X-UtmStack-error` header to `X-HiveArmor-error` — coordinate with Sprint 4 and Sprint 6.

### S2-B: user-auditor `com.utmstack.userauditor` → `com.hivearmor.userauditor`

Same process as S2-A but for `user-auditor/src/main/java/`:
- Move files: `com/utmstack/userauditor` → `com/hivearmor/userauditor`
- Replace all package/import declarations
- Update `user-auditor/pom.xml` groupId, artifactId

### S2-C: web-pdf `com.utmstack.webtopdf` → `com.hivearmor.webtopdf`

Same process as S2-A but for `web-pdf/src/main/java/`:
- Move files: `com/utmstack/webtopdf` → `com/hivearmor/webtopdf`
- Replace all package/import declarations
- Update `web-pdf/pom.xml` groupId, artifactId

### S2-D: Rename WAR artifact

`backend/Dockerfile`:
```dockerfile
COPY target/utmstack.war /app/hivearmor.war
CMD ["java", "-jar", "/app/hivearmor.war"]
```
Also update `backend/Dockerfile` COPY paths:
```
COPY filters /hivearmor/filters
COPY rules /hivearmor/rules
```

### S2 Verification
```bash
cd backend && mvn -s settings.xml -B -DskipTests clean package
# Should produce target/hivearmor.war
grep -r "com\.nilachakra\|com\.utmstack\|com\.atlasinside\|com\.park" --include="*.java" backend/
# Expected: 0 results
```

---

## Sprint 3 — Database & OpenSearch Migration

> **CRITICAL:** This sprint runs on a live system. Test on a dev copy first. Take full backups before running.

### S3-A: PostgreSQL Table Rename (utm_ → hive_)

This requires Liquibase changesets — one per table. **Do NOT edit existing changesets.** Add new ones.

Create file: `backend/src/main/resources/config/liquibase/changelog/20260712001_rebrand_utm_to_hive_tables.xml`

Each table needs:
```xml
<changeSet id="20260712001-rename-utm-alert-to-hive-alert" author="hivearmor">
    <renameTable oldTableName="utm_alert_response_rule" newTableName="hive_alert_response_rule"/>
</changeSet>
```

**Complete list of tables to rename (45 tables):**

| Old Name | New Name |
|---|---|
| `utm_agent_group` | `hive_agent_group` |
| `utm_agent_group_member` | `hive_agent_group_member` |
| `utm_agent_policy` | `hive_agent_policy` |
| `utm_agent_policy_state` | `hive_agent_policy_state` |
| `utm_ai_triage` | `hive_ai_triage` |
| `utm_alert_response_rule` | `hive_alert_response_rule` |
| `utm_compliance_control_config` | `hive_compliance_control_config` |
| `utm_compliance_query_config` | `hive_compliance_query_config` |
| `utm_compliance_report_export` | `hive_compliance_report_export` |
| `utm_compliance_report_schedule` | `hive_compliance_report_schedule` |
| `utm_configuration_parameter` | `hive_configuration_parameter` |
| `utm_configuration_section` | `hive_configuration_section` |
| `utm_correlation_rule_version` | `hive_correlation_rule_version` |
| `utm_correlation_rules` | `hive_correlation_rules` |
| `utm_data_input_status` | `hive_data_input_status` |
| `utm_data_input_status_checkpoint` | `hive_data_input_status_checkpoint` |
| `utm_data_source_config` | `hive_data_source_config` |
| `utm_data_types` | `hive_data_types` |
| `utm_edr_event` | `hive_edr_event` |
| `utm_edr_isolation` | `hive_edr_isolation` |
| `utm_edr_quarantine` | `hive_edr_quarantine` |
| `utm_edr_rule` | `hive_edr_rule` |
| `utm_group_rules_data_type` | `hive_group_rules_data_type` |
| `utm_identity_provider_config` | `hive_identity_provider_config` |
| `utm_incident` | `hive_incident` |
| `utm_incident_variables` | `hive_incident_variables` |
| `utm_ioc_indicator` | `hive_ioc_indicator` |
| `utm_logstash_filter` | `hive_logstash_filter` |
| `utm_menu` | `hive_menu` |
| `utm_menu_authority` | `hive_menu_authority` |
| `utm_module` | `hive_module` |
| `utm_module_group_configuration` | `hive_module_group_configuration` |
| `utm_notification` | `hive_notification` |
| `utm_notification_channel` | `hive_notification_channel` |
| `utm_notification_route` | `hive_notification_route` |
| `utm_playbook` | `hive_playbook` |
| `utm_playbook_execution` | `hive_playbook_execution` |
| `utm_policy_group_assignment` | `hive_policy_group_assignment` |
| `utm_policy_push_log` | `hive_policy_push_log` |
| `utm_regex_pattern` | `hive_regex_pattern` |
| `utm_rule_push_log` | `hive_rule_push_log` |
| `utm_search_acceleration` | `hive_search_acceleration` |
| `utm_tenant_config` | `hive_tenant_config` |
| `utm_threat_feed` | `hive_threat_feed` |
| `utm_uba_anomaly` | `hive_uba_anomaly` |
| `utm_uba_entity_risk` | `hive_uba_entity_risk` |
| `utm_visualization` | `hive_visualization` |

Also rename user-auditor tables (separate service, separate Liquibase):
- `utm_user_source` → `hive_user_source`
- `utm_user` → `hive_user`
- `utm_user_attribute` → `hive_user_attribute`
- `utm_source_scan` → `hive_source_scan`
- `utm_source_filter` → `hive_source_filter`

Also update installer table:
- `utm_client` → `hive_client`

**After schema migration — update all JPA entity `@Table` annotations:**
Every `@Entity` class in `com.hivearmor.domain.*` that has `@Table(name = "utm_*")` needs to be updated to `@Table(name = "hive_*")`.

**Grep for all table annotations:**
```bash
grep -r '@Table(name = "utm_' --include="*.java" backend/src/main/java/
```

### S3-B: PostgreSQL database rename

New deployments use `hivearmor` as the DB name. Existing deployments:
```sql
-- Run as postgres superuser
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'nilachakra';
ALTER DATABASE nilachakra RENAME TO hivearmor;
```

Update all references:
- `local-dev/docker-compose.yml`: `DB_NAME=hivearmor` (backend, event-processor)
- `local-dev/.env.example`: `POSTGRES_DB=hivearmor`
- `event-processor/config/env.go`: `getEnv("POSTGRESQL_DB", "hivearmor")`
- `installer/docker/compose.go`: database name references
- `installer/services/postgres.go`: `CREATE DATABASE hivearmor`
- `backend/run-sql-injection-tests.sh`: `export DB_NAME=hivearmor`

Agent-manager and user-auditor databases: rename `agentmanager` → `hivearmor_agents`, `userauditor` → `hivearmor_auditor` (or keep as-is — these are internal names with no user exposure).

### S3-C: OpenSearch Index Migration (`v11-` → `_v3_hive_`)

> **This is the most complex migration.** The index prefix appears in backend queries, event-processor, frontend, plugins. It must be changed atomically.

**New index naming pattern:** `_v3_hive_<type>-YYYY.MM.DD`

Examples:
- `_v3_hive_alert-2026.07.12`
- `_v3_hive_log-syslog-2026.07.12`
- `_v3_hive_offense-2026.07.12`
- `_v3_hive_statistics-2026.07.12`
- `_v3_hive_lookup-assets`
- `_v3_hive_baselines-2026.07.12`

**Migration approach — alias-based (zero downtime):**

Step 1: Deploy new index templates with `_v3_hive_*` mappings (using updated `tools/index-mappings/main.go`)

Step 2: Create read aliases pointing old `v11-*` indices to `_v3_hive_*` read alias names:
```json
POST /_aliases
{
  "actions": [
    { "add": { "index": "v11-alert-*", "alias": "_v3_hive_alert-alias" } }
  ]
}
```

Step 3: New data writes go to `_v3_hive_*` indices immediately after deploying updated event-processor

Step 4: Re-index historical data with `_reindex` API (can run in background, batch by date)

Step 5: Once re-index complete, remove `v11-*` aliases and old indices

**All code locations with `v11-` prefix that must change:**

In backend Java (`backend/src/main/java/`):
- `grep -r '"v11-"' --include="*.java"` → replace all occurrences
- `grep -r '"v11-' --include="*.java"` → index constant files
- Look for `UtmIndexName.java`, `ElasticSearchConst.java`, or similar constant classes

In event-processor (Go):
- `grep -r 'v11-' --include="*.go" event-processor/`
- Replace all index name constants

In plugins (Go):
- `grep -r 'v11-' --include="*.go" plugins/`

In frontend-v2 (TypeScript):
- `grep -r 'v11-' --include="*.ts" --include="*.tsx" frontend-v2/src/`

In installer:
- `grep -r 'v11-' --include="*.go" installer/`
- `utmstack_indexes` template name → `hivearmor_indexes`

In YAML rules and filters:
- `grep -r 'v11-' rules/ filters/`

### S3-D: OpenSearch ISM Templates & Policies

Update `tools/index-mappings/main.go`:

| Old | New |
|---|---|
| `armorsight-log-template` | `hivearmor-log-template` |
| `armorsight-alert-template` | `hivearmor-alert-template` |
| `armorsight-risk-template` | `hivearmor-risk-template` |
| `armorsight-offense-template` | `hivearmor-offense-template` |
| `armorsight-lookup-template` | `hivearmor-lookup-template` |
| `armorsight-baseline-template` | `hivearmor-baseline-template` |
| `armorsight-lifecycle` | `hivearmor-lifecycle` |
| `.utm_geoip` | `.ha_geoip` |
| `.utm-` | `.ha-` |
| `.utmstack-` | `.hivearmor-` |

Also update `etc/opensearch/2.x/Dockerfile`:
- `.utm_geoip` folder → `.ha_geoip`
- CDN URL for geoip → HiveArmor CDN URL (or self-hosted)

### S3-E: OpenSearch cluster name

In `local-dev/docker-compose.yml` and `installer/docker/compose.go`:
```
cluster.name=nilachakra → cluster.name=hivearmor
```

### S3 Verification
```bash
# After DB migration
psql -U postgres -c "\l" | grep hivearmor
psql -U postgres -d hivearmor -c "\dt hive_*" | wc -l
# Should show 45+ tables

# After OpenSearch migration
curl -sk -u admin:LocalDev@2024! https://localhost:9200/_cat/indices/_v3_hive_* | head -5
# Should show new index pattern
```

---

## Sprint 4 — REST API Rebrand & Docker/CI

### S4-A: Backend REST endpoint rename

**28 endpoints:** `/api/utm-*` → `/api/ha-*`

**Strategy — deprecation bridge (backwards compatible):**
1. Update all `@RequestMapping("/api/utm-<name>")` → `@RequestMapping("/api/ha-<name>")`
2. Add `@RequestMapping("/api/utm-<name>")` as a secondary mapping with `@Deprecated` comment on same controller — this keeps old Angular frontend working during transition
3. Remove the old mapping in Sprint 6 when Angular is deleted

Complete mapping:

| Old | New |
|---|---|
| `/api/utm-alert-response-rules` | `/api/ha-alert-response-rules` |
| `/api/utm-alert-tags` | `/api/ha-alert-tags` |
| `/api/utm-alerts` | `/api/ha-alerts` |
| `/api/utm-asset-groups` | `/api/ha-asset-groups` |
| `/api/utm-auditor-users-by-src` | `/api/ha-auditor-users-by-src` |
| `/api/utm-collectors` | `/api/ha-collectors` |
| `/api/utm-compliance-report-config` | `/api/ha-compliance-report-config` |
| `/api/utm-compliance-schedule` | `/api/ha-compliance-schedule` |
| `/api/utm-configuration-groups` | `/api/ha-configuration-groups` |
| `/api/utm-configuration-parameters` | `/api/ha-configuration-parameters` |
| `/api/utm-configuration-sections` | `/api/ha-configuration-sections` |
| `/api/utm-dashboard-visualizations` | `/api/ha-dashboard-visualizations` |
| `/api/utm-dashboards` | `/api/ha-dashboards` |
| `/api/utm-data-input-statuses` | `/api/ha-data-input-statuses` |
| `/api/utm-filters` | `/api/ha-filters` |
| `/api/utm-getting-started` | `/api/ha-getting-started` |
| `/api/utm-incident-alerts` | `/api/ha-incident-alerts` |
| `/api/utm-incident-jobs` | `/api/ha-incident-jobs` |
| `/api/utm-incident-variables` | `/api/ha-incident-variables` |
| `/api/utm-incidents` | `/api/ha-incidents` |
| `/api/utm-index-patterns` | `/api/ha-index-patterns` |
| `/api/utm-integrations` | `/api/ha-integrations` |
| `/api/utm-logstash-filter-groups` | `/api/ha-logstash-filter-groups` |
| `/api/utm-modules` | `/api/ha-modules` |
| `/api/utm-network-scans` | `/api/ha-network-scans` |
| `/api/utm-report-sections` | `/api/ha-report-sections` |
| `/api/utm-reports` | `/api/ha-reports` |
| `/api/utm-server-modules` | `/api/ha-server-modules` |
| `/api/utm-visualizations` | `/api/ha-visualizations` |
| `/api/utm-providers` | `/api/ha-providers` |

### S4-B: HTTP headers

In `HeaderUtil.java` (already updated in Sprint 2):
- `X-UtmStack-error` header is derived from `APPLICATION_NAME = "HiveArmor"` → becomes `X-HiveArmor-error`
- `x-utmstack-params` → `x-hivearmor-params` (update frontend-v2 proxy in Sprint 6)

Note: After Sprint 2 changed `APPLICATION_NAME`, the header name changes automatically. No additional code change needed here.

### S4-C: Environment variables

| Old | New |
|---|---|
| `UTMSTACK_TAG` | `HIVEARMOR_TAG` |
| `UTM_HOST` | `HA_HOST` |
| `INPUTS_SOCKET_SECRET` | keep (not branded) |
| `EVENTPROCESSOR_INJECT_KEY` | `HA_PROCESSOR_KEY` |
| `INTERNAL_KEY` | keep (not branded) |
| `ENCRYPTION_KEY` | keep (not branded) |

Update in:
- `local-dev/docker-compose.yml` — all service env blocks
- `local-dev/.env.example`
- `agent-manager/config/global_const.go`: `os.Getenv("UTM_HOST")` → `os.Getenv("HA_HOST")`
- `installer/docker/compose.go` — all env var references
- `installer/docker/stack.go` — `UTMSTACK_TAG` references

### S4-D: Docker Compose local-dev

In `local-dev/docker-compose.yml`:
```yaml
# Image renames (locally built services):
nilachakra/agent-manager:local → hivearmor/agent-manager:local
nilachakra/backend:local → hivearmor/backend:local
nilachakra/frontend-v2:local → hivearmor/frontend-v2:local
nilachakra/event-processor:local → hivearmor/event-processor:local

# Upstream images (temporary — until you build these yourself in Sprint 5):
ghcr.io/utmstack/utmstack/postgres:latest → keep or pin to a version while you build your own
ghcr.io/utmstack/utmstack/opensearch:latest → keep or pin
ghcr.io/utmstack/utmstack/eventprocessor:${HIVEARMOR_TAG} → hivearmor/event-processor:local (yours)
ghcr.io/utmstack/utmstack/user-auditor:${HIVEARMOR_TAG} → ghcr.io/hivearmor/user-auditor:${HIVEARMOR_TAG} (Sprint 5)
ghcr.io/utmstack/utmstack/web-pdf:${HIVEARMOR_TAG} → ghcr.io/hivearmor/web-pdf:${HIVEARMOR_TAG} (Sprint 5)

# Volume/path renames:
ep_rules:/workdir/rules/nilachakra → ep_rules:/workdir/rules/hivearmor
```

Remove the `frontend` (Angular) service entry from docker-compose — deletion happens in Sprint 6 but the service can be removed from compose now.

### S4-E: GitHub Actions CI/CD

In `.github/workflows/v11-deployment-pipeline.yml`:
- Rename to `hivearmor-deployment-pipeline.yml`
- Registry login: `ghcr.io` with `hivearmor` org token
- All `ghcr.io/utmstack/utmstack/${{inputs.image_name}}` → `ghcr.io/hivearmor/${{inputs.image_name}}`
- All `UTMSTACK_TAG` → `HIVEARMOR_TAG`
- Binary names: all `utmstack_*` → `hivearmor_*`
- Artifact name: `utmstack-collectors` → `hivearmor-collectors`

In `reusable-golang.yml`:
- `go build -o com.utmstack.<name>.plugin` → `go build -o com.hivearmor.<name>.plugin`

In `reusable-java.yml`:
- Image registry path → `ghcr.io/hivearmor/`

In `pr-checks.yml`:
- Update target branch patterns if renamed

### S4 Verification
```bash
# Test new API endpoint names
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/ha-dashboards | head -1
# Should return JSON, not 404

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/utm-dashboards | head -1
# Should return JSON with "Deprecation" response header
```

---

## Sprint 5 — Go Services: Plugins, Event-Processor, Installer & Own Stack

### S5-A: Plugin binary names

In every `plugins/*/main.go`:
```go
// Old pattern:
plugins.GetCfg("plugin_com.utmstack.<name>")
plugins.PluginCfg("com.utmstack")
// New:
plugins.GetCfg("plugin_com.hivearmor.<name>")
plugins.PluginCfg("com.hivearmor")
```

Rename plugin binary output names:
```
com.utmstack.alerts.plugin → com.hivearmor.alerts.plugin
com.utmstack.aws.plugin → com.hivearmor.aws.plugin
com.utmstack.azure.plugin → com.hivearmor.azure.plugin
com.utmstack.bitdefender.plugin → com.hivearmor.bitdefender.plugin
com.utmstack.config.plugin → com.hivearmor.config.plugin
com.utmstack.crowdstrike.plugin → com.hivearmor.crowdstrike.plugin
com.utmstack.events.plugin → com.hivearmor.events.plugin
com.utmstack.feeds.plugin → com.hivearmor.feeds.plugin
com.utmstack.gcp.plugin → com.hivearmor.gcp.plugin
com.utmstack.geolocation.plugin → com.hivearmor.geolocation.plugin
com.utmstack.inputs.plugin → com.hivearmor.inputs.plugin
com.utmstack.modules-config.plugin → com.hivearmor.modules-config.plugin
com.utmstack.o365.plugin → com.hivearmor.o365.plugin
com.utmstack.soc-ai.plugin → com.hivearmor.soc-ai.plugin
com.utmstack.sophos.plugin → com.hivearmor.sophos.plugin
com.utmstack.stats.plugin → com.hivearmor.stats.plugin
```

Update `event_processor.Dockerfile` — all `COPY` destinations use new binary names.

Update `plugins/compliance-orchestrator` — add to `event_processor.Dockerfile` (it was omitted from the original).

### S5-B: YAML filters update

In `filters/*.yml`, every reference to plugin names:
```yaml
plugin: com.utmstack.geolocation → plugin: com.hivearmor.geolocation
plugin: com.utmstack.feeds → plugin: com.hivearmor.feeds
# etc. for all 16 plugins
```

Run: `grep -r "com.utmstack" filters/` to get full list, then bulk replace.

### S5-C: Event-processor strings

In `event-processor/`:
```go
"armorsight-event-processor" → "hivearmor-event-processor"
"com.armorsight.pipeline" → "com.hivearmor.pipeline"
"com.armorsight.sequence" → "com.hivearmor.sequence"
"com.armorsight.rules" → "com.hivearmor.rules"
"armorsight-events" → "hivearmor-events"
```

Test socket names in `event-processor/` tests:
```
test_armorsight_auth.sock → test_hivearmor_auth.sock
test_armorsight_hs.sock → test_hivearmor_hs.sock
test_armorsight_wrong.sock → test_hivearmor_wrong.sock
```

Also rename `ep_rules:/workdir/rules/nilachakra` → `ep_rules:/workdir/rules/hivearmor` (also done in S4-D).

### S5-D: Installer full rebrand

In `installer/`:

Config constants (`installer/config/const.go`):
```go
utmstack_installer → hivearmor_installer
/root/utmstack.yml → /root/hivearmor.yml
cm.utmstack.com → (your customer manager URL)
cm.dev.utmstack.com → (your dev customer manager URL)
storage.googleapis.com/utmstack-updates/ → (your GCS or CDN URL)
```

Nginx templates (`installer/templates/`):
```
$utmstack_backend → $ha_backend
$utmstack_agent_manager → $ha_agent_manager
$utmstack_backend_auth → $ha_backend_auth
$utmstack_ws → $ha_ws
$utmstack → $ha
```

Docker compose generation (`installer/docker/compose.go`, `stack.go`):
- All `ghcr.io/utmstack/utmstack/` → `ghcr.io/hivearmor/`
- All `nilachakra/` local image references → `hivearmor/`
- `UTMSTACK_TAG` → `HIVEARMOR_TAG`
- DB/cluster names as per S3

OpenSearch template creation (`installer/services/search.go`):
- `utmstack_indexes` → `hivearmor_indexes`
- `.utm_geoip` → `.ha_geoip`
- `.utm-*` patterns → `.ha-*`

### S5-E: Build your own Postgres, OpenSearch images

The current dependency on `ghcr.io/utmstack/utmstack/postgres` and `ghcr.io/utmstack/utmstack/opensearch` is the last hard dependency on UTMStack's infrastructure.

**Plan for zero upstream dependency:**

1. **Postgres image:** Build from `postgres:16-alpine` official image. Add only:
   - Custom init SQL for `hivearmor` database creation
   - Your SSL cert if needed
   - Publish as `ghcr.io/hivearmor/postgres:latest`

2. **OpenSearch image:** Build from `opensearchproject/opensearch:2.18.0` official image. Add:
   - Your custom security plugin config
   - Geoip snapshot setup (`.ha_geoip`)
   - Publish as `ghcr.io/hivearmor/opensearch:latest`
   - Source: base `etc/opensearch/2.x/Dockerfile` updated with new names

3. **user-auditor image:** After S2-B, build from your own source. Publish as `ghcr.io/hivearmor/user-auditor:latest`

4. **web-pdf image:** After S2-C, build from your own source. Publish as `ghcr.io/hivearmor/web-pdf:latest`

At the end of Sprint 5, the `local-dev/docker-compose.yml` should have zero `ghcr.io/utmstack/` references.

### S5 Verification
```bash
# Plugins build
cd plugins/alerts && go build -o com.hivearmor.alerts.plugin .
cd plugins/events && go build -o com.hivearmor.events.plugin .
# etc.

# Check no utmstack plugin references remain
grep -r "com\.utmstack" plugins/ event-processor/ filters/
# Expected: 0 results

# Event processor starts
cd event-processor && go build ./...
```

---

## Sprint 6 — Frontend Rebrand & Angular Deletion

### S6-A: frontend-v2 display strings

Bulk replace in `frontend-v2/src/`:
```
"ArmorSight" → "HiveArmor"
"ArmorSight — Enterprise SIEM & XDR" → "HiveArmor — Hyper-scale Incident Visibility Engine"
"ArmorSight Labs" → "HiveArmor Labs"
"ArmorSight Security Operations" → "HiveArmor Security Operations"
"Search ArmorSight..." → "Search HiveArmor..."
"armorsight.io" → "hivearmor.io"
"armorsight-config.json" → "hivearmor-config.json"
"armorsight-audit-*.csv" → "hivearmor-audit-*.csv"
"armorsight-rules.yml" → "hivearmor-rules.yml"
"utmstack-dark" (ECharts theme) → "hivearmor-dark"
"UTM_NATIVE" (rule format enum) → "HA_NATIVE"
"UTMSTACK" (collector module enum) → "HIVEARMOR"
```

### S6-B: frontend-v2 localStorage keys

Replace in all TypeScript files:
```
"utm_token" → "hivearmor_auth_token"
"armorsight_theme" → "hivearmor_theme"
"armorsight_first_login" → "hivearmor_first_login"
"armorsight_log_history" → "hivearmor_log_history"
"armorsight_log_tabs" → "hivearmor_log_tabs"
"armorsight_saved_starred" → "hivearmor_saved_starred"
"armorsight-sidebar" → "hivearmor-sidebar"
"armorsight-theme" → "hivearmor-theme"
```

> **Note:** localStorage key renames will log out existing users on first load after deploy. This is expected and acceptable. For production, add a one-time migration in the app startup that reads old keys and writes to new ones before clearing.

### S6-C: frontend-v2 API endpoint calls

Update all 28 `/api/utm-*` paths to `/api/ha-*` in `frontend-v2/src/services/`:
```
/api/utm-alerts → /api/ha-alerts
/api/utm-dashboards → /api/ha-dashboards
# etc. — full list in Sprint 4 table
```

### S6-D: frontend-v2 HTTP header proxy

In `frontend-v2/src/app/api/[...path]/route.ts`:
```typescript
// Replace forwarded header names:
"x-utmstack-error" → "x-hivearmor-error"
"x-utmstack-params" → "x-hivearmor-params"
```

### S6-E: frontend-v2 package.json

```json
{
  "name": "hivearmor",
  "description": "HiveArmor — Hyper-scale Incident Visibility Engine"
}
```

### S6-F: Delete Angular frontend

1. do not Remove `frontend/` directory entirely, I will remove it later.
2. Remove `frontend` service from `local-dev/docker-compose.yml`
3. Remove `frontend` build from GitHub Actions pipeline
4. Remove Angular-related entries from `CLAUDE.md`
5. Update the root `README.md`

This removes ~500 files and eliminates the entire legacy Angular codebase.

### S6-G: Remove backend deprecation bridges

Remove the `/api/utm-*` secondary mappings added in Sprint 4 — the Angular frontend is now gone, so the bridges are no longer needed.

### S6-H: Update documentation

Update these files with HiveArmor branding:
- `CLAUDE.md` — update all UTMStack/NilaChakra/ArmorSight references
- `.plan/MASTER_PLAN.md` — update header
- `.plan/PROMPTS_INDEX.md` — update paths if any changed
- `AGENTS.md` — update build commands, binary names
- `README.md` — full rebrand

### S6 Verification
```bash
# No old brand strings in frontend-v2
grep -r "ArmorSight\|armorsight\|utm_token\|utmstack" --include="*.ts" --include="*.tsx" frontend-v2/src/
# Expected: 0 results

# frontend-v2 builds cleanly
cd frontend-v2 && npm run build
# No brand warnings

# Angular directory is gone
ls frontend/
# Expected: No such file or directory
```

---

## Final Verification — Complete Brand Audit

Run after all sprints complete:

```bash
# Master brand grep — should return 0 results in source code
grep -rn \
  --include="*.go" \
  --include="*.java" \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.yml" \
  --include="*.yaml" \
  --include="*.json" \
  --include="*.xml" \
  --include="*.sh" \
  --include="*.dockerfile" \
  --include="Dockerfile" \
  -i \
  "utmstack\|nilachakra\|armorsight\|atlasinside\|com\.park\|utm_token\|utm-alert\|utm-dashboard\|utm-incident" \
  --exclude-dir=".git" \
  --exclude-dir="vendor" \
  --exclude-dir="node_modules" \
  . | grep -v "go.sum\|package-lock.json"
```

```bash
# Liquibase validation (no broken changesets)
cd backend && mvn -s settings.xml liquibase:validate

# Full backend build
cd backend && mvn -s settings.xml -B -DskipTests clean package

# All Go modules build
for dir in agent agent-manager utmstack-collector as400 event-processor installer shared; do
  echo "Building $dir..."
  (cd $dir && go build ./...) && echo "OK" || echo "FAILED: $dir"
done

# Frontend build
cd frontend-v2 && npm run build && npm run lint

# Docker stack starts
cd local-dev && docker compose down -v && docker compose up -d
sleep 30
curl -s http://localhost:3000 | grep "HiveArmor"
curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('AUTH OK' if d.get('id_token') else 'AUTH FAILED')"
```

---

## Sprint Summary

| Sprint | Focus | Risk | Est. Time |
|---|---|---|---|
| S1 | Go module paths + source strings | Low — string replacements, compile-verified | 2–3 days |
| S2 | Java package rename (400+ files) | Medium — directory restructure, needs careful IDE refactor | 2–3 days |
| S3 | DB table rename + OpenSearch re-index | **HIGH** — live data, requires backup + migration run | 3–4 days |
| S4 | REST API rename + Docker/CI | Medium — API bridge reduces risk | 2 days |
| S5 | Plugins, event-processor, installer, own images | Medium — plugin binary names must match exactly | 2–3 days |
| S6 | Frontend rebrand + Angular deletion | Low — mostly string replacement | 1–2 days |

**Total estimated effort:** 12–17 developer days (using AI-assisted development)

---

## AI Development Notes (Claude Code Session Prompts)

### Sprint 1 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 1 section.
Goal: Rename all Go module paths from github.com/encryptshellorg/nilachakra/ to github.com/hivearmor/
and replace all brand strings in Go source files.
Start with: S1-A (inline AtlasInsideAES into shared/internal/crypto/aes.go)
Then: S1-B (update all go.mod files)
Then: S1-C (bulk string replacements in .go files)
Verify: go build ./... passes for agent, agent-manager, shared, event-processor
```

### Sprint 2 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 2 section.
Goal: Rename Java package com.nilachakra → com.hivearmor across 400+ files.
Use IDE-style bulk rename: move directory structure, update package/import declarations.
Also rename: com.utmstack.userauditor → com.hivearmor.userauditor, com.utmstack.webtopdf → com.hivearmor.webtopdf
Update pom.xml files (3 total). Rename WAR artifact to hivearmor.war.
Verify: mvn -s settings.xml -B -DskipTests clean package succeeds.
```

### Sprint 3 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 3 section.
Goal: Liquibase table renames (utm_ → hive_), PostgreSQL DB rename, OpenSearch index migration.
WARNING: This modifies live data. First verify a full DB backup exists.
Step 1: Create Liquibase changeset file 20260712001_rebrand_utm_to_hive_tables.xml (45 tables).
Step 2: Update all @Table(name="utm_*") JPA annotations in backend Java.
Step 3: Update DB name references in docker-compose, event-processor, installer.
Step 4: Update OpenSearch index constants in all services.
Step 5: Update tools/index-mappings/main.go with hivearmor ISM templates.
Verify: liquibase:validate passes, new tables exist, old aliases work.
```

### Sprint 4 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 4 section.
Goal: Rename 28 REST endpoints /api/utm-* → /api/ha-*, update env vars, update Docker Compose, update CI.
Keep /api/utm-* as deprecated secondary mappings for one sprint.
Update HeaderUtil.java APPLICATION_NAME → "HiveArmor".
Rename UTMSTACK_TAG → HIVEARMOR_TAG, UTM_HOST → HA_HOST everywhere.
Verify: both /api/ha-dashboards and /api/utm-dashboards return 200.
```

### Sprint 5 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 5 section.
Goal: Rename plugin binaries com.utmstack.*.plugin → com.hivearmor.*.plugin, update event-processor
strings, update installer, update filters YAML, build own Postgres/OpenSearch Docker images.
Start with filters/*.yml plugin references (fast), then plugins/*/main.go, then event-processor, then installer.
Build: event_processor.Dockerfile with new plugin names.
Verify: all plugins compile, event-processor starts, no utmstack refs in Go source.
```

### Sprint 6 Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 6 section.
Goal: Complete frontend-v2 rebrand (ArmorSight → HiveArmor, localStorage keys, API paths, headers),
Do not DELETE the entire /frontend/ Angular directory,I will delete that later, remove deprecated /api/utm-* bridges from backend.
Update CLAUDE.md, AGENTS.md, README.md.
Verify: grep finds 0 old brand strings in source, frontend-v2 builds clean, docker stack starts, login works.
```

---

## Post-Rebrand: Zero UTMStack Dependency Checklist

- [ ] No `ghcr.io/utmstack/` image references anywhere
- [ ] No `cm.utmstack.com` or `storage.googleapis.com/utmstack-updates` URLs (replace with HiveArmor infra)
- [ ] No `github.com/AtlasInsideCorp/` imports
- [ ] No `github.com/utmstack/` or `github.com/encryptshellorg/nilachakra/` module paths
- [ ] Own Postgres image published to `ghcr.io/hivearmor/postgres`
- [ ] Own OpenSearch image published to `ghcr.io/hivearmor/opensearch`
- [ ] Own user-auditor built from source
- [ ] Own web-pdf built from source
- [ ] Event-processor fully owned and built from source
- [ ] All CI/CD pipelines publish to `ghcr.io/hivearmor/`
- [ ] CLAUDE.md reflects new brand everywhere
- [ ] No `frontend/` Angular directory in repo

---

## Sprint 7 — Remaining Gaps (Post-Audit, 2026-07-12)

Post-completion audit found three batches of missed items. Sprint 7 closes them.

---

## Sprint 7A — Critical Code Fixes (Breaking if Left)

### S7A-1: Protobuf enum rename + regenerate `.pb.go`

The `UTMSTACK` enum value in all proto files is still old branding AND will mismatch when re-generated.

**Files to edit:**
- `agent-manager/protos/collector.proto:22`
- `backend/src/main/proto/collector.proto:22`
- `plugins/inputs/protos/collector.proto:22`

Change in each:
```protobuf
// Old:
UTMSTACK = 1;
// New:
HIVEARMOR = 1;
```

**Then regenerate all `.pb.go` files:**
```bash
# agent-manager
cd agent-manager
protoc --go_out=. --go-grpc_out=. protos/collector.proto
# Repeat for agent.proto, common.proto, ping.proto

# utmstack-collector (or hivearmor-collector after S7B rename)
cd utmstack-collector
protoc --go_out=. --go-grpc_out=. protos/collector.proto

# backend (Maven runs protoc via plugin)
cd backend && mvn -s settings.xml generate-sources
```

> **Coordinated deploy required:** agent-manager + backend + collector must all be deployed together after this change, since the enum wire value is an integer (1) and the name change doesn't break the wire protocol — but the Go constant name `CollectorModule_UTMSTACK` will disappear. Any code referencing `CollectorModule_UTMSTACK` by name must be updated to `CollectorModule_HIVEARMOR`.

**Update all Go code referencing the old constant name:**
```bash
grep -rn "CollectorModule_UTMSTACK" --include="*.go" . | grep -v ".pb.go"
# Replace all matches with CollectorModule_HIVEARMOR
```

### S7A-2: Backend native `@Query` table names

After Sprint 3 renamed the DB tables from `utm_*` to `hive_*`, these native SQL queries will fail at runtime because JPA executes them verbatim against the DB.

Files to fix (replace `utm_` → `hive_` in SQL strings only — do not change Java class names):

| File | Tables to update |
|---|---|
| `backend/src/main/java/com/hivearmor/repository/UtmAlertTagRuleRepository.java:22` | `utm_alert_tag_rule` → `hive_alert_tag_rule` |
| `backend/src/main/java/com/hivearmor/repository/UtmMenuRepository.java:25` | `utm_menu` → `hive_menu` |
| `backend/src/main/java/com/hivearmor/repository/network_scan/UtmNetworkScanRepository.java:127-135` | `utm_data_input_status` → `hive_data_input_status`, `utm_network_scan` → `hive_network_scan` |
| `backend/src/main/java/com/hivearmor/repository/compliance/UtmComplianceStandardSectionRepository.java:22` | `utm_compliance_standard_section` → `hive_compliance_standard_section`, `utm_compliance_report_config` → `hive_compliance_report_config` |
| `backend/src/main/java/com/hivearmor/repository/logstash_filter/UtmLogstashFilterRepository.java:25,40-41` | `utm_logstash_filter` → `hive_logstash_filter`, `utm_group_logstash_pipeline_filters` → `hive_group_logstash_pipeline_filters` |
| `backend/src/main/java/com/hivearmor/repository/index_pattern/UtmIndexPatternRepository.java:25` | `utm_index_pattern` → `hive_index_pattern` |
| `backend/src/main/java/com/hivearmor/util/CorrelationRulesIdGenerator.java:47` | `utm_correlation_rules_id_seq` → `hive_correlation_rules_id_seq` |
| `backend/src/main/java/com/hivearmor/service/collectors/CollectorOpsService.java:270` | `utm_collectors` → `hive_collectors` |

Also do a broader scan to ensure no other native queries were missed:
```bash
grep -rn '".*utm_' --include="*.java" backend/src/main/java/ | grep -v "//\|rename\|oldTable"
```

### S7A-3: User-auditor `@Table` annotations

These 5 entity files still have `utm_` table names. After the Liquibase rename changeset runs in user-auditor's DB, these will break:

- `user-auditor/src/main/java/com/hivearmor/userauditor/model/User.java:13`
  — `@Table(name = "utm_user")` → `@Table(name = "hive_user")`
- `user-auditor/src/main/java/com/hivearmor/userauditor/model/UserAttribute.java:13`
  — `@Table(name = "utm_user_attribute")` → `@Table(name = "hive_user_attribute")`
- `user-auditor/src/main/java/com/hivearmor/userauditor/model/UserSource.java:14`
  — `@Table(name = "utm_user_source")` → `@Table(name = "hive_user_source")`
- `user-auditor/src/main/java/com/hivearmor/userauditor/model/SourceScan.java:12`
  — `@Table(name = "utm_source_scan")` → `@Table(name = "hive_source_scan")`
- `user-auditor/src/main/java/com/hivearmor/userauditor/model/SourceFilter.java:12`
  — `@Table(name = "utm_source_filter")` → `@Table(name = "hive_source_filter")`

Also add user-auditor Liquibase rename changeset (same pattern as Sprint 3) in the user-auditor migrations if user-auditor uses Liquibase, or let GORM auto-migrate handle it if it uses GORM (check `user-auditor/` for migration mechanism).

### S7A-4: Java service display strings (ArmorSight → HiveArmor)

`backend/src/main/java/com/hivearmor/service/notification_channel/NotificationChannelService.java`:
```java
// Line 72:
dispatch(ch, "ArmorSight Test", "This is a test notification from ArmorSight SIEM.", "info");
// → dispatch(ch, "HiveArmor Test", "This is a test notification from HiveArmor SIEM.", "info");

// Line 131:
dispatch(ch, "ArmorSight Alert", message, severity);
// → dispatch(ch, "HiveArmor Alert", message, severity);

// Line 173:
String username = (String) cfg.getOrDefault("username", "ArmorSight");
// → cfg.getOrDefault("username", "HiveArmor")

// Line 199:
"source\":\"ArmorSight\"}");
// → "source\":\"HiveArmor\"}"

// Line 229:
titleBlock.put("text", "ArmorSight SIEM Alert");
// → "HiveArmor SIEM Alert"

// Line 276:
pdPayload.put("source", "ArmorSight SIEM");
// → "HiveArmor SIEM"
```

`backend/src/main/java/com/hivearmor/service/compliance/ComplianceReportExportService.java`:
```java
// Line 102:
document.add(new Paragraph("ArmorSight SIEM — Compliance Report")
// → "HiveArmor SIEM — Compliance Report"

// Line 156:
document.add(new Paragraph("This report was automatically generated by ArmorSight SIEM. "
// → "...generated by HiveArmor SIEM. "
```

### S7A-5: SOC AI LLM instruction

`plugins/soc-ai/config/llm.go:16`:
```go
// Old:
var LLM_INSTRUCTION = `You are an expert security analyst reviewing alerts from UTMStack SIEM.
// New:
var LLM_INSTRUCTION = `You are an expert security analyst reviewing alerts from HiveArmor SIEM.
```

### S7A Verification
```bash
# No ArmorSight in backend Java source
grep -rn "ArmorSight\|armorsight" --include="*.java" backend/src/main/java/ user-auditor/src/
# Expected: 0 results

# No utm_ table refs in @Query or @Table annotations
grep -rn 'utm_\|"utm_' --include="*.java" backend/src/main/java/ user-auditor/src/
# Expected: 0 results

# Backend compiles
cd backend && mvn -s settings.xml -B -DskipTests clean package

# SOC-AI LLM check
grep "UTMStack\|ArmorSight" plugins/soc-ai/config/llm.go
# Expected: 0 results
```

---

## Sprint 7B — Installer, Agent, Collector Rename

### S7B-1: Rename `utmstack-collector/` directory to `hivearmor-collector/`

```bash
# At repo root:
mv utmstack-collector hivearmor-collector
```

Update all affected go.mod references:
- `hivearmor-collector/go.mod`: module path already `github.com/hivearmor/utmstack-collector` → update to `github.com/hivearmor/hivearmor-collector`
- Any `replace` directives in other modules pointing to `../utmstack-collector` → `../hivearmor-collector`
- All import paths inside `hivearmor-collector/` that self-reference `github.com/hivearmor/utmstack-collector/` → `github.com/hivearmor/hivearmor-collector/`
- `event_processor.Dockerfile` — any COPY from `utmstack-collector/` → `hivearmor-collector/`
- `.github/workflows/v11-deployment-pipeline.yml` — `cd ${{ github.workspace }}/utmstack-collector` → `hivearmor-collector`

### S7B-2: Collector service name + display strings

`hivearmor-collector/serv/config.go`:
```go
Name:        "UTMStackCollector"     → "HiveArmorCollector"
DisplayName: "UTMStack Collector"   → "HiveArmor Collector"
Description: "UTMStack Collector Service" → "HiveArmor Collector Service"
```

`hivearmor-collector/main.go` — replace all 12+ display strings:
```
"UTMStackCollector"            → "HiveArmorCollector"
"UTMStack Collector"           → "HiveArmor Collector"
"### UTMStack Collector ###"   → "### HiveArmor Collector ###"
"UTMStack must be installed"   → "HiveArmor must be installed"
```

`hivearmor-collector/agent/register.go` and `delete.go` — log messages:
```
"Registering UTMStack Collector with Agent Manager..." → "Registering HiveArmor Collector..."
"UTMStack Collector registered successfully"           → "HiveArmor Collector registered successfully"
"UTMStack Collector removed successfully"              → "HiveArmor Collector removed successfully"
```

`hivearmor-collector/serv/uninstall.go`:
```
"UTMStackCollector" → "HiveArmorCollector" (2 occurrences)
```

`hivearmor-collector/serv/service.go`:
```
"UTMStack log collector" → "HiveArmor log collector"
"UTMStack Collector"     → "HiveArmor Collector"
```

`hivearmor-collector/collector/docker.go`:
```go
func (d *DockerCollector) sendToUTMStack → sendToHiveArmor
d.sendToUTMStack(utmLog)               → d.sendToHiveArmor(utmLog)
```

### S7B-3: Agent CLI + service name

`agent/cmd/root.go`:
```go
Use:   "utmstack_agent"   → "hivearmor_agent"
Short: "UTMStack Agent CLI" → "HiveArmor Agent CLI"
Long:  all `utmstack_agent` usages in example text → `hivearmor_agent`
```

`agent/cmd/install.go`:
```go
Short: "Install the UTMStackAgent service" → "Install the HiveArmorAgent service"
"Installing UTMStackAgent service ..."    → "Installing HiveArmorAgent service ..."
"UTMStackAgent service installed correctly" → "HiveArmorAgent service installed correctly"
```

`agent/cmd/uninstall.go`:
```go
"Uninstalling UTMStackAgent service ..." → "Uninstalling HiveArmorAgent service ..."
"UTMStackAgent service uninstalled correctly" → "HiveArmorAgent service uninstalled correctly"
```

`agent/cmd/helpers.go`:
```go
utils.CheckIfServiceIsInstalled("UTMStackAgent") → ("HiveArmorAgent")  (2 occurrences)
"UTMStackAgent service is not installed"  → "HiveArmorAgent service is not installed"
"UTMStackAgent service is already installed" → "HiveArmorAgent service is already installed"
```

`agent/cmd/run.go`:
```go
Short: "Run the UTMStackAgent service" → "Run the HiveArmorAgent service"
```

`agent/cmd/load_tls_certs.go`, `disable_integration.go`, `enable_integration.go`, `change_paths.go` — all `utmstack_agent` in example usage strings → `hivearmor_agent`

`agent/config/const.go:40`:
```go
UpdaterSelfLinux = "utmstack_updater_self" → "hivearmor_updater_self"
```

`agent/config/linux_amd64.go`, `linux_arm64.go`, `windows_amd64.go`, `windows_arm64.go`, `macos.go`:
```go
DependFiles = []string{"utmstack_agent_dependencies_linux.zip"}
// → DependFiles = []string{"hivearmor_agent_dependencies_linux.zip"}
// (repeat for each platform variant)
```

> **Note:** The dependency zip filenames are downloaded from the CDN at install time. You must also rename the actual zip files in your GCS/CDN bucket — or update the download URL to point at a new HiveArmor-hosted location.

### S7B-4: Plugin "skipping" error messages

In each of these 7 plugin `config/config.go` files, replace the `"skipping UTMStack plugin execution"` message:

- `plugins/bitdefender/config/config.go:67`
- `plugins/crowdstrike/config/config.go:62`
- `plugins/azure/config/config.go:63`
- `plugins/gcp/config/config.go:63`
- `plugins/o365/config/config.go:63`
- `plugins/aws/config/config.go:63`
- `plugins/sophos/config/config.go:63`
- `plugins/soc-ai/config/config.go:200`

```go
// Old:
fmt.Println("Internal key or Modules Config Host is not set, skipping UTMStack plugin execution")
// New:
fmt.Println("Internal key or Modules Config Host is not set, skipping HiveArmor plugin execution")
```

### S7B-5: Installer full string sweep

`installer/main.go`:
```go
"### UTMStack ###"                            → "### HiveArmor ###"
"--install, -i  Install UTMStack"            → "Install HiveArmor"
"--uninstall, -u  Uninstall UTMStack"        → "Uninstall HiveArmor"
"--version, -v  Show UTMStack version"       → "Show HiveArmor version"
```

`installer/install.go`:
```go
"### Installing UTMStack ###"                → "### Installing HiveArmor ###"
"UTMStack is already installed..."           → "HiveArmor is already installed..."
(keep "HiveArmorUpdater" — already correct from Sprint 5)
```

`installer/uninstall.go`:
```go
"### Uninstalling UTMStack ###"              → "### Uninstalling HiveArmor ###"
"Checking if UTMStack is installed"          → "Checking if HiveArmor is installed"
"UTMStack service is not installed"          → "HiveArmor service is not installed"
"Removing UTMStack Docker Swarm stack"       → "Removing HiveArmor Docker Swarm stack" (2×)
```

`installer/setup/apply.go`:
```go
"Preparing system to run UTMStack"           → "Preparing system to run HiveArmor" (2×)
"Preparing kernel to run UTMStack"           → "Preparing kernel to run HiveArmor"
"Initializing UTMStack and AgentManager databases" → "Initializing HiveArmor databases"
```

`installer/utils/certs.go`:
```go
Organization: []string{"UTMStack LLC"}      → []string{"HiveArmor"}  (2 occurrences)
```

`installer/updater/service.go`:
```go
DisplayName: "UTMStack Components Updater"  → "HiveArmor Components Updater"
Description: "UTMStack Components Updater"  → "HiveArmor Components Updater"
```

`installer/updater/backend.go`:
```go
strings.Contains(errStr, "UTMStack - Maintenance") → "HiveArmor - Maintenance"
```

`installer/templates/nginx.go` (maintenance page title):
```go
<title>UTMStack - Maintenance</title>       → <title>HiveArmor - Maintenance</title>
```

`installer/samples.go`:
```go
"description": "This is an example log used for automatic UTMStack test alert generation"
// → "...HiveArmor test alert generation"
```

### S7B Verification
```bash
# Check collector (renamed dir)
ls hivearmor-collector/
cd hivearmor-collector && go build ./...

# Check agent
grep -rn "UTMStackAgent\|UTMStack Agent\|utmstack_agent\|utmstack_updater_self" --include="*.go" agent/
# Expected: 0 results (except generated pb files)

# Check installer
grep -rn "UTMStack\|utmstack" --include="*.go" installer/ | grep -v "go.sum\|hivearmor"
# Expected: 0 results

# Check plugins
grep -rn "skipping UTMStack" --include="*.go" plugins/
# Expected: 0 results
```

---

## Sprint 7C — Infrastructure, Filters & Cleanup

### S7C-1: Rename `filters/utmstack/` directory and dataType

The `utmstack` dataType is HiveArmor's internal log format. Rename it:

```bash
mv filters/utmstack filters/hivearmor
mv filters/hivearmor/utmstack.yml filters/hivearmor/hivearmor.yml
```

In `filters/hivearmor/hivearmor.yml`:
```yaml
# Old:
pipeline:
  - dataTypes:
      - utmstack
# New:
pipeline:
  - dataTypes:
      - hivearmor
```

Then update every place in Go source and YAML that references the `utmstack` dataType:
```bash
grep -rn '"utmstack"\|dataType.*utmstack\|utmstack.*dataType' \
  --include="*.go" --include="*.yml" --include="*.yaml" \
  event-processor/ plugins/ installer/ rules/ . 2>/dev/null | grep -v "go.sum\|\.plan\|filters/utmstack"
```
Replace all remaining `utmstack` dataType references with `hivearmor`.

Also update `filters/README.md` link which points to `github.com/utmstack/UTMStack/wiki`.

### S7C-2: Build and publish own Postgres image

Create `docker/postgres/Dockerfile`:
```dockerfile
FROM postgres:16-alpine
ENV POSTGRES_DB=hivearmor
ENV POSTGRES_USER=postgres
COPY init.sql /docker-entrypoint-initdb.d/
```

`docker/postgres/init.sql`:
```sql
CREATE DATABASE hivearmor_agents;
CREATE DATABASE hivearmor_auditor;
```

Build and publish:
```bash
docker build -t ghcr.io/hivearmor/postgres:latest docker/postgres/
docker push ghcr.io/hivearmor/postgres:latest
```

Update `local-dev/docker-compose.yml`:
```yaml
image: ghcr.io/utmstack/utmstack/postgres:latest
# →
image: ghcr.io/hivearmor/postgres:latest
```

### S7C-3: Build and publish own OpenSearch image

Update `etc/opensearch/2.x/Dockerfile` (already partially done in Sprint 3):
- Replace `.utm_geoip` → `.ha_geoip` (verify it was done)
- Replace CDN URL `cdn.utmstack.com/geoip/utm-geoip.tar.xz` with your own CDN/GCS URL

Build and publish:
```bash
docker build -t ghcr.io/hivearmor/opensearch:latest etc/opensearch/2.x/
docker push ghcr.io/hivearmor/opensearch:latest
```

Update `local-dev/docker-compose.yml`:
```yaml
image: ghcr.io/utmstack/utmstack/opensearch:latest
# →
image: ghcr.io/hivearmor/opensearch:latest
```

### S7C-4: Update remaining upstream images in docker-compose

After user-auditor and web-pdf are built from source (Sprint 5), update:
```yaml
# local-dev/docker-compose.yml
image: ghcr.io/utmstack/utmstack/eventprocessor:${HIVEARMOR_TAG}  → ghcr.io/hivearmor/event-processor:${HIVEARMOR_TAG}
image: ghcr.io/utmstack/utmstack/user-auditor:${HIVEARMOR_TAG}    → ghcr.io/hivearmor/user-auditor:${HIVEARMOR_TAG}
image: ghcr.io/utmstack/utmstack/web-pdf:${HIVEARMOR_TAG}         → ghcr.io/hivearmor/web-pdf:${HIVEARMOR_TAG}
```

### S7C-5: Fix GitHub Actions CI

`.github/workflows/v11-deployment-pipeline.yml`:
```yaml
# Line 29: dev Customer Manager URL
CM_URL="https://cm.dev.utmstack.com"  → CM_URL="https://cm.dev.hivearmor.io"  (or your URL)

# Line 69: prod Customer Manager URL
CM_URL="https://cm.utmstack.com"  → CM_URL="https://cm.hivearmor.io"  (or your URL)

# Line 222, 230, 232, 237: step names
name: Build UTMStack Collector  → name: Build HiveArmor Collector
echo "Building UTMStack Collector..."  → echo "Building HiveArmor Collector..."
echo "Building UTMStack AS400 Collector..."  → echo "Building HiveArmor AS400 Collector..."

# Line 276: artifact download step name
name: Download UTMStack Collectors from artifacts  → Download HiveArmor Collectors

# Line 298: GCS download URL
curl -sSL "https://storage.googleapis.com/utmstack-updates/dependencies/collector/as400-collector.jar"
# → update to your own GCS/CDN bucket URL

# Line 294: path references
${{ github.workspace }}/utmstack-collector/utmstack-collector/hivearmor_collector
# → ${{ github.workspace }}/hivearmor-collector/hivearmor-collector/hivearmor_collector
# (after S7B-1 directory rename)
```

`.github/workflows/reusable-basic.yml:31`:
```yaml
tags: ghcr.io/utmstack/utmstack/${{inputs.image_name}}:${{inputs.tag}}
# →
tags: ghcr.io/hivearmor/${{inputs.image_name}}:${{inputs.tag}}
```

### S7C-6: Cosmetic / comment cleanups

`local-dev/docker-compose.override.yml:1`:
```yaml
# Override: replace upstream eventprocessor with our ArmorSight engine build.
# →
# Override: replace upstream event-processor with our HiveArmor engine build.
```

`local-dev/seed-incidents.sh:3,173`:
```bash
# seed-incidents.sh — Inject realistic incident lifecycle data into ArmorSight
# → ...into HiveArmor

"ArmorSight Incident Lifecycle Seed"  → "HiveArmor Incident Lifecycle Seed"
```

`event-processor/enterprise/lookup/service.go:1` and `event-processor/enrichment/feeds.go:1`:
```go
// Package lookup enriches events from v11-lookup-* reference data
// → // Package lookup enriches events from _v3_hive_lookup-* reference data
```

### S7C-7: Delete Angular `/frontend/` directory

```bash
rm -rf /Users/encryptshell/GIT/UTMStack-11/frontend/
```

Confirm it's gone:
```bash
ls frontend/ 2>/dev/null && echo "STILL EXISTS" || echo "DELETED"
```

### S7C Verification
```bash
# No ghcr.io/utmstack/ in any compose or workflow file
grep -rn "ghcr\.io/utmstack\|ghcr\.io/nilachakra" \
  --include="*.yml" --include="*.yaml" \
  --exclude-dir=".git" . 2>/dev/null
# Expected: 0 results

# No utmstack.com URLs in CI
grep -rn "utmstack\.com\|utmstack-updates" \
  --include="*.yml" --include="*.sh" \
  --exclude-dir=".git" . 2>/dev/null
# Expected: 0 results (replace with your own URLs first)

# filters/utmstack gone
ls filters/utmstack 2>/dev/null && echo "STILL EXISTS" || echo "RENAMED"

# frontend/ gone
ls frontend/ 2>/dev/null && echo "STILL EXISTS" || echo "DELETED"
```

---

## Sprint 7 Summary

| Session | Focus | Risk |
|---|---|---|
| S7A | Proto enum + DB query strings + Java display strings | **HIGH** — proto change requires coordinated deploy |
| S7B | Collector/agent CLI + installer strings | Low — display strings, compile-verified |
| S7C | Infrastructure images + CI + filters + cleanup | Medium — Docker build + publish required |

**Estimated effort:** 3–4 developer days

---

## Sprint 7 Session Prompts

### Sprint 7A Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 7A section.
Goal: Fix the 5 critical code gaps found in post-rebrand audit:
  1. Rename UTMSTACK proto enum → HIVEARMOR in all 3 .proto files, regenerate .pb.go
  2. Fix all 8 backend @Query native SQL strings: utm_* → hive_* table names
  3. Fix 5 user-auditor @Table(name="utm_*") annotations → hive_*
  4. Fix NotificationChannelService.java and ComplianceReportExportService.java: ArmorSight → HiveArmor
  5. Fix plugins/soc-ai/config/llm.go LLM instruction UTMStack → HiveArmor

WARNING: Proto enum rename requires coordinated deploy of agent-manager + backend + collector.
After editing .proto files, regenerate .pb.go with protoc, then update any Go code 
referencing CollectorModule_UTMSTACK → CollectorModule_HIVEARMOR.

Verify: No ArmorSight/utm_ in backend Java source. mvn -s settings.xml -B -DskipTests clean package passes.
```

### Sprint 7B Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 7B section.
Goal: Rename utmstack-collector/ directory → hivearmor-collector/, fix all collector service
names (UTMStackCollector → HiveArmorCollector), fix agent CLI strings (UTMStackAgent → HiveArmorAgent),
fix agent/config/const.go and platform DependFiles zip names, fix installer display strings and 
TLS cert org, fix all 8 plugin "skipping UTMStack" messages.

Start with: directory rename (mv utmstack-collector hivearmor-collector), then update go.mod/imports.
Then: serv/config.go, main.go, register.go, delete.go in the collector.
Then: agent/cmd/ files, agent/config/const.go, platform config files.
Then: installer/main.go, install.go, uninstall.go, setup/apply.go, utils/certs.go, 
      updater/service.go, templates/nginx.go, samples.go.
Then: all 8 plugin config.go files.

Verify: go build ./... passes for hivearmor-collector, agent, installer, all plugins.
grep finds 0 UTMStackAgent/UTMStackCollector/"UTMStack LLC" in Go source.
```

### Sprint 7C Prompt
```
Read .plan/HIVEARMOR_REBRAND_PLAN.md Sprint 7C section.
Goal: Build own Postgres and OpenSearch Docker images (publish to ghcr.io/hivearmor/),
update docker-compose.yml to use them, fix remaining ghcr.io/utmstack/ references,
fix CI workflow Customer Manager URLs and step names, rename filters/utmstack/ → filters/hivearmor/
with dataType utmstack → hivearmor, fix cosmetic comment strings, delete frontend/ directory.

Start with: filters/utmstack rename (fast). Then docker image builds. Then CI fixes.
Then docker-compose.yml image updates. Then delete frontend/.

Note: cm.utmstack.com and storage.googleapis.com/utmstack-updates URLs must be replaced
with your own HiveArmor-hosted URLs or left as placeholders if infra not yet set up.

Verify: 
- grep finds 0 ghcr.io/utmstack/ in all YAML files
- grep finds 0 utmstack.com in CI workflows
- filters/utmstack/ does not exist
- frontend/ does not exist
- docker compose up starts without pulling any utmstack images
```

---

## Final Zero-Dependency Checklist (Updated)

- [ ] No `ghcr.io/utmstack/` image references in any file
- [ ] No `cm.utmstack.com` / `storage.googleapis.com/utmstack-updates` URLs
- [ ] No `github.com/AtlasInsideCorp/` imports
- [ ] No `github.com/utmstack/` or `github.com/encryptshellorg/nilachakra/` module paths
- [ ] Proto enum `UTMSTACK` renamed to `HIVEARMOR`, all `.pb.go` regenerated
- [ ] All `@Table(name = "utm_*")` annotations updated to `hive_*` (backend + user-auditor)
- [ ] All native `@Query` SQL strings use `hive_*` table names
- [ ] `utmstack-collector/` directory renamed to `hivearmor-collector/`
- [ ] Agent service name is `HiveArmorAgent` on all platforms
- [ ] Collector service name is `HiveArmorCollector` on all platforms
- [ ] Installer TLS certs say `HiveArmor` in the Organization field
- [ ] SOC AI LLM instruction references `HiveArmor SIEM`
- [ ] `filters/utmstack/` renamed to `filters/hivearmor/`, dataType is `hivearmor`
- [ ] Own Postgres image published to `ghcr.io/hivearmor/postgres`
- [ ] Own OpenSearch image published to `ghcr.io/hivearmor/opensearch`
- [ ] Own user-auditor, web-pdf, event-processor built from source
- [ ] All CI/CD pipelines publish to `ghcr.io/hivearmor/`
- [ ] `frontend/` Angular directory deleted
- [ ] CLAUDE.md reflects HiveArmor everywhere
- [ ] Master brand grep returns 0 results (see Final Verification section above)
