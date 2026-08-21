---
name: opensearch-trace-analytics
description: OpenSearch distributed trace analysis — OTel spans, slow span debugging, error traces, service map queries, GenAI token usage tracking, PPL trace queries. Triggered by "trace analytics", "slow spans", "OpenSearch traces", "distributed tracing", "OTel analysis".
---

# OpenSearch Trace Analytics

Investigate distributed traces and spans in OpenSearch clusters containing OpenTelemetry (OTel) trace data.

## Primary Indices

| Index | Contents |
|-------|---------|
| `otel-v1-apm-span-*` | Individual spans |
| `otel-v2-apm-service-map-*` | Service dependency maps |

## Critical Rules

1. **Discovery first** — never assume index patterns or field names
2. Validate PPL queries against `_plugins/_ppl` when cluster endpoint is reachable
3. For unknown PPL syntax, consult upstream docs — never invent parameters

## Workflow

| Phase | Action |
|-------|--------|
| Connect & Discover | Identify cluster, find trace indices, sample data shape |
| Investigate | Build targeted PPL queries (slow spans, errors, token usage) |
| Deep Analysis | Conversation grouping, tool inspection, cross-service correlation |

## PPL Trace Queries

```ppl
# Find slow spans (>500ms)
source=otel-v1-apm-span-*
| where `durationInNanos` > 500000000
| fields `traceId`, `spanId`, `name`, `serviceName`, `durationInNanos`, `startTime`
| sort -`durationInNanos`
| head 20

# Find error spans
source=otel-v1-apm-span-*
| where `status.code` = 'STATUS_CODE_ERROR'
| stats count() by `serviceName`, `name`
| sort -count()

# Service dependency map - calls per service pair
source=otel-v1-apm-span-*
| where `kind` = 'SPAN_KIND_CLIENT'
| stats count() as call_count by `serviceName`, `attributes.db.system`, `attributes.peer.service`
| sort -call_count
```

## GenAI Operation Tracking

Operations tracked via `` `attributes.gen_ai.operation.name` ``:

| Operation | Field Value |
|-----------|------------|
| Agent invocation | `invoke_agent` |
| Tool execution | `execute_tool` |
| Chat completion | `chat` |
| Embedding | `embeddings` |

```ppl
# Track GenAI token usage by operation
source=otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` IS NOT NULL
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens,
        count() as calls
  by `attributes.gen_ai.operation.name`, `serviceName`
| sort -calls

# Identify LLM latency by model
source=otel-v1-apm-span-*
| where `attributes.gen_ai.system` IS NOT NULL
| eval duration_ms = `durationInNanos` / 1000000
| stats avg(duration_ms) as avg_latency_ms, count() as calls
  by `attributes.gen_ai.system`, `attributes.gen_ai.request.model`
| sort -avg_latency_ms
```

## Trace Tree Reconstruction

```ppl
# Get all spans for a specific trace
source=otel-v1-apm-span-*
| where `traceId` = '<trace-id-here>'
| fields `spanId`, `parentSpanId`, `name`, `serviceName`, `durationInNanos`, `status.code`
| sort `startTime`
```

## MCP Integration

Requires `opensearch-mcp-server-py` supporting:
- Basic auth (local)
- AOS SigV4 (AWS OpenSearch Service)
- AOSS variants (serverless)

Optional: `duckduckgo-mcp-server` for PPL documentation lookup.
