# Changelog

All notable changes to HiveArmor are documented in this file.

## [Unreleased]

### Rebrand — HiveArmor (Complete Zero-Dependency Migration)

Full source-level rebrand from UTMStack / NilaChakra / ArmorSight to **HiveArmor**. The master brand grep (`utmstack|UTMStack|NilaChakra|nilachakra|ArmorSight|armorsight|AtlasInside`) now returns 0 results across all non-immutable source files.

#### Agent (`agent/`)
- Windows service name renamed: `UTMStackAgent` → `HiveArmorAgent`
- Windows updater service renamed: `UTMStackUpdater` → `HiveArmorUpdater`
- Service log file renamed: `utmstack_updater.log` → `hivearmor_updater.log`
- macOS collector binary reference renamed: `utmstack-collector-mac` → `hivearmor-collector-mac`
- Linux auditd rules file renamed: `/etc/audit/rules.d/50-utmstack.rules` → `/etc/audit/rules.d/50-hivearmor.rules`
- Linux audit rule key names renamed: `utmstack_exec` → `ha_exec`, `utmstack_priv` → `ha_priv`, etc.
- Log messages updated throughout `serv/`, `agent/`, `dependency/`, `collector/`

#### AS400 Collector (`as400/`)
- Service names renamed: `UTMStackAS400Collector` → `HiveArmorAS400Collector`, `UTMStackAS400Updater` → `HiveArmorAS400Updater`
- Updater log file renamed: `utmstack_as400_updater.log` → `hivearmor_as400_updater.log`
- Binary name renamed: `utmstack_as400_updater_service` → `hivearmor_as400_updater_service`
- CLI help text, config path (`/utmstack.yaml` → `/hivearmor.yaml`), and debug command updated

#### Collector (`hivearmor-collector/` — formerly `utmstack-collector/`)
- Directory renamed: `utmstack-collector/` → `hivearmor-collector/`
- Go module path updated: `github.com/hivearmor/hivearmor-collector`
- All internal imports updated

#### Protobuf / Agent Manager
- Generated proto enum renamed: `CollectorModule_UTMSTACK` → `CollectorModule_HIVEARMOR`
- Raw descriptor byte string updated with correct length prefix for 9-char name
- Go model constant renamed: `UTMSTACK CollectorModule` → `HIVEARMOR CollectorModule`

#### Backend (`backend/`)
- OpenSearch ISM policy ID: `nilachakra_ism_policy` → `hivearmor_ism_policy`
- OpenSearch snapshot repository: `nilachakra_backups` → `hivearmor_backups`, `nilachakra_snapshot` → `hivearmor_snapshot`
- Thread name prefix: `nilachakra-Executor-` → `hivearmor-Executor-`
- Error response header: `X-UtmStack-error` → `X-HiveArmor-error`
- Native SQL table reference: `utm_collectors` → `hive_collectors`
- App log name in logback: `utmstack-backend` → `hivearmor-backend`
- SOC AI config key prefix: `nilachakra.socai.*` → `hivearmor.socai.*`
- ThreatWinds integration config key: `nilachakra.tw.enable` → `hivearmor.tw.enable`
- Module enum: `ModuleName.UTMSTACK` → `ModuleName.HIVEARMOR`
- Local variable rename: `utmStackConfigValidator` → `haConfigValidator` in `ModuleBitdefender`, `ModuleAwsIamUser`, `ModuleAzure`, `ModuleSophos`
- Data input status exclusion list and alert description updated
- JPQL query literal values updated: `'nilachakra'` / `'NilaChakra'` → `'hivearmor'` / `'HiveArmor'`
- EventProcessorManagerService `CLASSNAME` constant updated
- Compliance email subject updated: "HiveArmor Compliance Report Delivery"
- Branding properties: `name = "HiveArmor"`, `nameShort = "HA"`, support/docs URLs updated
- OpenAPI title updated: "HiveArmor API"
- Test DB name: `nilachakra` → `hivearmor`; app name updated in test application.yml
- CORS test domain: `armorsight.yourdomain.com` → `hivearmor.yourdomain.com`
- SAML test domain: `legitimate.armorsight.com` → `legitimate.hivearmor.io`
- JHipster docker stubs (`sonar.yml`, `mysql.yml`, `app.yml`) updated
- Installer `InitPgUtmstack` function renamed to `InitPgHivearmor`

