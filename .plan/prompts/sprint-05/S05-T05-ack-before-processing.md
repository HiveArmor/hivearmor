# S05-T05: Fix Premature gRPC Ack Before Log Processing Completes

**Sprint:** 5 (Reliability + Performance)
**Severity:** Critical
**Issue ID:** FLOW-01
**Dependencies:** None (S05-T06 depends on this)
**Estimated time:** 2–4 hours

---

## Context

The `inputs` plugin receives log events from the collector via a bidirectional gRPC stream (`ProcessLog`, `handlers.go` line 243). For each received `Log`, the current execution order is:

1. `srv.Recv()` — receive the log from the collector
2. Set missing default fields (UUID, tenant, timestamp, etc.)
3. `localLogsChannel <- l` — push the log onto a buffered channel (`make(chan *plugins.Log, cpu*100)`)
4. `srv.Send(&plugins.Ack{LastId: l.Id})` — **send the Ack back to the collector immediately**

The problem: step 4 (the Ack) happens immediately after the log is enqueued into `localLogsChannel`, but the channel is only a buffer — the log has not yet been forwarded to the event processing engine. A pool of `cpu` goroutines (`sendLog()` in `output.go`) drain `localLogsChannel` and forward logs to the engine over a separate gRPC connection. If the event processor crashes, restarts, or the `sendLog()` workers are stuck, the Ack has already been sent and the collector will not retry delivery — the event is permanently lost.

Additionally, the `localLogsChannel` is a blocking channel send with no context or timeout. If the channel buffer is full (all `cpu*100` slots occupied because `sendLog()` workers are stuck), `ProcessLog` blocks indefinitely with no deadline. S05-T06 (LogQueue backpressure) depends on this fix being in place first.

The fix has two parts: (1) make the Ack conditional on successful delivery to the engine rather than on enqueue into the buffer, and (2) add a non-blocking enqueue path with an error response to the collector when the channel is at capacity.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/plugins/inputs/handlers.go` — lines 243–280. The `ProcessLog` function. Focus on the ordering of `localLogsChannel <- l` (line 271) and `srv.Send(&plugins.Ack{...})` (line 273).
2. `/Users/encryptshell/GIT/UTMStack-11/plugins/inputs/output.go` — the `sendLog()` function. This is the async consumer of `localLogsChannel`. Understand: it sends to the engine and receives an Ack back from the engine. The engine Ack is currently never propagated back to the collector.
3. `/Users/encryptshell/GIT/UTMStack-11/plugins/inputs/main.go` — lines 62–68. How `localLogsChannel` is sized (`cpu * 100`) and how many `sendLog()` workers are spawned.
4. The go-sdk `plugins.Ack` struct at `go/pkg/mod/github.com/threatwinds/go-sdk@v1.1.26/plugins/plugins.pb.go` line 117. Note that `Ack.LastId` is the only meaningful field; there is no error field in the current proto. This constrains the fix.

---

## Implementation Steps

### Approach

The cleanest fix that does not require a proto change is to replace the fire-and-forget channel enqueue with a synchronous round-trip to the engine inside `ProcessLog` itself, using a per-log response channel. However, that would eliminate the batching benefit of the worker pool.

A pragmatic middle ground — and the right fix for this severity — is:

1. Switch `localLogsChannel <- l` to a **non-blocking select** with a timeout context. If the channel is full, return an error to the gRPC stream (which causes the collector to retry) rather than silently blocking.
2. Replace the immediate `srv.Send(Ack)` with sending the Ack only after `sendLog()` has confirmed delivery to the engine.

Step 2 requires a per-log acknowledgment channel. Here is the implementation:

### Step 1 — Add a result channel to the Log wrapper

In `handlers.go` (or a new `types.go`), define a wrapper type so `sendLog()` can signal completion back to `ProcessLog`:

```go
// logEntry wraps a Log with a channel for the delivery result.
// The sender writes nil on success, error on failure.
// The channel is buffered(1) so sendLog never blocks if ProcessLog has moved on.
type logEntry struct {
    log    *plugins.Log
    result chan error
}
```

Change `localLogsChannel` from `chan *plugins.Log` to `chan *logEntry` in `main.go`:

```go
// main.go
var localLogsChannel chan *logEntry

