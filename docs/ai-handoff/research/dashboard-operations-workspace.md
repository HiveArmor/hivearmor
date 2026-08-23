# Dashboard Operations workspace research

Retrieved: **2026-08-21**

Applies to: `/dashboards`, `/dashboards/:id`, `/dashboards/studio`, `/dashboards/:id/edit`

## Official sources and durable conclusions

| Product | Official source | Durable workflow conclusion | HiveArmor implication | Refresh trigger |
|---|---|---|---|---|
| Splunk Dashboard Studio | [Inputs](https://help.splunk.com/en/splunk-cloud-platform/create-dashboards-and-reports/dashboard-studio/10.2.2510/make-dashboards-dynamic-and-interactive/inputs) and [drilldowns](https://help.splunk.com/en/splunk-cloud-platform/create-dashboards-and-reports/simple-xml-dashboards/10.5.2605/drilldown-and-dashboard-interactivity/use-drilldown-for-dashboard-interactivity) | Global time, dropdown, multiselect and text inputs produce tokens consumed by searches; drilldowns preserve clicked context into a search, dashboard or allowlisted URL. | Variables are first-class definition objects. Every panel declares which global context it consumes and emits governed pivots; query text is not concatenated client-side. | Splunk changes input or token semantics. |
| Elastic dashboards | [Workflow](https://www.elastic.co/docs/explore-analyze/dashboards), [controls](https://www.elastic.co/docs/explore-analyze/dashboards/add-controls), and [drilldowns](https://www.elastic.co/docs/explore-analyze/dashboards/drilldowns) | Panels, controls, filters and time range form one exploration context. Managed dashboards are duplicated before editing. Drilldowns preserve context. | Managed HiveArmor content remains read-only; edit means clone. Runtime context is visible and inherited by internal Hunt/entity/incident pivots. | Elastic changes managed content, controls or drilldowns. |
| Microsoft Sentinel / Azure Monitor Workbooks | [Sentinel workbooks](https://learn.microsoft.com/en-us/azure/sentinel/monitor-your-data), [parameters](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-parameters), and [time](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-time) | Templates declare required data types; parameters coordinate global context; chart selection can update parameters; access follows RBAC. | The gallery reports required sources and health. A panel never implies readiness when a connector, scope, or execution contract is missing. | Microsoft changes Workbook parameter or RBAC behavior. |
| Grafana | [Variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/), [version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/), [permissions](https://grafana.com/docs/grafana/latest/administration/user-management/manage-dashboard-permissions/), and [sharing](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) | Variables affect queries, titles, links and transformations; definitions have history, comparison and restoration; permissions derive from folders, teams and roles; sharing is separately governed. | Canonical dashboards need optimistic versions, immutable history/restore, explicit owner/team/access, and audited export/share. Legacy entity CRUD is insufficient. | Grafana changes version, permission or sharing architecture. |

## Resulting HiveArmor structure

1. **Discover:** dense gallery with owner, access, managed state, health, freshness, source count, tags, search/filter/sort and explicit keyboard selection.
2. **Observe:** compact runtime header; sticky tenant/time/variable controls; 12-column panel grid; source, state and freshness per panel.
3. **Investigate:** panel details expose query provenance and an allowlisted internal pivot preserving global and clicked context.
4. **Build:** three-pane low-code Studio with governed panel catalogue, 12-column canvas, inspector, local validation and explicit draft state.
5. **Govern:** managed definitions clone rather than mutate; production save/publish/share remains disabled until authorization, versioning, query budgets, history and audit contracts exist.
6. **Operate safely:** bounded projections, cancellation, stable cache keys, progressive loading, partial/stale states, and no production fixture import.

## Evidence boundary

The backend exposes legacy entity-shaped `/api/ha-dashboards`, `/api/ha-dashboard-visualizations` and `/api/ha-visualizations` routes. They do not establish tenant-scoped authorization, atomic definition versioning, controlled variables, bounded/cancellable execution, source freshness, permissions, sharing, version restore, or signed drilldowns. The production frontend can normalize legacy definitions for discovery, but marks panels `contract_unavailable` and does not call unsafe execution or mutation routes. Full fixture behavior exists only under `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.
