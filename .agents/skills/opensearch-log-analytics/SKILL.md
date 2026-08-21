---
name: opensearch-log-analytics
description: OpenSearch log analysis using PPL and Query DSL — index discovery, schema inspection, error rate analysis, anomaly detection, Fluent Bit/Fluentd integration. Triggered by "analyze logs in OpenSearch", "PPL query", "OpenSearch log search", "error rate OpenSearch", "log analytics".
---

# OpenSearch Log Analytics

Log analysis in OpenSearch using PPL (Pipe Processing Language) and Query DSL.

## CRITICAL: Discovery First

**Never assume index patterns or field names.** Always discover first.

```
Step 1: Ask user for cluster endpoint and credentials
Step 2: List indices matching log patterns
Step 3: Inspect field mappings
Step 4: Build queries using discovered field names
```

## Authentication Options

```python
# Basic auth (local dev)
from opensearchpy import OpenSearch
client = OpenSearch(
    hosts=[{"host": "localhost", "port": 9200}],
    http_auth=("admin", "password"),
    use_ssl=True,
    verify_certs=False  # local dev only
)

# Production: use IAM roles or environment-based credentials
# HiveArmor: credentials in env vars (see local-dev/.env)
```

## Index Discovery

```ppl
# Find log-related indices
GET _cat/indices?h=index,docs.count,store.size&v&s=index
| grep -E "log|event|audit|otel|hive"

# HiveArmor-specific patterns
# _v3_hive_logs-YYYY.MM.DD — raw log events
# _v3_hive_alerts-YYYY.MM.DD — correlated alerts
# NOTE: index pattern is immutable — do not change
```

## Schema Inspection

```bash
# Get field mappings for index
GET _v3_hive_logs-*/_mapping?filter_path=*.mappings.properties

# Sample documents to understand field structure
GET _v3_hive_logs-*/_search
{
  "size": 5,
  "sort": [{"@timestamp": "desc"}]
}
```

## PPL Queries

Note: dotted field names must be backtick-quoted in PPL.

```ppl
# Error rate by service (last 1 hour)
source=_v3_hive_logs-*
| where @timestamp > 'now-1h'
| stats count() as total, count(eval(`log.level` = 'ERROR')) as errors by `service.name`
| eval error_rate = errors / total * 100
| sort -error_rate

# Top 20 source IPs by event count
source=_v3_hive_logs-*
| where @timestamp > 'now-24h'
| stats count() by `source.ip`
| sort -count()
| head 20

# Authentication failures by hour
source=_v3_hive_logs-*
| where `event.category` = 'authentication' and `event.outcome` = 'failure'
| bucket @timestamp span=1h
| stats count() by @timestamp, `source.ip`
| sort @timestamp
```

## Anomaly Detection (PPL `ad` command)

```ppl
# Detect anomalies in request volume
source=_v3_hive_logs-*
| where @timestamp > 'now-7d'
| bucket @timestamp span=1h
| stats count() as request_count by @timestamp, `service.name`
| ad time_field=@timestamp target_field=request_count
| where is_anomaly = true
```

## Query DSL Fallbacks

```json
// When PPL lacks needed capability
GET _v3_hive_logs-*/_search
{
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-1h" } } },
        { "term": { "event.outcome": "failure" } }
      ]
    }
  },
  "aggs": {
    "by_source": {
      "terms": { "field": "source.ip", "size": 20 }
    }
  },
  "size": 0
}
```

## Fluent Bit Integration

```yaml
# HiveArmor Fluent Bit config for log shipping
[OUTPUT]
    Name  opensearch
    Host  opensearch
    Port  9200
    Index _v3_hive_logs-%Y.%m.%d
    HTTP_User admin
    HTTP_Passwd ${OPENSEARCH_PASSWORD}
    tls On
    tls.verify Off
```

## Verification Rule

If a cluster endpoint is available, verify queries against it. If running offline, explicitly mark queries as "unverified — test before using in production."
