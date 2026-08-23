# Pipeline and ingestion operations research

Retrieved: **2026-08-21**
Purpose: preserve the primary-source research behind HiveArmor's source-to-index operations workspace for future offline/Bedrock sessions. Conclusions are paraphrased product guidance, not copied vendor content, configured thresholds or proof that HiveArmor currently implements the corresponding backend.

## Splunk Monitoring Console

- Primary sources:
  - https://help.splunk.com/en/splunk-enterprise/administer/monitor/9.1/about-the-monitoring-console/about-the-monitoring-console
  - https://help.splunk.com/en/splunk-enterprise/administer/manage-indexers-and-indexer-clusters/10.0/manage-indexes/use-the-monitoring-console-to-view-indexing-performance
  - https://help.splunk.com/en/splunk-enterprise/administer/troubleshoot/10.2/data-acquisition-problems
- Conclusion: operators need topology and role context alongside indexing rate, queue fill, resource use and status. Queue observations require interpretation over time: brief spikes, sustained saturation and normal transient fill are different conditions.
- HiveArmor implication: present one source-to-index flow, keep measured values distinct from configured policy, retain soak history and never convert a single queue or cluster value into an invented health threshold.
- Limitation: Splunk's deployment roles and queues do not map one-to-one to HiveArmor collectors, Redpanda, parsers and OpenSearch.

## Elastic Stack Monitoring and Logstash pipeline viewer

- Primary sources:
  - https://www.elastic.co/guide/en/logstash/current/logstash-pipeline-viewer.html
  - https://www.elastic.co/docs/reference/logstash/monitoring-logstash
- Conclusion: pipeline topology is most actionable when paired with per-pipeline and per-plugin throughput, latency, event counts and stable semantic identifiers. Version/context is needed when comparing executions or finding hotspots.
- HiveArmor implication: correlate stages, sources and parser versions; show missing telemetry honestly; require stable source/parser IDs and progressive diagnostics rather than presenting aggregate cluster health as source health.
- Limitation: Logstash plugin telemetry is vendor-specific and cannot establish the exact metrics or storage contract HiveArmor should expose.

## Microsoft Sentinel connector health

- Primary sources:
  - https://learn.microsoft.com/en-us/azure/sentinel/monitor-data-connector-health
  - https://learn.microsoft.com/en-us/azure/sentinel/configure-data-connector
- Conclusion: connector setup, connection state, data-received freshness and health drift belong in one operational lifecycle. Health events should support automation and investigation rather than being a decorative status badge.
- HiveArmor implication: source onboarding must include identity, parser/schema and validation context; inventory rows need last event/freshness, health provenance and an explicit context drawer; future alerts/automation must use authoritative backend health events.
- Limitation: Sentinel's Azure resource and workspace model differs from HiveArmor tenant/source identities.

## OpenSearch cluster, ingest and Data Prepper monitoring

- Primary sources:
  - https://docs.opensearch.org/latest/monitoring-your-cluster/
  - https://docs.opensearch.org/latest/api-reference/nodes-apis/nodes-stats/
  - https://docs.opensearch.org/latest/data-prepper/managing-data-prepper/monitoring/
  - https://docs.opensearch.org/latest/data-prepper/pipelines/dlq/
- Conclusion: useful pipeline evidence includes ingest totals/current/failed counts, processor statistics, in-flight work and dead-letter provenance. DLQ records must preserve enough origin and failure context for safe diagnosis and replay.
- HiveArmor implication: failure inventory must be grouped and bounded, raw payloads progressively disclosed and redacted, and replay must be previewed, authorized, idempotent and audited. Cluster status alone cannot prove parser or detection-stage health.
- Limitation: Data Prepper is not HiveArmor's event processor; only the operational pattern is reused.

## Product decision

Use one compact source-to-index workspace with five views: Flow, Sources, Parsers, Failures and Capacity. Direct measurements show their provenance and timestamp. Missing per-stage/runtime data stays unavailable. Onboarding and replay use governed previews; production mutations fail closed until durable tenant-bound contracts exist. Heavy detail is progressive, lists are bounded, and raw payloads are not placed in the primary inventory.

Refresh this note when any cited vendor substantially changes monitoring/connector/DLQ guidance, when HiveArmor's canonical topology changes, or when `ING-001`–`ING-010` are revised or implemented.
