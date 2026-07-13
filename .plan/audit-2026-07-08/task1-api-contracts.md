# Task 1: Backend REST Resource → Frontend-v2 Caller Mapping

**Audit Date:** 2026-07-08  
**Backend:** `/backend/src/main/java/com/nilachakra/web/rest/`  
**Frontend Services:** `/frontend-v2/src/services/`  
**Frontend Proxy:** All frontend calls go through `/app/api/[...path]/route.ts` which proxies to `BACKEND_URL/api/{path}`.

---

## Mapping Table

| Backend Resource | API Path | HTTP Methods | Frontend Service | Frontend Page | Status |
|---|---|---|---|---|---|
| **AccountResource** | `GET /api/authenticate` | GET | _(not found in services)_ | Login flow | ❌ NOT WIRED |
| **AccountResource** | `GET /api/account` | GET | _(not found in services)_ | Layout/auth guard | ❌ NOT WIRED |
| **AccountResource** | `POST /api/account` | POST | _(not found in services)_ | Profile settings | ❌ NOT WIRED |
| **AccountResource** | `POST /api/account/change-password` | POST | _(not found in services)_ | Profile | ❌ NOT WIRED |
| **AccountResource** | `POST /api/account/reset-password/init` | POST | _(not found in services)_ | Login page | ❌ NOT WIRED |
| **AccountResource** | `POST /api/account/reset-password/finish` | POST | _(not found in services)_ | Login page | ❌ NOT WIRED |
| **AuditResource** | `GET /management/audits` | GET | _(not found in services)_ | — | ❌ NOT WIRED |
| **AuthorityResource** | `POST /api/authority` | POST | _(not found in services)_ | — | ❌ NOT WIRED |
| **AuthorityResource** | `PUT /api/authority` | PUT | _(not found in services)_ | — | ❌ NOT WIRED |
| **AuthorityResource** | `GET /api/authority` | GET | _(not found in services)_ | Admin | ❌ NOT WIRED |
| **AuthorityResource** | `DELETE /api/authority/{name}` | DELETE | _(not found in services)_ | — | ❌ NOT WIRED |
| **LogsResource** | `GET /management/logs` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **LogsResource** | `PUT /management/logs` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **MitreCoverageResource** | `GET /api/mitre/coverage` | GET | `mitre.service.ts` | `/rules/coverage` | ✅ WIRED |
| **MitreCoverageResource** | `GET /api/mitre/rules?techniqueId=` | GET | _(not found in services)_ | — | ❌ NOT WIRED |
| **MitreCoverageResource** | `GET /api/mitre/coverage/export` | GET | `mitre.service.ts` (raw fetch) | `/rules/coverage` | ✅ WIRED |
| **OffenseResource** | `GET /api/offenses` | GET | `offense.service.ts` | `/offenses` | ✅ WIRED |
| **OffenseResource** | `GET /api/offenses/{id}` | GET | `offense.service.ts` | `/offenses/[id]` | ✅ WIRED |
| **OffenseResource** | `PUT /api/offenses/{id}/status` | PUT | `offense.service.ts` | `/offenses/[id]` | ✅ WIRED |
| **OffenseResource** | `GET /api/offenses/{id}/alerts` | GET | `offense.service.ts` | `/offenses/[id]` | ✅ WIRED |
| **UserJWTController** | `POST /api/authenticate` | POST | Login page (direct fetch or api lib) | `/login` | ✅ WIRED |
| **UserJWTController** | `GET /api/check-credentials` | GET | _(not found in services)_ | — | ❌ NOT WIRED |
| **UserJWTController** | `POST /api/authenticateFederationServiceManager` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UserResource** | `GET /api/users` | GET | `admin.service.ts` `.listUsers()` | `/admin/users` | ✅ WIRED |
| **UserResource** | `POST /api/users` | POST | `admin.service.ts` `.createUser()` | `/admin/users` | ✅ WIRED |
| **UserResource** | `PUT /api/users` | PUT | `admin.service.ts` `.updateUser()` | `/admin/users` | ✅ WIRED |
| **UserResource** | `DELETE /api/users/{login}` | DELETE | `admin.service.ts` `.deleteUser()` | `/admin/users` | ✅ WIRED |
| **UserResource** | `GET /api/users/{login}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UserResource** | `GET /api/users/authorities` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UserResource** | `GET /api/users/filter/{login}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertLogResource** | `GET /api/utm-alert-logs` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertLogResource** | `POST /api/utm-alert-logs` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertLogResource** | `PUT /api/utm-alert-logs` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertLogResource** | `GET /api/utm-alert-logs/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertLogResource** | `DELETE /api/utm-alert-logs/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertResource** | `POST /api/utm-alerts/status` | POST | `alert.service.ts` `.updateStatus()` | `/alerts` | ✅ WIRED |
| **UtmAlertResource** | `POST /api/utm-alerts/notes` | POST | `alert.service.ts` `.updateNotes()` | `/alerts` | ✅ WIRED |
| **UtmAlertResource** | `POST /api/utm-alerts/tags` | POST | `alert.service.ts` `.updateTags()` | `/alerts` | ✅ WIRED |
| **UtmAlertResource** | `POST /api/utm-alerts/convert-to-incident` | POST | `alert.service.ts` `.convertToIncident()` | `/alerts` | ✅ WIRED |
| **UtmAlertResource** | `GET /api/utm-alerts/count-open-alerts` | GET | `alert.service.ts` `.countOpenAlerts()` | `/dashboard`, `/alerts` | ✅ WIRED |
| **UtmAlertTagResource** | `GET /api/utm-alert-tags` | GET | `alert.service.ts` `.getTags()` | `/alerts`, `/alerts/tagging-rules` | ✅ WIRED |
| **UtmAlertTagResource** | `POST /api/utm-alert-tags` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertTagResource** | `PUT /api/utm-alert-tags` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertTagResource** | `DELETE /api/utm-alert-tags/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertTagRuleResource** | `GET /api/alert-tag-rules` | GET | `detection.service.ts` (list rules) | `/alerts/tagging-rules` | ✅ WIRED |
| **UtmAlertTagRuleResource** | `POST /api/alert-tag-rules` | POST | `detection.service.ts` | `/alerts/tagging-rules` | ✅ WIRED |
| **UtmAlertTagRuleResource** | `PUT /api/alert-tag-rules` | PUT | `detection.service.ts` | `/alerts/tagging-rules` | ✅ WIRED |
| **UtmAlertTagRuleResource** | `DELETE /api/alert-tag-rules/{id}` | DELETE | `detection.service.ts` | `/alerts/tagging-rules` | ✅ WIRED |
| **UtmAlertTagRuleResource** | `GET /api/alert-tag-rules/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertTagRuleResource** | `GET /api/alert-tag-rules/get-by-ids` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAssetMetricsResource** | `GET /api/utm-asset-metrics` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAssetMetricsResource** | `POST /api/utm-asset-metrics` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAssetMetricsResource** | `PUT /api/utm-asset-metrics` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAssetMetricsResource** | `GET /api/utm-asset-metrics/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAssetMetricsResource** | `DELETE /api/utm-asset-metrics/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmClientResource** | `GET /api/utm-clients` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmClientResource** | `GET /api/utm-clients/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmConfigurationParameterResource** | `GET /api/utm-configuration-parameters` | GET | `admin.service.ts` (via sections) | `/admin/settings` | ✅ WIRED |
| **UtmConfigurationParameterResource** | `PUT /api/utm-configuration-parameters` | PUT | `admin.service.ts` `.updateConfigParam()` | `/admin/settings` | ⚠️ PARTIAL |
| **UtmConfigurationParameterResource** | `GET /api/utm-configuration-parameters/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmConfigurationParameterResource** | `POST /api/checkEmailConfiguration` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmConfigurationSectionResource** | `GET /api/utm-configuration-sections` | GET | `admin.service.ts` `.getConfigSections()` | `/admin/settings` | ✅ WIRED |
| **UtmDataInputStatusResource** | `GET /api/utm-data-input-statuses` | GET | `overview.service.ts` | `/dashboard`, `/overview` | ✅ WIRED |
| **UtmDataInputStatusResource** | `POST /api/utm-data-input-statuses` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataInputStatusResource** | `PUT /api/utm-data-input-statuses` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataInputStatusResource** | `GET /api/utm-data-input-statuses/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataInputStatusResource** | `DELETE /api/utm-data-input-statuses/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmImagesResource** | `PUT /api/images` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmImagesResource** | `GET /api/images/all` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmImagesResource** | `GET /api/images/{shortName}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmImagesResource** | `GET /api/images/reset` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationConfResource** | `GET /api/utm-integration-confs` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationConfResource** | `POST /api/utm-integration-confs` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationConfResource** | `PUT /api/utm-integration-confs` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationConfResource** | `DELETE /api/utm-integration-confs/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationResource** | `GET /api/utm-integrations` | GET | _(not found)_ | `/integrations` | ❌ NOT WIRED |
| **UtmIntegrationResource** | `POST /api/utm-integrations` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationResource** | `PUT /api/utm-integrations` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIntegrationResource** | `DELETE /api/utm-integrations/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuAuthorityResource** | `GET /api/utm-menu-authorities` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuAuthorityResource** | `POST /api/utm-menu-authorities` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuAuthorityResource** | `PUT /api/utm-menu-authorities` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuAuthorityResource** | `DELETE /api/utm-menu-authorities/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuResource** | `GET /api/menu` | GET | _(not found)_ | Layout/nav | ❌ NOT WIRED |
| **UtmMenuResource** | `GET /api/menu/all` | GET | `menu.service.ts` | Layout | ✅ WIRED |
| **UtmMenuResource** | `POST /api/menu` | POST | `menu.service.ts` `.createMenu()` | — | ✅ WIRED |
| **UtmMenuResource** | `PUT /api/menu` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuResource** | `DELETE /api/menu/{id}` | DELETE | `menu.service.ts` `.deleteByUrl()` | — | ⚠️ PARTIAL |
| **UtmMenuResource** | `GET /api/menu/get-menu-by-authorities` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmMenuResource** | `POST /api/menu/save-menu-structure` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmScheduleResource** | `GET /api/utm-schedules` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmScheduleResource** | `POST /api/utm-schedules` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmScheduleResource** | `PUT /api/utm-schedules` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmScheduleResource** | `DELETE /api/utm-schedules/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerModuleResource** | `GET /api/utm-server-modules` | GET | `agent.service.ts` `.listIntegrations()` | `/data-sources` | ✅ WIRED |
| **UtmServerModuleResource** | `GET /api/utm-server-modules/modules-with-integrations` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerModuleResource** | `POST /api/utm-server-modules` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerModuleResource** | `PUT /api/utm-server-modules` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerModuleResource** | `DELETE /api/utm-server-modules/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerResource** | `GET /api/utm-servers` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerResource** | `POST /api/utm-servers` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerResource** | `PUT /api/utm-servers` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmServerResource** | `DELETE /api/utm-servers/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmStackResource** | `GET /api/ping` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmStackResource** | `GET /api/date-format` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmStackResource** | `GET /api/healthcheck` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmStackResource** | `GET /api/isInDevelop` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmStackResource** | `POST /api/encrypt` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **AgentGroupResource** | `GET /api/agent-groups` | GET | `admin.service.ts`, `agent-groups.service.ts` | `/data-sources/groups`, agents page | ✅ WIRED |
| **AgentGroupResource** | `GET /api/agent-groups/{id}` | GET | `agent-groups.service.ts` | — | ✅ WIRED |
| **AgentGroupResource** | `POST /api/agent-groups` | POST | `agent-groups.service.ts` | `/data-sources/groups` | ✅ WIRED |
| **AgentGroupResource** | `PUT /api/agent-groups/{id}` | PUT | `agent-groups.service.ts` | `/data-sources/groups` | ✅ WIRED |
| **AgentGroupResource** | `DELETE /api/agent-groups/{id}` | DELETE | `agent-groups.service.ts` | `/data-sources/groups` | ✅ WIRED |
| **AgentGroupResource** | `POST /api/agent-groups/{id}/members/{agentId}` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **AgentGroupResource** | `DELETE /api/agent-groups/{id}/members/{agentId}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **AgentGroupResource** | `PUT /api/agent-groups/{id}/members` | PUT | `agent-groups.service.ts` `.setMembers()` | `/data-sources/groups` | ✅ WIRED |
| **AgentManagerResource** | `GET /api/agent-manager/agents` | GET | _(not found with that path)_ | `/agents` | 🔴 BROKEN |
| **AgentManagerResource** | `GET /api/agent-manager/agents-with-commands` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **AgentManagerResource** | `GET /api/agent-manager/agent-by-hostname` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **AgentManagerResource** | `GET /api/agent-manager/agent-commands` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **AgentManagerResource** | `GET /api/agent-manager/can-run-command` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **AgentManagerResource** | `POST /api/agent-manager/update-agent-attrs` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **AgentPolicyResource** | `GET /api/agent-policies` | GET | `admin.service.ts` | `/data-sources/collector-groups` | ✅ WIRED |
| **AgentPolicyResource** | `GET /api/agent-policies/{id}` | GET | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `POST /api/agent-policies` | POST | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `PUT /api/agent-policies/{id}` | PUT | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `DELETE /api/agent-policies/{id}` | DELETE | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `POST /api/agent-policies/{id}/assign-group/{groupId}` | POST | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `DELETE /api/agent-policies/{id}/unassign-group/{groupId}` | DELETE | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `POST /api/agent-policies/{id}/push/{groupId}` | POST | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `GET /api/agent-policies/{id}/push-log` | GET | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `GET /api/agent-policies/{id}/states` | GET | `admin.service.ts` | — | ✅ WIRED |
| **AgentPolicyResource** | `POST /api/agent-policies/report-state` | POST | _(agent internal only)_ | — | ❌ NOT WIRED |
| **UtmAlertResponseRuleExecutionResource** | `GET /api/utm-alert-response-rule-executions` | GET | _(not found)_ | `/soar/audit` | ❌ NOT WIRED |
| **UtmAlertResponseRuleHistoryResource** | `GET /api/utm-alert-response-rule-histories` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertResponseRuleResource** | `GET /api/utm-alert-response-rules` | GET | `detection.service.ts` | `/rules` | ✅ WIRED |
| **UtmAlertResponseRuleResource** | `POST /api/utm-alert-response-rules` | POST | `detection.service.ts` | `/rules` | ✅ WIRED |
| **UtmAlertResponseRuleResource** | `PUT /api/utm-alert-response-rules` | PUT | `detection.service.ts` | `/rules` | ✅ WIRED |
| **UtmAlertResponseRuleResource** | `GET /api/utm-alert-response-rules/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAlertResponseRuleResource** | `GET /api/utm-alert-response-rules/resolve-filter-values` | GET | `detection.service.ts` | `/rules` | ✅ WIRED |
| **UtmAlertResponseRuleResource** | `GET /api/utm-alert-response-action-templates` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **RuleDistributionResource** | `POST /api/alert-response-rules/push` | POST | `detection.service.ts` | `/rules` | ✅ WIRED |
| **RuleDistributionResource** | `GET /api/alert-response-rules/push-status/{ruleId}` | GET | `detection.service.ts` | `/rules` | ✅ WIRED |
| **ApiKeyResource** | `GET /api/api-keys` | GET | `admin.service.ts` (via connection-keys page) | `/admin/connection-keys` | ✅ WIRED |
| **ApiKeyResource** | `POST /api/api-keys` | POST | `admin.service.ts` | `/admin/connection-keys` | ✅ WIRED |
| **ApiKeyResource** | `POST /api/api-keys/{id}/generate` | POST | `admin.service.ts` | `/admin/connection-keys` | ✅ WIRED |
| **ApiKeyResource** | `GET /api/api-keys/{id}` | GET | `admin.service.ts` | — | ✅ WIRED |
| **ApiKeyResource** | `PUT /api/api-keys/{id}` | PUT | `admin.service.ts` | `/admin/connection-keys` | ✅ WIRED |
| **ApiKeyResource** | `DELETE /api/api-keys/{id}` | DELETE | `admin.service.ts` | `/admin/connection-keys` | ✅ WIRED |
| **ApiKeyResource** | `POST /api/api-keys/usage` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **AppInfoResource** | `GET /api/info/version` | GET | _(not found in services)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupConfigurationResource** | `PUT /api/module-group-configurations/update` | PUT | `module.service.ts` `.updateConfig()` | `/data-sources` | ✅ WIRED |
| **UtmModuleGroupConfigurationResource** | `GET /api/module-group-configurations/by-group-id` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupConfigurationResource** | `GET /api/module-group-configurations/by-group-and-key` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupResource** | `GET /api/utm-configuration-groups/module-groups` | GET | `module.service.ts` `.listGroups()` | `/data-sources` | ✅ WIRED |
| **UtmModuleGroupResource** | `POST /api/utm-configuration-groups` | POST | `module.service.ts` `.createGroup()` | `/data-sources` | ✅ WIRED |
| **UtmModuleGroupResource** | `PUT /api/utm-configuration-groups` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupResource** | `GET /api/utm-configuration-groups/{groupId}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupResource** | `DELETE /api/utm-configuration-groups/delete-single-module-group` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleGroupResource** | `DELETE /api/utm-configuration-groups/delete-all-module-groups` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `GET /api/utm-modules` | GET | `module.service.ts` `.listModules()` | `/data-sources`, `/integrations` | ✅ WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/{id}` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `PUT /api/utm-modules/activateDeactivate` | PUT | `module.service.ts` `.activateDeactivate()` | `/data-sources` | ✅ WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/moduleDetails` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/module-details-decrypted` | GET | _(internal only)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/checkRequirements` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/moduleCategories` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmModuleResource** | `GET /api/utm-modules/is-active` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDashboardAuthorityResource** | `GET /api/utm-dashboard-authorities` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDashboardAuthorityResource** | `POST /api/utm-dashboard-authorities` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDashboardAuthorityResource** | `PUT /api/utm-dashboard-authorities` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDashboardAuthorityResource** | `DELETE /api/utm-dashboard-authorities/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDashboardResource** | `GET /api/utm-dashboards` | GET | `dashboard.service.ts` `.list()` | `/dashboard`, `/creator/dashboards` | ✅ WIRED |
| **UtmDashboardResource** | `GET /api/utm-dashboards/{id}` | GET | `dashboard.service.ts` `.getById()` | `/dashboard/render/[id]/[name]` | ✅ WIRED |
| **UtmDashboardResource** | `POST /api/utm-dashboards` | POST | `dashboard.service.ts` `.create()` | `/creator/dashboards/new` | ✅ WIRED |
| **UtmDashboardResource** | `PUT /api/utm-dashboards` | PUT | `dashboard.service.ts` `.update()` | — | ✅ WIRED |
| **UtmDashboardResource** | `DELETE /api/utm-dashboards/{id}` | DELETE | `dashboard.service.ts` `.delete()` | `/creator/dashboards` | ✅ WIRED |
| **UtmDashboardVisualizationResource** | `GET /api/utm-dashboard-visualizations` | GET | `dashboard.service.ts` `.listDashboardVisualizations()` | `/dashboard/render/[id]/[name]` | ✅ WIRED |
| **UtmDashboardVisualizationResource** | `POST /api/utm-dashboard-visualizations` | POST | `dashboard.service.ts` `.addVisualization()` | `/creator/dashboards` | ✅ WIRED |
| **UtmDashboardVisualizationResource** | `PUT /api/utm-dashboard-visualizations` | PUT | `dashboard.service.ts` `.updateVisualization()` | — | ✅ WIRED |
| **UtmDashboardVisualizationResource** | `DELETE /api/utm-dashboard-visualizations/{id}` | DELETE | `dashboard.service.ts` `.removeVisualization()` | — | ✅ WIRED |
| **UtmVisualizationResource** | `GET /api/utm-visualizations` | GET | `dashboard.service.ts` `.listVisualizations()` | `/creator/visualizations` | ✅ WIRED |
| **UtmVisualizationResource** | `DELETE /api/utm-visualizations/{id}` | DELETE | `dashboard.service.ts` `.deleteVisualization()` | — | ✅ WIRED |
| **UtmVisualizationResource** | `POST /api/utm-visualizations` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmVisualizationResource** | `PUT /api/utm-visualizations` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `GET /api/collectors` | GET | `overview.service.ts` | `/overview`, `/data-sources/collectors` | ✅ WIRED |
| **UtmCollectorResource** | `POST /api/collectors/config` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `GET /api/collectors/{collectorId}/module-groups` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `PUT /api/collectors/asset-group` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `GET /api/collectors/asset-groups` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `GET /api/collectors/search-by-filters` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmCollectorResource** | `DELETE /api/collectors/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **ComplianceReportExportResource** | `GET /api/utm-compliance-report-config` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **ComplianceReportExportResource** | `POST /api/utm-compliance-report-config` | POST | `report.service.ts` `.generateReport()` | `/compliance` | ✅ WIRED |
| **ComplianceReportExportResource** | `DELETE /api/utm-compliance-report-config/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **ComplianceReportExportResource** | `GET /api/utm-compliance-report-config/{id}/export` | GET | `report.service.ts` (streaming) | `/compliance` | ✅ WIRED |
| **CustomComplianceResource** | _(various GET)_ | GET | _(not found)_ | — | ❌ NOT WIRED |
| **HipaaResource** | _(HIPAA report endpoints)_ | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceReportScheduleResource** | `GET /api/compliance-report-schedules-by-user` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceReportScheduleResource** | `POST /api/compliance-report-schedules` | POST | `report.service.ts` `.createSchedule()` | `/compliance` | ✅ WIRED |
| **UtmComplianceReportScheduleResource** | `PUT /api/compliance-report-schedules` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceReportScheduleResource** | `DELETE /api/compliance-report-schedules/{id}` | DELETE | `report.service.ts` `.deleteSchedule()` | `/compliance` | ✅ WIRED |
| **UtmComplianceControlConfigResource** | `GET /api/compliance/control-config` | GET | `compliance.service.ts` `.getControlsBySection()` | `/compliance` | ✅ WIRED |
| **UtmComplianceControlConfigResource** | `GET /api/compliance/control-config/{id}` | GET | `compliance.service.ts` `.getControlById()` | `/compliance` | ✅ WIRED |
| **UtmComplianceControlConfigResource** | `POST /api/compliance/control-config` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceControlConfigResource** | `PUT /api/compliance/control-config/{id}` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceControlConfigResource** | `DELETE /api/compliance/control-config/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceControlEvaluationHistoryResource** | `GET /api/compliance/control-config/{id}/evaluations` | GET | `compliance.service.ts` `.getEvaluationHistory()` | `/compliance` | ✅ WIRED |
| **UtmComplianceControlLatestEvaluationResource** | `GET /api/compliance/control-config/get-by-section` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceControlLatestEvaluationResource** | `GET /api/compliance/control-config/get-by-id/{controlId}` | GET | `compliance.service.ts` `.getLatestEvaluation()` | `/compliance` | ✅ WIRED |
| **UtmComplianceReportConfigResource** | `GET /api/compliance/report-config` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceReportConfigResource** | `POST /api/compliance/report-config` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceStandardResource** | `GET /api/compliance/standard` | GET | `compliance.service.ts` `.getStandards()` | `/compliance` | ✅ WIRED |
| **UtmComplianceStandardResource** | `POST /api/compliance/standard` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceStandardResource** | `PUT /api/compliance/standard` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceStandardResource** | `DELETE /api/compliance/standard/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmComplianceStandardSectionResource** | `GET /api/compliance/standard-section` | GET | `compliance.service.ts` `.getSections()` | `/compliance` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `GET /api/correlation-rule/search-by-filters` | GET | `detection.service.ts` `.listRules()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `GET /api/correlation-rule/{id}` | GET | `detection.service.ts` `.getRule()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `POST /api/correlation-rule` | POST | `detection.service.ts` `.createRule()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `PUT /api/correlation-rule` | PUT | `detection.service.ts` `.updateRule()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `DELETE /api/correlation-rule/{id}` | DELETE | `detection.service.ts` `.deleteRule()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `PUT /api/correlation-rule/activate-deactivate` | PUT | `detection.service.ts` `.toggleActive()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `GET /api/correlation-rule/{id}/versions` | GET | `detection.service.ts` `.getRuleVersions()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `GET /api/correlation-rule/{id}/versions/{vNum}` | GET | `detection.service.ts` `.getRuleVersion()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `POST /api/correlation-rule/{id}/rollback/{vNum}` | POST | `detection.service.ts` `.rollback()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `POST /api/correlation-rule/test` | POST | `detection.service.ts` `.testRule()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `POST /api/correlation-rule/import` | POST | `detection.service.ts` `.importRules()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `GET /api/correlation-rule/packs` | GET | `detection.service.ts` `.listPacks()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `POST /api/correlation-rule/packs/{packName}/install` | POST | `detection.service.ts` `.installPack()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `PUT /api/correlation-rule/bulk-enable` | PUT | `detection.service.ts` `.bulkEnable()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `PUT /api/correlation-rule/bulk-disable` | PUT | `detection.service.ts` `.bulkDisable()` | `/rules` | ✅ WIRED |
| **UtmCorrelationRulesResource** | `DELETE /api/correlation-rule/bulk` | DELETE | `detection.service.ts` `.bulkDelete()` | `/rules` | ✅ WIRED |
| **UtmDataTypesResource** | `GET /api/data-types` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataTypesResource** | `POST /api/data-types` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataTypesResource** | `PUT /api/data-types` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmDataTypesResource** | `DELETE /api/data-types/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmRegexPatternResource** | `GET /api/regex-pattern` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmRegexPatternResource** | `POST /api/regex-pattern` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmRegexPatternResource** | `PUT /api/regex-pattern` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmRegexPatternResource** | `DELETE /api/regex-pattern/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmTenantConfigResource** | `GET /api/tenant-config` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmTenantConfigResource** | `POST /api/tenant-config` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **EdrResource** | `GET /api/edr/rules` | GET | `edr.service.ts` `.listRules()` | `/edr` | ✅ WIRED |
| **EdrResource** | `GET /api/edr/rules/{id}` | GET | `edr.service.ts` `.getRule()` | `/edr` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/rules` | POST | `edr.service.ts` `.createRule()` | `/edr` | ✅ WIRED |
| **EdrResource** | `PUT /api/edr/rules/{id}` | PUT | `edr.service.ts` `.updateRule()` | `/edr` | ✅ WIRED |
| **EdrResource** | `DELETE /api/edr/rules/{id}` | DELETE | `edr.service.ts` `.deleteRule()` | `/edr` | ✅ WIRED |
| **EdrResource** | `GET /api/edr/events` | GET | `edr.service.ts` `.listEvents()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/events/ingest` | POST | _(internal agent-facing only)_ | — | ❌ NOT WIRED |
| **EdrResource** | `GET /api/edr/quarantine` | GET | `edr.service.ts` `.listQuarantine()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/quarantine` | POST | `edr.service.ts` `.quarantineFile()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/quarantine/{id}/restore` | POST | `edr.service.ts` `.restoreFile()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `GET /api/edr/isolation` | GET | `edr.service.ts` `.listIsolation()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/isolation` | POST | `edr.service.ts` `.isolateAgent()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/isolation/{id}/lift` | POST | `edr.service.ts` `.liftIsolation()` | `/edr/[agentId]` | ✅ WIRED |
| **EdrResource** | `POST /api/edr/actions/kill-process` | POST | `edr.service.ts` `.killProcess()` | `/edr/[agentId]` | ✅ WIRED |
| **ElasticsearchResource** | `GET /api/elasticsearch/index/properties` | GET | `elastic.service.ts` | `/creator/visualizations/builder` | ✅ WIRED |
| **ElasticsearchResource** | `GET /api/elasticsearch/index/all` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **ElasticsearchResource** | `POST /api/elasticsearch/search` | POST | _(not found directly)_ | — | ⚠️ PARTIAL |
| **ElasticsearchResource** | `POST /api/elasticsearch/field-values` | POST | `elastic.service.ts` | `/creator/visualizations/builder` | ✅ WIRED |
| **ElasticsearchResource** | `GET /api/elasticsearch/cluster/status` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmGettingStartedResource** | `GET /api/utm-getting-started` | GET | `getting-started.service.ts` `.getSteps()` | `/getting-started` | ✅ WIRED |
| **UtmGettingStartedResource** | `GET /api/utm-getting-started/complete` | GET | `getting-started.service.ts` `.completeStep()` | `/getting-started` | ✅ WIRED |
| **UtmGettingStartedResource** | `POST /api/utm-getting-started/init` | POST | `getting-started.service.ts` `.init()` | `/getting-started` | ✅ WIRED |
| **IdentityProviderConfigResource** | `GET /api/identity-providers` | GET | _(not found)_ | `/admin/settings` | ❌ NOT WIRED |
| **IdentityProviderConfigResource** | `POST /api/identity-providers` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **IdentityProviderConfigResource** | `PUT /api/identity-providers/{id}` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **IdentityProviderConfigResource** | `DELETE /api/identity-providers/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **IdentityProviderResource** | `GET /api/utm-providers` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentResource** | `GET /api/utm-incidents` | GET | `incident.service.ts`, `overview.service.ts` | `/incidents`, `/dashboard` | ✅ WIRED |
| **UtmIncidentResource** | `GET /api/utm-incidents/{id}` | GET | `incident.service.ts` `.getById()` | `/incidents/[id]` | ✅ WIRED |
| **UtmIncidentResource** | `POST /api/utm-incidents` | POST | `incident.service.ts` `.create()` | `/incidents` | ✅ WIRED |
| **UtmIncidentResource** | `PUT /api/utm-incidents/change-status` | PUT | _(not found directly)_ | — | ❌ NOT WIRED |
| **UtmIncidentResource** | `POST /api/utm-incidents/add-alerts` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentResource** | `GET /api/utm-incidents/users-assigned` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentResource** | `PUT /api/utm-incidents/change-status` _(via `.status()` method)_ | - | `incident.service.ts` `.updateStatus()` → `POST /api/utm-incidents/status` | `/incidents/[id]` | 🔴 BROKEN |
| **UtmIncidentAlertResource** | `GET /api/utm-incident-alerts` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentAlertResource** | `POST /api/utm-incident-alerts` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentHistoryResource** | `GET /api/utm-incident-histories` | GET | _(not found)_ | `/incidents/[id]` | ❌ NOT WIRED |
| **UtmIncidentNoteResource** | `GET /api/utm-incident-notes` | GET | _(not found)_ | `/incidents/[id]` | ❌ NOT WIRED |
| **UtmIncidentNoteResource** | `POST /api/utm-incident-notes` | POST | _(not found)_ | `/incidents/[id]` | ❌ NOT WIRED |
| **UtmIncidentPriorityResource** | `PUT /api/utm-incidents/{id}/priority` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentPriorityResource** | `GET /api/utm-incidents/sla-breached` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentActionResource** | `GET /api/utm-incident-actions` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentActionResource** | `POST /api/utm-incident-actions` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentJobResource** | `GET /api/utm-incident-jobs` | GET | `incident-response.service.ts` | `/soar/console` | ✅ WIRED |
| **UtmIncidentJobResource** | `DELETE /api/utm-incident-jobs/{id}` | DELETE | `incident-response.service.ts` | `/soar/console` | ✅ WIRED |
| **UtmIncidentVariableResource** | `GET /api/utm-incident-variables` | GET | _(not found)_ | `/admin/variables` | ❌ NOT WIRED |
| **UtmIncidentVariableResource** | `POST /api/utm-incident-variables` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentVariableResource** | `PUT /api/utm-incident-variables` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIncidentVariableResource** | `DELETE /api/utm-incident-variables/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIndexPatternResource** | `GET /api/utm-index-patterns` | GET | `elastic.service.ts` `.listIndexPatterns()` | `/creator/visualizations/builder` | ✅ WIRED |
| **UtmIndexPatternResource** | `GET /api/utm-index-patterns/fields` | GET | `elastic.service.ts` `.getIndexFields()` | — | ✅ WIRED |
| **UtmIndexPatternResource** | `POST /api/utm-index-patterns` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIndexPatternResource** | `PUT /api/utm-index-patterns` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **UtmIndexPatternResource** | `DELETE /api/utm-index-patterns/{id}` | DELETE | _(not found)_ | — | ❌ NOT WIRED |
| **IndexPolicyResource** | `GET /api/index-policy/policy` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **IndexPolicyResource** | `PUT /api/index-policy/policy` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **LogAnalyzerResource** | `POST /api/log-analyzer/queries` | POST | `log-analyzer.service.ts` `.saveQuery()` | `/logs` | ✅ WIRED |
| **LogAnalyzerResource** | `PUT /api/log-analyzer/queries` | PUT | _(not found)_ | — | ❌ NOT WIRED |
| **LogAnalyzerResource** | `GET /api/log-analyzer/queries` | GET | `log-analyzer.service.ts` `.listQueries()` | `/logs` | ✅ WIRED |
| **LogAnalyzerResource** | `DELETE /api/log-analyzer/queries/{id}` | DELETE | `log-analyzer.service.ts` `.deleteQuery()` | `/logs` | ✅ WIRED |
| **LogAnalyzerResource** | `POST /api/log-analyzer/chart-view` | POST | `log-analyzer.service.ts` `.chartView()` | `/logs` | ✅ WIRED |
| **UtmFilterResource** | `GET /api/utm-filters` | GET | `logstash.service.ts` | `/data-parsing` | ✅ WIRED |
| **UtmFilterResource** | `GET /api/utm-filters/{id}` | GET | `logstash.service.ts` | — | ✅ WIRED |
| **UtmFilterResource** | `POST /api/utm-filters` | POST | `logstash.service.ts` `.createFilter()` | `/data-parsing` | ✅ WIRED |
| **UtmFilterResource** | `PUT /api/utm-filters` | PUT | `logstash.service.ts` `.updateFilter()` | `/data-parsing` | ✅ WIRED |
| **UtmFilterResource** | `DELETE /api/utm-filters/{id}` | DELETE | `logstash.service.ts` `.deleteFilter()` | `/data-parsing` | ✅ WIRED |
| **UtmLogstashFilterGroupResource** | `GET /api/utm-logstash-filter-groups` | GET | `logstash.service.ts` | `/data-parsing` | ✅ WIRED |
| **UtmLogstashFilterGroupResource** | `POST /api/utm-logstash-filter-groups` | POST | `logstash.service.ts` `.createGroup()` | `/data-parsing` | ✅ WIRED |
| **UtmLogstashFilterGroupResource** | `PUT /api/utm-logstash-filter-groups` | PUT | `logstash.service.ts` `.updateGroup()` | `/data-parsing` | ✅ WIRED |
| **UtmLogstashFilterGroupResource** | `DELETE /api/utm-logstash-filter-groups/{id}` | DELETE | `logstash.service.ts` `.deleteGroup()` | `/data-parsing` | ✅ WIRED |
| **UtmLogstashPipelineResource** | `GET /api/logstash-pipelines` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmLogstashPipelineResource** | `GET /api/logstash-pipelines/{id}` | GET | `logstash.service.ts` `.getPipeline()` | — | ✅ WIRED |
| **UtmLogstashPipelineResource** | `GET /api/logstash-pipelines/stats` | GET | `logstash.service.ts` `.getPipelineStats()` | — | ✅ WIRED |
| **UtmLogstashPipelineResource** | `DELETE /api/logstash-pipelines/{id}` | DELETE | `logstash.service.ts` `.deletePipeline()` | — | ✅ WIRED |
| **UtmAssetGroupResource** | `GET /api/utm-asset-groups/searchGroupsByFilter` | GET | `scanner.service.ts` `.listAssetGroups()` | `/scanner` | ✅ WIRED |
| **UtmAssetGroupResource** | `POST /api/utm-asset-groups` | POST | `scanner.service.ts` `.createAssetGroup()` | `/scanner` | ✅ WIRED |
| **UtmAssetGroupResource** | `DELETE /api/utm-asset-groups/{id}` | DELETE | `scanner.service.ts` `.deleteAssetGroup()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `GET /api/utm-network-scans` | GET | `scanner.service.ts` `.listAssets()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `GET /api/utm-network-scans/{id}` | GET | `scanner.service.ts` `.getAsset()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `GET /api/utm-network-scans/count` | GET | `scanner.service.ts` `.countAssets()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `GET /api/utm-network-scans/countNewAssets` | GET | `scanner.service.ts` `.countNewAssets()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `POST /api/utm-network-scans/saveOrUpdateCustomAsset` | POST | `scanner.service.ts` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `DELETE /api/utm-network-scans/deleteCustomAsset/{id}` | DELETE | `scanner.service.ts` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `PUT /api/utm-network-scans/updateGroup` | PUT | `scanner.service.ts` `.updateAssetGroup()` | `/scanner` | ✅ WIRED |
| **UtmNetworkScanResource** | `GET /api/utm-network-scans/search-by-filters` | GET | _(not found directly)_ | — | ❌ NOT WIRED |
| **UtmNotificationResource** | `GET /api/notifications` | GET | `notification.service.ts` | Layout/nav | ✅ WIRED |
| **UtmNotificationResource** | `GET /api/notifications/unread-count` | GET | `notification.service.ts` | Layout/nav | ✅ WIRED |
| **UtmNotificationResource** | `PUT /api/notifications/{id}/read` | PUT | `notification.service.ts` | — | ✅ WIRED |
| **UtmNotificationResource** | `PUT /api/notifications/read-all` | PUT | `notification.service.ts` | — | ✅ WIRED |
| **UtmNotificationResource** | `PUT /api/notifications/{id}/status` | PUT | `notification.service.ts` | — | ✅ WIRED |
| **UtmNotificationResource** | `DELETE /api/notifications/{id}` | DELETE | `notification.service.ts` | — | ✅ WIRED |
| **NotificationChannelResource** | `GET /api/notification-channels` | GET | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `POST /api/notification-channels` | POST | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `PUT /api/notification-channels/{id}` | PUT | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `DELETE /api/notification-channels/{id}` | DELETE | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `POST /api/notification-channels/{id}/test` | POST | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `GET /api/notification-routes` | GET | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `POST /api/notification-routes` | POST | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `PUT /api/notification-routes/{id}` | PUT | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **NotificationChannelResource** | `DELETE /api/notification-routes/{id}` | DELETE | `notification.service.ts` | `/admin/notifications` | ✅ WIRED |
| **OpenSearchManagementResource** | `GET /api/opensearch/indices` | GET | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `DELETE /api/opensearch/indices/{index}` | DELETE | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `POST /api/opensearch/indices/{index}/forcemerge` | POST | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `POST /api/opensearch/indices/{index}/refresh` | POST | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `GET /api/opensearch/templates` | GET | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `PUT /api/opensearch/templates/{name}` | PUT | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `DELETE /api/opensearch/templates/{name}` | DELETE | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `GET /api/opensearch/snapshots/repositories` | GET | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `POST /api/opensearch/snapshots/{repository}/{snapshot}` | POST | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `DELETE /api/opensearch/snapshots/{repository}/{snapshot}` | DELETE | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OpenSearchManagementResource** | `POST /api/opensearch/snapshots/{repository}/{snapshot}/restore` | POST | `opensearch-management.service.ts` | `/opensearch` | ✅ WIRED |
| **OverviewResource** | `GET /api/overview/count-alerts-by-severity` | GET | `overview.service.ts` | `/dashboard` | ✅ WIRED |
| **OverviewResource** | `GET /api/overview/count-alerts-today-and-last-week` | GET | `overview.service.ts` | `/dashboard` | ✅ WIRED |
| **OverviewResource** | `GET /api/overview/count-events-by-type` | GET | `overview.service.ts` | `/dashboard` | ✅ WIRED |
| **OverviewResource** | `GET /api/overview/count-alerts-by-status` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **OverviewResource** | `GET /api/overview/top-alerts` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **OverviewResource** | `GET /api/overview/top-alerts-by-category` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **OverviewResource** | `GET /api/overview/events-in-time` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **OverviewResource** | `GET /api/overview/top-windows-events` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmReportSectionResource** | `GET /api/utm-report-sections` | GET | `report.service.ts` `.getSections()` | `/reports` | ✅ WIRED |
| **UtmReportResource** | `GET /api/utm-reports` | GET | _(not found directly)_ | `/reports` | ❌ NOT WIRED |
| **UtmSearchAccelerationResource** | `GET /api/search-acceleration` | GET | _(not found)_ | `/admin/search-acceleration` | ❌ NOT WIRED |
| **UtmSearchAccelerationResource** | `PUT /api/search-acceleration` | PUT | _(not found)_ | `/admin/search-acceleration` | ❌ NOT WIRED |
| **UtmSoarPlaybookResource** | `GET /api/soar/playbooks` | GET | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `GET /api/soar/playbooks/{id}` | GET | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `POST /api/soar/playbooks` | POST | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `PUT /api/soar/playbooks/{id}` | PUT | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `DELETE /api/soar/playbooks/{id}` | DELETE | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `POST /api/soar/playbooks/{id}/execute` | POST | `playbook.service.ts` | `/soar/flows` | ✅ WIRED |
| **UtmSoarPlaybookResource** | `GET /api/soar/audit` | GET | `playbook.service.ts` `.listAudit()` | `/soar/audit` | ✅ WIRED |
| **UtmSocAiResource** | `POST /api/soc-ai/analyze` | POST | `alert.service.ts`, `soc-ai.service.ts` | `/alerts`, `/settings/soc-ai` | ✅ WIRED |
| **UtmSocAiResource** | `GET /api/soc-ai/result/{alertId}` | GET | `alert.service.ts`, `soc-ai.service.ts` | `/alerts` | ✅ WIRED |
| **UtmSocAiResource** | `GET /api/soc-ai/history/{alertId}` | GET | `soc-ai.service.ts` | `/settings/soc-ai` | ✅ WIRED |
| **UtmSocAiResource** | `POST /api/soc-ai/result/{alertId}` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **AlertSseResource** | `GET /api/alerts/stream` (SSE) | GET | `alert.service.ts` (via SSE route) | `/alerts` | ✅ WIRED |
| **LiveEpsResource** | `GET /api/eps/stream` (SSE) | GET | `overview.service.ts` (via SSE route) | `/dashboard` | ✅ WIRED |
| **TfaResource** | `POST /api/tfa/init` | POST | _(login flow, not service file)_ | `/login` | ❌ NOT WIRED |
| **TfaResource** | `POST /api/tfa/verify` | POST | _(login flow)_ | `/login` | ❌ NOT WIRED |
| **TfaResource** | `GET /api/tfa/refresh` | GET | _(login flow)_ | `/login` | ❌ NOT WIRED |
| **TfaEnrollmentResource** | `POST /api/enrollment/tfa` | POST | _(not found)_ | — | ❌ NOT WIRED |
| **ThreatIntelResource** | `GET /api/v1/threat-intel/ioc` | GET | _(not found)_ | `/threat-intel` | ❌ NOT WIRED |
| **ThreatIntelResource** | `GET /api/v1/threat-intel/feeds` | GET | _(not found)_ | `/threat-intel` | ❌ NOT WIRED |
| **ThreatIntelResource** | `PUT /api/v1/threat-intel/feeds/{id}` | PUT | _(not found)_ | `/threat-intel` | ❌ NOT WIRED |
| **ThreatIntelResource** | `POST /api/v1/threat-intel/feeds/{id}/sync` | POST | _(not found)_ | `/threat-intel` | ❌ NOT WIRED |
| **AdversaryAlertsResource** | `POST /api/adversary/alerts` | POST | `alert.service.ts` (adversary page raw fetch) | `/alerts/adversary` | ✅ WIRED |
| **UbaResource** | `GET /api/uba/summary` | GET | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UbaResource** | `GET /api/uba/entities` | GET | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UbaResource** | `GET /api/uba/anomalies` | GET | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UbaResource** | `GET /api/uba/entities/{entityId}/anomalies` | GET | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UbaResource** | `PUT /api/uba/entities/{id}/watchlist` | PUT | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UbaResource** | `PUT /api/uba/anomalies/{id}/status` | PUT | `uba.service.ts` | `/uba` | ✅ WIRED |
| **UtmFederationServiceClientResource** | `GET /api/federation-service/generateApiToken` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmFederationServiceClientResource** | `GET /api/federation-service/token` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAuditorUsersResource** | `GET /api/winlogbeat-info-by-filter` | GET | _(not found)_ | — | ❌ NOT WIRED |
| **UtmAuditorUsersResource** | `GET /api/utm-auditor-users-by-src` | GET | _(not found)_ | — | ❌ NOT WIRED |

---

## 1. Orphaned APIs (Backend endpoints with no frontend caller)

These backend endpoints exist but are never called by the frontend-v2 services:

### Critical Orphans (likely needed by active UI pages)

| API Path | Resource | Notes |
|---|---|---|
| `GET /api/utm-incidents/users-assigned` | UtmIncidentResource | Incident assignee filter — no UI wired |
| `PUT /api/utm-incidents/change-status` | UtmIncidentResource | Incident status change (frontend calls wrong path) |
| `GET /api/utm-incident-histories` | UtmIncidentHistoryResource | Incident history tab exists in `/incidents/[id]` but not called |
| `POST /api/utm-incident-notes` + `GET /api/utm-incident-notes` | UtmIncidentNoteResource | Notes tab in incident detail — not wired |
| `GET /api/utm-incident-variables` (all CRUD) | UtmIncidentVariableResource | `/admin/variables` page exists but has no service calls |
| `GET /api/search-acceleration` + `PUT /api/search-acceleration` | UtmSearchAccelerationResource | Page exists at `/admin/search-acceleration` but no wiring |
| `GET /api/v1/threat-intel/ioc` + feeds | ThreatIntelResource | Page `/threat-intel` exists but has zero service calls |
| `GET /api/identity-providers` (all CRUD) | IdentityProviderConfigResource | SSO/IDP settings page missing all calls |
| `GET /api/utm-compliance-report-config` | ComplianceReportExportResource | Report list not retrieved in compliance page |
| `DELETE /api/utm-compliance-report-config/{id}` | ComplianceReportExportResource | Report deletion not wired |
| `GET /api/agent-manager/agents` | AgentManagerResource | Agents page calls wrong path (see BROKEN section) |
| `GET /api/utm-alert-tags` (POST/PUT/DELETE) | UtmAlertTagResource | Tags can be read but can't be created/edited/deleted |
| `GET /api/compliance-report-schedules-by-user` | UtmComplianceReportScheduleResource | Schedules list not fetched |
| `PUT /api/compliance-report-schedules` | UtmComplianceReportScheduleResource | Schedule update not wired |

### Lower-Priority Orphans (admin/internal)

- `GET /api/management/audits` — Audit log viewer has no page
- `GET/POST/PUT/DELETE /api/authority` — Role management not wired  
- `GET/POST/PUT/DELETE /api/utm-asset-metrics` — No consumer in UI
- `GET/POST/PUT/DELETE /api/utm-integration-confs` and `utm-integrations` — Integrations page at `/integrations` but no service calls
- `GET /api/utm-configuration-parameters/{id}` — Single param fetch not wired
- `POST /api/checkEmailConfiguration` — Email config test not wired
- `GET/POST/PUT/DELETE /api/data-types` — Not wired
- `GET/POST/PUT/DELETE /api/regex-pattern` — Not wired  
- `GET/POST/PUT/DELETE /api/tenant-config` — Not wired
- `GET/PUT/DELETE /api/utm-schedules` — Schedule management not wired
- `GET/PUT /api/api/index-policy/policy` — ISM policy management not wired
- `GET /api/utm-server-modules/modules-with-integrations` — Not wired
- `GET /api/utm-servers` (all CRUD) — Server management not wired
- `GET /api/api/overview/count-alerts-by-status`, `top-alerts`, `events-in-time` — Several overview stats not consumed
- All of `UtmMenuAuthorityResource` — Menu authority CRUD not wired
- `POST /api/menu/save-menu-structure` — Menu editor not wired
- `GET /api/federation-service/*` — Federation token management not wired
- `POST /api/enrollment/tfa` — TFA enrollment not wired (only TFA verify is used in login flow)
- All `UtmAuditorUsersResource` endpoints
- All `UtmImagesResource` endpoints — Branding/logo upload not wired
- `POST /api/edr/events/ingest` — Agent-facing only, should not be in UI
- `GET/POST/PUT/DELETE /api/utm-clients` — Not wired

---

## 2. Broken Frontend Calls (paths that don't match any backend endpoint)

| Frontend Call | Actual Path Used | Expected Backend Path | Service | Issue |
|---|---|---|---|---|
| `agentService.listAgents()` | `GET /api/agents` | `GET /api/agent-manager/agents` | `agent.service.ts:48` | Path prefix mismatch — `agent-manager/` missing |
| `agentService.deleteAgent(id)` | `DELETE /api/agents/{id}` | No delete endpoint on `/api/agent-manager` | `agent.service.ts:72` | No corresponding backend endpoint |
| `agentService.listCollectors()` | `GET /api/utm-collectors` | `GET /api/collectors` | `agent.service.ts:61` | Path mismatch — backend prefix is `/api/collectors` not `/api/utm-collectors` |
| `incident.service.ts updateStatus()` | `POST /api/utm-incidents/status` | `PUT /api/utm-incidents/change-status` | `incident.service.ts` | Wrong method (POST vs PUT) and wrong sub-path (`status` vs `change-status`) |
| `admin.service.ts activateUser()` | `PUT /api/users/activate/{login}` | No activate endpoint in UserResource | `admin.service.ts:49` | Endpoint does not exist in backend |
| `detection.service.ts` | `PUT /api/correlation-rule/bulk-enable` with IDs as body | Backend receives `List<Long>` | `detection.service.ts` | Minor: frontend sends array body as `ids`, backend expects raw list — likely compatible but unverified |
| `admin.service.ts updateConfigParam()` | `PUT /api/utm-configuration-parameters` with single param object | Backend expects `List<UtmConfigurationParameter>` | `admin.service.ts:56` | Type mismatch: backend requires array, frontend sends single object |

---

## 3. Partial / Degraded Wiring

| Endpoint | Issue |
|---|---|
| `PUT /api/utm-configuration-parameters` | Frontend sends a single `ConfigParameter` object; backend `updateConfigurationParameters()` expects `List<UtmConfigurationParameter>`. This will cause a 400 Bad Request at runtime. |
| `GET /api/menu` vs `GET /api/menu/all` | Frontend only calls `/api/menu/all` (full tree). The `/api/menu` paginated endpoint is never called — fine if the tree view is sufficient. |
| `DELETE /api/menu/{id}` | Frontend's `menu.service.ts` calls `DELETE /api/menu/delete-by-url?url=…` which does NOT exist in backend (backend expects `DELETE /api/menu/{id}` with a Long path variable). This is a BROKEN call. |
| `GET /api/elasticsearch/property/values` | Frontend uses `/api/elasticsearch/index/properties` (wired) but does not call `/api/elasticsearch/property/values` or `/api/elasticsearch/property/values-with-count`. |

---

## 4. Notable Field Mapping Mismatches

### UtmConfigurationParameter — Field Name Mismatch

The backend Java entity `UtmConfigurationParameter` uses camelCase Java convention which Jackson serializes as:
- `confParamShort` → JSON key `confParamShort`
- `confParamDescription` → `confParamDescription`
- `confParamValue` → `confParamValue`
- `confParamRegexp` → `confParamRegexp`
- `confParamRequired` → `confParamRequired`

The frontend TypeScript `ConfigParameter` interface in `admin.service.ts` uses:
- `paramShort`
- `paramDescription`
- `paramValue`
- `paramRegex` (vs backend `confParamRegexp`)
- `paramRequired`

**Impact:** The settings page will fail silently — reads will show null/undefined values, updates will send wrong field names and the backend will ignore them (treating updates as nulls).

### UtmConfigurationSection — Field Name Mismatch

Backend fields: `section` (String), `description` (String), `shortName` (SectionType enum), `sectionActive` (Boolean)

Frontend interface uses: `sectionName`, `sectionDescription`, `sectionActive`

`sectionName` maps to backend `section`; `sectionDescription` maps to `description`. These differ in name so the frontend's `sectionName` would be null on deserialization from the API. `sectionActive` matches correctly.

### Incident Status Update

The frontend `incident.service.ts` calls `POST /api/utm-incidents/status` with `{ incidentId: id, status, observation }`, but the backend endpoint is `PUT /api/utm-incidents/change-status` accepting a `UtmIncident` body (requires full object with `id` field). Different HTTP method, different path, and different request body shape.

---

## Summary Statistics

| Status | Count |
|---|---|
| ✅ WIRED | ~85 |
| ⚠️ PARTIAL | ~3 |
| ❌ NOT WIRED | ~130+ |
| 🔴 BROKEN | 6 confirmed |

The frontend-v2 has strong coverage of the core workflows: alerts, incidents (list/create), correlation rules, EDR, SOAR, dashboards, scanner, notifications, compliance (read), and UBA. The biggest gaps are in admin/configuration management (no incident variables page wiring, threat intel page has zero calls, agent manager path is broken, and settings configuration has field-name mismatches that will silently corrupt reads and writes).
