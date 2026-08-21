---
name: opensearch-patterns
description: OpenSearch query patterns for HiveArmor — index naming, DSL query builders, bulk write, threat-intel enrichment queries, aggregations for dashboards. Use for all OpenSearch work.
metadata:
  type: skill
  source: HiveArmor-specific (event-processor, backend queries)
---

# OpenSearch Patterns — HiveArmor

## Index Pattern (IMMUTABLE — do not change)
```
_v3_hive_<type>-YYYY.MM.DD
```
Examples:
- `_v3_hive_alert-2026.07.15`
- `_v3_hive_generic-2026.07.15`
- `_v3_hive_lookup-threat-intel` (no date — reference index)

**Changing this pattern requires migrating every existing index across all services. Never change it.**

## Authentication
```go
// Go — use basic auth, skip TLS verify only in dev (SEC-04 in prod)
client, err := opensearch.NewClient(opensearch.Config{
    Addresses: []string{osURL},
    Username:  osUser,
    Password:  osPass,
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{
            InsecureSkipVerify: isDev,  // false in production
        },
    },
})
```

```java
// Java — use RestHighLevelClient with SSL
// Credentials from env vars: ELASTICSEARCH_HOST, ELASTICSEARCH_USER, ELASTICSEARCH_PASSWORD
```

## Query Patterns — Use DSL Builder, Never String Concat

### Match query (Java — use SearchUtil)
```java
// GOOD — parameterized
SearchSourceBuilder source = new SearchSourceBuilder()
    .query(QueryBuilders.matchQuery("source", userInput))
    .size(25)
    .from(page * 25);

// BAD — injection risk
String query = "{\"query\":{\"match\":{\"source\":\"" + userInput + "\"}}}";
```

### Bool query with filters (common alert query pattern)
```java
BoolQueryBuilder bool = QueryBuilders.boolQuery()
    .must(QueryBuilders.rangeQuery("@timestamp")
        .gte("now-24h")
        .lte("now"))
    .filter(QueryBuilders.termQuery("severity.keyword", severity))
    .filter(QueryBuilders.termQuery("status.keyword", "open"))
    .mustNot(QueryBuilders.termQuery("tags.keyword", "suppressed"));
```

### Aggregations (dashboard widgets)
```java
// Severity distribution (donut chart)
TermsAggregationBuilder severityAgg = AggregationBuilders
    .terms("by_severity")
    .field("severity.keyword")
    .size(10);

// Alert timeline histogram (heatmap)
DateHistogramAggregationBuilder timelineAgg = AggregationBuilders
    .dateHistogram("timeline")
    .field("@timestamp")
    .calendarInterval(DateHistogramInterval.HOUR)
    .subAggregation(AggregationBuilders.terms("by_severity").field("severity.keyword"));
```

### Threat intel lookup (feeds.go pattern)
```go
// Query threat-intel reference index
query := map[string]interface{}{
    "query": map[string]interface{}{
        "bool": map[string]interface{}{
            "filter": []interface{}{
                map[string]interface{}{"term": map[string]interface{}{"type": "threat-intel"}},
                map[string]interface{}{"term": map[string]interface{}{"ip": ipAddress}},
            },
        },
    },
    "size": 1,
    "_source": []string{"ip", "malicious", "source", "tags"},
}
```

## Bulk Write (event-processor writer pattern)
```go
// Batch alerts for bulk indexing — reduce OpenSearch write load
type BulkItem struct {
    Index string
    Body  interface{}
}

func bulkIndex(client *opensearch.Client, items []BulkItem) error {
    var buf bytes.Buffer
    for _, item := range items {
        meta := map[string]interface{}{
            "index": map[string]interface{}{
                "_index": item.Index,
            },
        }
        if err := json.NewEncoder(&buf).Encode(meta); err != nil {
            return err
        }
        if err := json.NewEncoder(&buf).Encode(item.Body); err != nil {
            return err
        }
    }
    _, err := client.Bulk(bytes.NewReader(buf.Bytes()))
    return err
}
```
Target batch size: 100 documents or 5MB, whichever comes first.

## Index Template (for new alert/event types)
```json
{
  "index_patterns": ["_v3_hive_<newtype>-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "hivearmor-default-policy"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "severity": { "type": "keyword" },
        "source": { "type": "keyword" },
        "message": { "type": "text", "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } } },
        "source_ip": { "type": "ip" },
        "dest_ip": { "type": "ip" }
      }
    }
  }
}
```

## ISM Policy (Index State Management — rollover)
Indices roll over daily by date suffix. ISM policy handles:
- Hot (0-7 days): replicas=1, searchable
- Warm (7-30 days): force-merged, read-only
- Delete (>90 days): configurable per customer