// in init/setup:
localLogsChannel = make(chan *logEntry, cpu*100)
```

### Step 2 — Rewrite ProcessLog to wait for delivery confirmation

Replace the `ProcessLog` loop in `handlers.go`:

```go
func (i *integration) ProcessLog(srv plugins.Integration_ProcessLogServer) error {
    for {
        l, err := srv.Recv()
        if err != nil {
            return err
        }

        // Set defaults (unchanged from original)
        if l.Id == "" { l.Id = uuid.New().String() }
        if l.TenantId == "" { l.TenantId = defaultTenant }
        if l.DataType == "" { l.DataType = "generic" }
        if l.DataSource == "" { l.DataSource = "unknown" }
        if l.Timestamp == "" { l.Timestamp = time.Now().UTC().Format(time.RFC3339Nano) }

        entry := &logEntry{
            log:    l,
            result: make(chan error, 1),
        }

        // Non-blocking enqueue: if the channel is full, signal the collector
        // to retry (by returning an error, which terminates this stream; the
        // collector's retry logic re-dials and resends).
        select {
        case localLogsChannel <- entry:
        default:
            return catcher.Error("input channel full, rejecting log for retry", nil, map[string]any{
                "process": "plugin_com.utmstack.inputs",
                "lastId":  l.Id,
            })
        }

        // Wait for sendLog() to confirm delivery to the engine before Acking.
        // Use the gRPC stream context so we don't block forever if the stream
        // is cancelled while waiting.
        select {
        case deliveryErr := <-entry.result:
            if deliveryErr != nil {
                return catcher.Error("failed to deliver log to engine", deliveryErr, map[string]any{
                    "process": "plugin_com.utmstack.inputs",
                    "lastId":  l.Id,
                })
            }
        case <-srv.Context().Done():
            return srv.Context().Err()
        }

        // Ack only after confirmed delivery to the engine.
        if err := srv.Send(&plugins.Ack{LastId: l.Id}); err != nil {
            return catcher.Error("failed to send ack", err, map[string]any{
                "process": "plugin_com.utmstack.inputs",
                "lastId":  l.Id,
            })
        }
    }
}
```

### Step 3 — Rewrite sendLog() to signal delivery result

In `output.go`, update `sendLog()` to write to `entry.result` after the engine confirms receipt:

```go
func sendLog() {
    // (existing connection setup and reconnect logic unchanged)
    go func() {
        for {
            entry := <-localLogsChannel
            err := inputClient.Send(entry.log)
            if err != nil {
                entry.result <- err
                _ = catcher.Error("failed to send log to engine", err, map[string]any{
                    "process": "plugin_com.utmstack.inputs",
                    "lastId":  entry.log.Id,
                })
                restart <- true
                return
            }
            // Receive ack from engine before signalling success
            ack, ackErr := inputClient.Recv()
            if ackErr != nil {
                entry.result <- ackErr
                _ = catcher.Error("failed to receive ack from engine", ackErr, map[string]any{
                    "process": "plugin_com.utmstack.inputs",
                    "lastId":  entry.log.Id,
                })
                restart <- true
                return
            }
            _ = ack // ack.LastId could be logged at trace level if needed
            entry.result <- nil
        }
    }()
    // (existing restart/reconnect select loop unchanged)
}
```

### Step 4 — Apply the same non-blocking pattern to HTTP handlers

`handlers.go` lines 122 and 152 (the HTTP `/log` and `/github` endpoints) also enqueue to `localLogsChannel` with a bare blocking send. Update them to use the same non-blocking select and `logEntry` wrapper:

```go
// HTTP /log handler (around line 122) — before:
localLogsChannel <- l
c.JSON(http.StatusOK, plugins.Ack{LastId: l.Id})

// After:
entry := &logEntry{log: l, result: make(chan error, 1)}
select {
case localLogsChannel <- entry:
default:
    c.JSON(http.StatusServiceUnavailable, gin.H{"error": "input channel full, retry later"})
    return
}
select {
case err := <-entry.result:
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
}
c.JSON(http.StatusOK, plugins.Ack{LastId: l.Id})
```

---

## Test Commands

```bash
# Build the inputs plugin
cd /Users/encryptshell/GIT/UTMStack-11/plugins/inputs
go build ./...

# Run unit tests
go test ./... -v

# Run with race detector
go test -race ./...

# Vet
go vet ./...
```

Write this unit test in `plugins/inputs/handlers_test.go`:

```go
package inputs_test

import (
    "context"
    "testing"
    "github.com/stretchr/testify/assert"
    // import your local package
)

// TestProcessLog_AckOnlyAfterDelivery verifies that the Ack is sent
// only after the engine has confirmed receipt.
func TestProcessLog_AckOnlyAfterDelivery(t *testing.T) {
    // Set up a mock gRPC stream that captures Recv/Send calls in order
    // and a mock sendLog worker that introduces a deliberate delay.
    // Assert that the Ack's sequence number in the stream matches the
    // order in which the mock worker signals delivery, not the order
    // in which logs were enqueued.
    //
    // Minimal smoke test: confirm that with a stuck worker, no Ack is
    // sent until the result channel is written.
    resultCh := make(chan error, 1)
    ackSent := false

    // simulate the ProcessLog wait-loop logic in isolation
    go func() {
        // worker takes 50ms then succeeds
        time.Sleep(50 * time.Millisecond)
        resultCh <- nil
    }()

    ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
    defer cancel()

    select {
    case deliveryErr := <-resultCh:
        assert.NoError(t, deliveryErr)
        ackSent = true
    case <-ctx.Done():
        t.Fatal("timed out waiting for delivery confirmation")
    }

    assert.True(t, ackSent, "Ack must be sent after delivery, not before")
}

// TestProcessLog_ChannelFullReturnsError verifies that when localLogsChannel
// is full, ProcessLog returns an error to the collector rather than blocking.
func TestProcessLog_ChannelFullReturnsError(t *testing.T) {
    // Fill the channel to capacity
    ch := make(chan *logEntry, 1)
    ch <- &logEntry{log: &plugins.Log{Id: "sentinel"}, result: make(chan error, 1)}

    entry := &logEntry{log: &plugins.Log{Id: "overflow"}, result: make(chan error, 1)}
    var rejected bool
    select {
    case ch <- entry:
        rejected = false
    default:
        rejected = true
    }
    assert.True(t, rejected, "channel full: entry must be rejected, not silently dropped")
}
```

---

## Acceptance Criteria

- [ ] The `plugins.Ack` is sent to the collector **only after** `sendLog()` has confirmed that the log was successfully forwarded to the event processing engine (engine Ack received).
- [ ] When `localLogsChannel` is full, `ProcessLog` returns an error to the gRPC stream (causing the collector to retry) rather than blocking indefinitely.
- [ ] HTTP handlers (`/log`, `/github`) use the same non-blocking enqueue pattern and return HTTP 503 when the channel is full.
- [ ] `go build ./...` succeeds with no errors.
- [ ] `go test -race ./...` passes with no data races.
- [ ] `go vet ./...` reports no issues.
- [ ] A simulated engine outage (stop the event-processor container) causes the collector to stop receiving Acks and begin retrying, rather than receiving false Acks and losing events.
