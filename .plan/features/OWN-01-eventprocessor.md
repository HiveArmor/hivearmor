# OWN-01: Own the Event Processor

**Priority:** Tier 6 — Strategic  
**Effort:** 8-12 weeks  
**Impact:** 🔴 Critical for independence from upstream UTMStack

---

## Why This Matters

The `eventprocessor` is the brain of the SIEM:
- Receives raw logs from agent-manager via gRPC
- Runs them through filters (normalization)
- Runs them through correlation rules (alert generation)
- Writes normalized logs and alerts to OpenSearch

Currently: `ghcr.io/utmstack/utmstack/eventprocessor:${UTMSTACK_TAG}` — you have zero control.

**You already own:**
- All the filter definitions (`filters/` — 20+ sources)
- All the correlation rules (`rules/` — 20+ sources)
- The filter loading logic (partially in backend `logstash_filter` service)

---

## What the Event Processor Does (reverse-engineered)

```
gRPC stream from agent-manager
    → Log normalization via Logstash-compatible filters
    → Field extraction (via filter/parser pipeline)  
    → Geolocation enrichment (plugins/geolocation)
    → Threat intel correlation (plugins/feeds)
    → Correlation rule engine (rules/*.yaml evaluation)
    → Alert deduplication (plugins/alerts)
    → Write to OpenSearch: 
        - Raw log → index logx-{source}-{date}
        - Alert → index logx-alerts-{date}
```

---

## Build Plan

### Phase A: Understand the wire protocol (1 week)
- Capture what event-processor receives from agent-manager (gRPC proto)
- Capture what it writes to OpenSearch (index mappings)
- Check `agent-manager/protos/` for proto definitions
- Check `agent/protos/` for agent→manager proto

### Phase B: Build a Go event processor (4 weeks)
Create `/event-processor/` Go module:
```
event-processor/
├── main.go
├── server/       # gRPC server (receive logs from agent-manager)
├── pipeline/     # filter + rule evaluation pipeline
├── filters/      # load and apply logstash-compatible filters
├── rules/        # load and evaluate correlation rules (YAML)
├── enrichment/   # geolocation, threat intel
├── dedup/        # alert deduplication
├── writer/       # write to OpenSearch
└── config/
```

### Phase C: Filter compatibility layer (2 weeks)
- Parse Logstash filter syntax (grok, mutate, date, geoip patterns)
- Either: implement a Logstash-compatible subset in Go
- Or: run Logstash as a sidecar, use beats input/output protocol

### Phase D: Correlation rule engine (2 weeks)
- YAML rule format is already defined in `rules/*/`
- Build evaluator: field matching + threshold + time window + aggregation
- Support MITRE technique tagging

### Phase E: Testing & cutover (2 weeks)
- A/B: run new processor in shadow mode, compare output to upstream
- Validate alert quality
- Flip docker-compose to use new image

---

## Quick Win (Short-Term Alternative)

While building OWN-01, you can immediately:
1. **Pin the upstream eventprocessor version** in docker-compose (don't use `${UTMSTACK_TAG}` for eventprocessor) — gives stability
2. **Add a health check API** that monitors eventprocessor via its existing metrics
3. **Document the wire protocol** — proto definitions, index mappings

---

## 📋 SESSION PROMPT

```
I want to start planning OWN-01: Building our own Event Processor for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Currently using: ghcr.io/utmstack/utmstack/eventprocessor upstream image
- Agent sends logs to agent-manager via gRPC
- Event processor: receives from agent-manager, applies filters, runs rules, writes to OpenSearch

Investigation task (do NOT write code yet):
1. Read /agent-manager/protos/ — document all proto message types
2. Read /agent/protos/ — document agent↔manager protocol  
3. Read /filters/linux/ (as example) — understand filter format
4. Read /rules/linux/ (as example) — understand rule format
5. Check /local-dev/docker-compose.yml for event-processor port mappings and volume mounts
6. Check if event-processor exposes any HTTP/gRPC endpoint for management
7. Check /backend/src/main/java/com/nilachakra/service/logstash_pipeline/ — see how backend manages pipeline config

Output: A structured document describing:
- Exact gRPC message formats (input and output)
- Filter format specification  
- Rule format specification
- What OpenSearch indices are written to and their mappings
- Recommended build approach (Go service vs Logstash wrapper)
```