#### Plugins
- `soc-ai`: API endpoint constants updated (`/api/utm-alerts/status` → `/api/ha-alerts/status`, `/api/utm-incidents` → `/api/ha-incidents`); standalone runner comment updated
- `feeds`: Backend client URL paths updated (`/api/utm-incidents` → `/api/ha-incidents`, `/api/utm-incident-alerts` → `/api/ha-incident-alerts`)

#### Frontend v2 (`frontend-v2/`)
- SOC AI settings page: all `nilachakra.socai.*` config keys → `hivearmor.socai.*`
- Admin page: service name `nilachakra-backend` → `hivearmor-backend`
- Index rollover page: `nilachakra_backups` → `hivearmor_backups` display reference
- Chart theme comment updated
- Incident variable service test: URL pattern updated to `/ha-incident-variables/`

#### `web-pdf`
- `AccessType` enum values renamed: `UTM_TOKEN` → `HA_TOKEN`, `UTM_INTERNAL_KEY` → `HA_INTERNAL_KEY`
- Compose image updated: `ghcr.io/hivearmor/web-pdf:latest`

#### `user-auditor`
- `APPLICATION_NAME` constant updated to `"HiveArmor"`
- Compose image updated: `ghcr.io/hivearmor/user-auditor:latest`

#### Installer (`installer/`)
- `build.sh`: GOPRIVATE/GONOPROXY/GONOSUMDB set to `github.com/hivearmor`; ldflags module path updated
- `updater/license.go`: comments updated
- `services/postgres.go` + `setup/apply.go`: `InitPgUtmstack` renamed to `InitPgHivearmor`

#### Local Dev (`local-dev/`)
- `docker-compose.override.yml`: event-processor image `nilachakra/event-processor:local` → `hivearmor/event-processor:local`; `POSTGRESQL_DB` updated to `hivearmor`
- `seed-incidents.sh`: all `/api/utm-incidents` endpoint calls updated to `/api/ha-incidents`
- `seed-data.sh`: title string, DB name, and hardcoded absolute path (replaced with `$(dirname "$0")/.env`)

#### Filters
- `filters/linux/linux.yml`: schema comment updated to "HiveArmor Standard Event Schema"
- `filters/hivearmor/` directory (previously `filters/utmstack/`): renamed in prior sprint

#### CI / GitHub Actions
- `installer-release.yml`: runner tags (`utmstack-v10-dev` → `hivearmor-v10-dev`, etc.), GOPRIVATE, module paths, binary name (`utmstack_installer` → `hivearmor_installer`), home dir paths
- `v10-deployment-pipeline.yml`: runner tag, agent binary names, artifact paths, dependency download URLs, container registry username, image tags
- `reusable-sign-agent.yml`: binary names, `sign_name` default, `sign_url` default
- `reusable-node.yml`: build context path updated
- `generate-changelog.yml`: `product_name` default updated to `'HiveArmor'`
- `_pr-reusable-go-deps.yml`: GOPRIVATE comments and env vars updated
- `_pr-reusable-approver.yml`: `org` default updated to `'hivearmor'`
- `generate-changelog.sh`: `PRODUCT_NAME` default updated to `"HiveArmor"`
- `approver.sh`: `ORG` default and comment updated

#### Issue Templates
- `config.yml`: community support URL updated
- `bug_report.yml`: issue search URL, version label, and field ID updated

#### Infrastructure / ISO
- `etc/iso/iso-build.sh`: home dir and output ISO filename updated
- `etc/iso/tools/start.sh`: home dir and installer download URL updated

#### Docs
- `CLAUDE.md`: `utmstack-collector/` → `hivearmor-collector/` in repo layout and build notes
- `AGENTS.md`: `utmstack-collector/` directory and ldflags examples updated
