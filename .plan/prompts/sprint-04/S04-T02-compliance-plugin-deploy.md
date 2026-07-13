# S04-T02 — Deploy Compliance Orchestrator Plugin

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** HIGH — Enterprise compliance feature completely disabled  
**Issue ID:** COMPLIANCE-01  
**Dependencies:** None  
**Estimated time:** 4 hours

---

## Context

The compliance orchestrator plugin is **fully implemented** for HIPAA, PCI-DSS, ISO27001, NIST CSF, and SOC2 frameworks. However, it is wired into zero Dockerfiles or docker-compose files. The compliance posture tab shows `DEMO_FRAMEWORKS` static data because the plugin never runs.

**Plugin location:** `plugins/compliance-orchestrator/`  
**Deployment target:** Should be added to the eventprocessor container OR as its own sidecar container.

---

## What to Read First

1. `plugins/compliance-orchestrator/` — read all Go files to understand:
   - How it initializes (main function or plugin entry point)
   - What environment variables it reads (OpenSearch URL, backend URL, etc.)
   - What OpenSearch indices it writes to
   - Its gRPC protocol or HTTP interface (does it register with the backend?)
2. `eventprocessor/entrypoint.sh` — how existing plugins are started
3. `eventprocessor/Dockerfile` — what's already included
4. `local-dev/docker-compose.yml` — eventprocessor service definition
5. Other plugin examples: `plugins/inputs/main.go`, `plugins/geolocation/` — as patterns

---

## Implementation Steps

### Step 1: Understand the compliance orchestrator's interface

Read `plugins/compliance-orchestrator/main.go` (or equivalent). Identify:
- Does it run as a daemon or a scheduled job?
- Does it write directly to OpenSearch? What index pattern? (e.g., `v11-compliance-*`)
- Does it expose an HTTP or gRPC endpoint?
- What config/env vars does it need?

### Step 2: Add compliance orchestrator to eventprocessor entrypoint

In `eventprocessor/entrypoint.sh`, add the compliance orchestrator alongside other plugins:

```bash
#!/bin/bash
set -e

# ... existing plugin starts ...

# Start compliance orchestrator
/usr/local/bin/compliance-orchestrator &
COMPLIANCE_PID=$!

# ... existing wait logic ...
```

**If using supervisord (from S05-T01):** Add a `[program:compliance-orchestrator]` section to the supervisord config instead.

### Step 3: Add the binary to the eventprocessor Dockerfile

In `eventprocessor/Dockerfile`:

```dockerfile
# Build compliance orchestrator
FROM golang:1.21-alpine AS compliance-builder
WORKDIR /app
COPY plugins/compliance-orchestrator/ .
RUN go build -o compliance-orchestrator .

# Final stage
FROM ... AS final
# ... existing content ...
COPY --from=compliance-builder /app/compliance-orchestrator /usr/local/bin/compliance-orchestrator
```

### Step 4: Add environment variables to docker-compose

In `local-dev/docker-compose.yml`, add required env vars to the eventprocessor service:

```yaml
eventprocessor:
    environment:
        # ... existing env vars ...
        - COMPLIANCE_ENABLED=true
        - COMPLIANCE_CHECK_INTERVAL=3600  # seconds between compliance checks
        - COMPLIANCE_OPENSEARCH_URL=${OPENSEARCH_URL:-http://opensearch:9200}
        - COMPLIANCE_BACKEND_URL=${BACKEND_URL:-http://backend:8088}
```

Find the exact env var names by reading `plugins/compliance-orchestrator/config.go` or equivalent.

### Step 5: Build and verify the plugin compiles

```bash
cd plugins/compliance-orchestrator
go build ./...
go vet ./...
```

If there are compilation errors, fix them before proceeding.

### Step 6: Create a health check endpoint in the plugin

Add a simple HTTP health endpoint so the backend can query compliance orchestrator status:

```go
// In main.go or health.go:
http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "status": "ok",
        "frameworks": enabledFrameworks,
        "lastRun": lastRunTime,
    })
})
http.ListenAndServe(":8094", nil)  // Use a port not already taken
```

### Step 7: Write integration test for deployment

Create: `plugins/compliance-orchestrator/integration_test.go`

```go
//go:build integration

package main_test

import (
    "net/http"
    "testing"
    "time"
)

func TestComplianceOrchestratorHealth(t *testing.T) {
    // Give the server time to start
    time.Sleep(2 * time.Second)
    
    resp, err := http.Get("http://localhost:8094/health")
    if err != nil {
        t.Fatalf("Health endpoint not reachable: %v", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        t.Errorf("Health endpoint returned %d, want 200", resp.StatusCode)
    }
}
```

---

## Test Commands

```bash
# Build the plugin:
cd plugins/compliance-orchestrator && go build ./... && go vet ./...

# Run unit tests:
go test ./...

# Build the full eventprocessor image with the plugin:
cd /Users/encryptshell/GIT/UTMStack-11
docker build -f eventprocessor/Dockerfile -t armorsight-eventprocessor:test .

# Verify the binary is present in the image:
docker run --rm armorsight-eventprocessor:test ls -la /usr/local/bin/compliance-orchestrator

# Start the stack and check the plugin runs:
cd local-dev && docker-compose up eventprocessor -d
docker-compose logs eventprocessor | grep -i "compliance"
# Should show: "[compliance-orchestrator] Started" or similar

# Test health endpoint:
curl -s http://localhost:8094/health | jq '.'
```

---

## Acceptance Criteria

- [ ] `plugins/compliance-orchestrator/` compiles with `go build ./...`
- [ ] Binary is included in the eventprocessor Dockerfile
- [ ] Plugin starts when eventprocessor container starts
- [ ] Health endpoint `/health` responds at the configured port
- [ ] Environment variables documented in `.env.example`
- [ ] Plugin logs appear in `docker-compose logs eventprocessor`
- [ ] S04-T03 (wire compliance posture) can now be implemented (this task is a prerequisite)
