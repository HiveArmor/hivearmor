# S01-T08 — Block Eventprocessor Startup Until OpenSearch Ready

**Sprint:** 1 (Security-Critical — Data Loss)  
**Severity:** CRITICAL  
**Issue ID:** FLOW-02  
**Dependencies:** None (S01-T09 depends on this)  
**Estimated time:** 3 hours

---

## Context

If OpenSearch is not ready when the eventprocessor's writer plugin initializes, `eventQueue` is `nil`. All incoming events are silently discarded with no error, no queue, and no retry. This is a data-loss-on-startup race condition that can cause events to disappear during any rolling restart.

**Affected directory:** `plugins/events/` (the OpenSearch writer plugin)

---

## What to Read First

1. `plugins/events/` — read all `.go` files, especially the writer initialization code
2. `eventprocessor/entrypoint.sh` — understand how plugins are started
3. `local-dev/docker-compose.yml` — find the eventprocessor service and its `depends_on` config
4. `plugins/inputs/` — understand how events flow from inputs to the queue

---

## Implementation Steps

### Step 1: Add OpenSearch health check wait in `plugins/events/` writer initialization

In the writer plugin's init function (wherever `eventQueue` is set), wrap the initialization in a retry loop:

```go
package events

import (
    "context"
    "fmt"
    "net/http"
    "time"
    "log"
)

const (
    osHealthPath      = "/_cluster/health?wait_for_status=yellow&timeout=5s"
    maxStartupRetries = 30
    retryInterval     = 5 * time.Second
)

func waitForOpenSearch(osURL string) error {
    client := &http.Client{Timeout: 10 * time.Second}
    
    for attempt := 1; attempt <= maxStartupRetries; attempt++ {
        resp, err := client.Get(osURL + osHealthPath)
        if err == nil && resp.StatusCode == http.StatusOK {
            resp.Body.Close()
            log.Printf("[events] OpenSearch ready after %d attempt(s)", attempt)
            return nil
        }
        if resp != nil {
            resp.Body.Close()
        }
        log.Printf("[events] OpenSearch not ready (attempt %d/%d): %v. Retrying in %s...",
            attempt, maxStartupRetries, err, retryInterval)
        time.Sleep(retryInterval)
    }
    return fmt.Errorf("OpenSearch not ready after %d attempts", maxStartupRetries)
}

func InitWriter(config WriterConfig) (*EventWriter, error) {
    // Block until OpenSearch is healthy
    if err := waitForOpenSearch(config.OpenSearchURL); err != nil {
        return nil, fmt.Errorf("cannot start event writer: %w", err)
    }
    
    // Now safe to initialize the queue
    queue := make(chan Event, 10000)
    writer := &EventWriter{
        queue:  queue,
        config: config,
    }
    go writer.processQueue()
    return writer, nil
}
```

### Step 2: Propagate startup failure to crash the container (not silently continue)

Find where `InitWriter` is called. If it fails, the plugin must `os.Exit(1)` or return a fatal error — do NOT silently continue with a nil queue:

```go
writer, err := events.InitWriter(cfg)
if err != nil {
    log.Fatalf("[events] FATAL: %v", err)
}
// Only assign to global if non-nil
globalEventQueue = writer.GetQueue()
```

### Step 3: Add docker-compose health check for OpenSearch

In `local-dev/docker-compose.yml`, add a health check to the OpenSearch service:

```yaml
opensearch:
    image: opensearchproject/opensearch:2.11.1
    healthcheck:
        test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health?wait_for_status=yellow || exit 1"]
        interval: 10s
        timeout: 10s
        retries: 20
        start_period: 60s
    # ... rest of config

eventprocessor:
    # ... existing config
    depends_on:
        opensearch:
            condition: service_healthy  # Wait for health check, not just container start
```

### Step 4: Unit test for the wait-for-opensearch logic

Create: `plugins/events/writer_startup_test.go`

```go
package events_test

import (
    "net/http"
    "net/http/httptest"
    "testing"
    "time"
)

func TestWaitForOpenSearch_SucceedsWhenHealthy(t *testing.T) {
    // Mock healthy OpenSearch
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))
    defer server.Close()

    err := waitForOpenSearch(server.URL)
    if err != nil {
        t.Errorf("expected no error, got: %v", err)
    }
}

func TestWaitForOpenSearch_FailsAfterMaxRetries(t *testing.T) {
    // Mock unavailable OpenSearch (connection refused)
    err := waitForOpenSearch("http://127.0.0.1:19999")  // port nothing listens on
    if err == nil {
        t.Error("expected error when OpenSearch unavailable")
    }
}

func TestWaitForOpenSearch_RetriesOnTransientFailure(t *testing.T) {
    callCount := 0
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        callCount++
        if callCount < 3 {
            w.WriteHeader(http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    }))
    defer server.Close()

    // Override retry interval to speed up test
    origInterval := retryInterval
    retryInterval = 10 * time.Millisecond
    defer func() { retryInterval = origInterval }()

    err := waitForOpenSearch(server.URL)
    if err != nil {
        t.Errorf("expected success after retries, got: %v", err)
    }
    if callCount < 3 {
        t.Errorf("expected at least 3 calls, got %d", callCount)
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11

# Compile the events plugin
cd plugins/events && go build ./... && cd ../..

# Run unit tests
cd plugins/events && go test ./... -v -run TestWaitForOpenSearch && cd ../..

# Integration test: start eventprocessor BEFORE OpenSearch and verify it waits
# Stop OpenSearch, start eventprocessor, then start OpenSearch
cd local-dev
docker-compose stop opensearch
docker-compose up eventprocessor -d
# Check logs — should show "OpenSearch not ready, retrying..."
docker-compose logs -f eventprocessor | head -30
# Now start OpenSearch
docker-compose up opensearch -d
# eventprocessor should eventually log "OpenSearch ready" and continue startup
```

---

## Acceptance Criteria

- [ ] Eventprocessor writer blocks for up to 150 seconds (30 × 5s) waiting for OpenSearch
- [ ] If OpenSearch never becomes ready, the container exits with code 1 (not silently continues)
- [ ] `globalEventQueue` is never nil after successful initialization
- [ ] Docker-compose `depends_on: condition: service_healthy` prevents eventprocessor from starting until OpenSearch passes its health check
- [ ] All 3 unit tests pass
- [ ] `go build ./...` succeeds in `plugins/events/`
