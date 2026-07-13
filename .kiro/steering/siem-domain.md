---
inclusion: always
---

# SIEM Domain

## Vocabulary (use these terms consistently)

| Term | Definition |
|---|---|
| **Alert** | Security event produced when a log matches a correlation rule. Stored in `v11-alert-YYYY.MM.DD` OpenSearch indices. |
| **Incident** | A case that groups one or more alerts. Stored in `utm_incident` (PostgreSQL). |
| **Data type** | String ID for a log source category, e.g. `windows-security`, `linux-auth`, `aws-cloudtrail`. Routes logs to matching rules. |
| **Filter** | Logstash-compatible YAML that normalises raw log fields. Stored in `utm_logstash_filter`; written to disk by `com.utmstack.config` plugin. |
| **Correlation rule** | YAML definition in `utm_correlation_rules`. Loaded by `com.utmstack.config` into `workdir/rules/utmstack/`. |
| **Integration** | A vendor technology (e.g. CrowdStrike, Windows). |
| **Module** | UTMStack unit that enables/disables an integration. Stored in `utm_module`. |
| **Data source** | An individual log-sending entity (a host, an AWS account). |
| **Collector** | Software agent that pulls logs from cloud/SaaS APIs. |
| **Tenant config** | `utm_tenant_config` — asset registry with CIA impact scores for correlation. Not multi-tenant isolation. |

## Alert Status Lifecycle (integer values are load-bearing)

```
1 = Automatic Review   (new, unreviewed)
2 = Open               (analyst acknowledged)
3 = In Review          (actively being worked)
4 = Ignored            (suppressed)
5 = Completed          (resolved)
```

These integers are stored in OpenSearch and compared numerically in both backend and frontend. **Do not add or reorder status codes without updating every reference.**

## Alert Severity (string values are load-bearing)

Only three levels: `Low`, `Medium`, `High`. The `alerts` plugin maps them to integers 1/2/3 internally. Do not introduce `Critical` or `Info` without updating every severity reference.

## Correlation Rule YAML Shape

```yaml
- id: <int>              # Low IDs are system-owned — do not modify without forcedSystemMode
  dataTypes: [...]       # Which log data types trigger this rule
  name: "..."
  where: "..."           # Single-event CEL/jmespath expression
  afterEvents:           # Optional: temporal correlation window
    - indexPattern: "v11-*"
      with: [{ field, operator, value }]
      within: "5m"
      count: 10
  deduplicateBy: [...]   # Fields; 7-day dedup window — prevents alert storms
  groupBy: [...]         # Fields; links child alerts to a parent
  severity: "low|medium|high"
  impact: { confidentiality, integrity, availability }  # CIA scores 0-3
  category: "..."        # Must be one of the 23 categories below
  technique: "T####"     # MITRE ATT&CK technique ID
```

Rule categories (23): `antivirus cisco cloud crowdstrike fortinet generic github ibm json linux macos mikrotik netflow nids office365 paloalto pfsense sonicwall sophos suricata syslog vmware windows`

Rule files live in: `rules/<category>/` (shipped defaults) and `workdir/rules/utmstack/` (runtime, written by config plugin).
Filter files live in: `filters/<vendor>/` (shipped defaults) and `workdir/pipeline/filters/` (runtime).

## Event Processing Pipeline

1. **Ingest** — `com.utmstack.inputs` plugin: gRPC + HTTP endpoints receive log streams
2. **Parse** — Logstash-compatible YAML filters applied (from `workdir/pipeline/filters/`)
3. **Enrich** — `com.utmstack.geolocation`: IP → country/city/ASN; `com.utmstack.feeds`: threat indicators
4. **Correlate** — YAML rules evaluated by eventprocessor base against enriched events
5. **Alert** — `com.utmstack.alerts`: dedup (7-day window) → group (parent/child) → index to `v11-alert-*`
6. **Post-process** — backend schedulers: tag rules (30 s), SOAR response rules (30 s)

The config plugin (`com.utmstack.config`) polls PostgreSQL every 30 s and writes updated rules/filters/tenant config to the eventprocessor working directory. **Do not remove or bypass this polling loop.**

## SOAR

- **Response rule**: condition + action, evaluated every 30 s by `UtmAlertResponseRuleService`
- **Playbook**: sequence of `UtmIncidentAction` records; built in the `/soar` UI
- **Agent command**: shell command sent over gRPC bidirectional stream; 5-minute execution timeout; stored in `agent_commands`
- **Automation variable**: key/value substitution token stored in `utm_incident_variable`

## Compliance

- **Standard → Section → Control → QueryConfig** is the hierarchy
- `UtmComplianceReportScheduleService` polls every 5 s for pending scheduled reports
- PDF generation is handled by `web-pdf` (Selenium) — it navigates to the live frontend URL to render

## Do / Don't

- **DO** keep `deduplicateBy` and `groupBy` semantics intact — they are the primary protection against alert storms
- **DO** treat severity and status integers as a stable contract between frontend, backend, and OpenSearch
- **DON'T** change the `v11-alert-*` index field schema without migrating all downstream queries
- **DON'T** modify system rules (low-ID rows in `utm_correlation_rules`) without the `forcedSystemMode` flag
- **DON'T** delete or disable the `com.utmstack.config` plugin — rules and filters will stop updating
