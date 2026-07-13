# S05-T06: LogQueue Backpressure and Dead-Letter Queue

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** FLOW-03
**Dependencies:** S05-T05 (ack timing must be fixed first)
**Estimated time:** 3–4 hours

---

## Context

`LogQueue` in `agent/agent/logprocessor.go` (line 32) is a buffered channel of size 10,000 (`make(chan *plugins.Log, 10000)`). It is the central queue between all collectors (syslog, netflow, file, platform, auditd) and the single `processLogs()` consumer that forwards events to the inputs plugin via gRPC.

When the event processor is slow or the gRPC connection to the inputs plugin is unavailable, `processLogs()` stalls and the channel fills. The behaviour at that point is inconsistent and dangerous:

- **Blocking collectors** (syslog `handler.go:150`, netflow `parser.go:58`, Linux platform `linux_amd64.go:125` / `linux_arm64.go:125`, filebeat `filebeat_amd64.go:175`, darwin `darwin.go:127`): these goroutines block indefinitely on `queue <- log`. A blocked syslog handler means the UDP listener stops processing new datagrams — the kernel buffer fills and the remote syslog sender experiences packet loss with no explicit signal.
- **Non-blocking collectors** (file `file.go:265`, Windows `windows_amd64.go:345` / `windows_arm64.go:343`, auditd `stream.go:56`): these silently drop events with a log message. There is no metric, no dead-letter storage, no way for an operator to know how many events were lost.
- **Retry path** (`logprocessor.go:186`, `CleanCountedLogs()`): the 10-minute retry loop re-enqueues unprocessed DB records using a **blocking** send back into `LogQueue`. If the queue is full when the retry fires, it deadlocks the retry goroutine indefinitely.

This task must be completed **after S05-T05** because that fix changes the per-log confirmation model in the inputs plugin, which affects what "processed" means at the agent level.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/agent/agent/logprocessor.go` — the entire file. Key lines:
   - Line 32: `LogQueue = make(chan *plugins.Log, 10000)` — the declaration.
   - Lines 130–170: `processLogs()` — the consumer. Reads from `LogQueue`, persists to DB, sends over gRPC, marks `processed=true`.
   - Lines 186–203: `CleanCountedLogs()` — the retry goroutine. Uses a blocking send at line 195 — this is the deadlock risk.
2. `/Users/encryptshell/GIT/UTMStack-11/agent/collector/syslog/handler.go` line 150 — blocking send.
3. `/Users/encryptshell/GIT/UTMStack-11/agent/collector/auditd/stream.go` lines 56–63 — the best existing non-blocking pattern; use this as the reference for the fix.
4. `/Users/encryptshell/GIT/UTMStack-11/agent/collector/file/file.go` lines 265–273 — another non-blocking drop with log message.
5. `/Users/encryptshell/GIT/UTMStack-11/agent/collector/collector.go` lines 47–63 — how `LogQueue` is wired to each collector as the `queue` parameter.

---

## Implementation Steps

### Step 1 — Replace the blocking retry send with a non-blocking one

**File:** `agent/agent/logprocessor.go`, `CleanCountedLogs()` around line 195.

**Current code:**
```go
LogQueue <- &plugins.Log{ ... }  // blocking — deadlocks if queue is full
```

**Fixed code:**
```go
select {
case LogQueue <- &plugins.Log{
    Id:         l.Id,
    DataType:   l.DataType,
    DataSource: l.DataSource,
    TenantId:   l.TenantId,
    Timestamp:  l.Timestamp.Format(time.RFC3339Nano),
    Raw:        l.Raw,
}:
    // re-enqueued successfully
default:
    // Queue still full — leave the DB record with processed=false.
    // It will be retried at the next CleanCountedLogs tick.
    log.Logger.Warning("logprocessor", fmt.Sprintf(
        "LogQueue full during retry; deferring log id=%s", l.Id))
}
```

This eliminates the deadlock. The unprocessed DB records are not lost — they remain with `processed=false` and will be picked up on the next 10-minute tick.

### Step 2 — Fix blocking sends in syslog and netflow collectors

These collectors must not block the input goroutine when the queue is full. Apply the same non-blocking pattern used in `auditd/stream.go`:

**File:** `agent/collector/syslog/handler.go` around line 150:

```go
// Before:
queue <- &plugins.Log{ ... }

// After:
log := &plugins.Log{
    // ... same fields as before
}
select {
case queue <- log:
default:
    logsDropped.Add(1) // see Step 4
    logger.Warning("syslog", fmt.Sprintf(
        "LogQueue full: dropping syslog event from %s", msg.Client))
}
```

**File:** `agent/collector/netflow/parser.go` around line 58:

```go
// Before:
queue <- &plugins.Log{ ... }

// After:
select {
case queue <- &plugins.Log{ ... }:
default:
    logsDropped.Add(1)
    logger.Warning("netflow", "LogQueue full: dropping netflow record")
}
```

Apply the same fix to any remaining blocking send in `linux_amd64.go:125`, `linux_arm64.go:125`, `filebeat_amd64.go:175`, and `darwin.go:127`.

### Step 3 — Add a queue-depth telemetry log

In `logprocessor.go`, add a periodic goroutine that logs the queue depth so an operator can see saturation in the log stream:

```go
// Start in the same function that starts processLogs():
func (l *LogProcessor) Start() {
    go l.processLogs(...)
    go l.CleanCountedLogs()
    go l.monitorQueueDepth() // new
}

func (l *LogProcessor) monitorQueueDepth() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    for range ticker.C {
        depth := len(LogQueue)
        cap := cap(LogQueue)
        pct := float64(depth) / float64(cap) * 100
        if pct > 50 {
            log.Logger.Warning("logprocessor", fmt.Sprintf(
                "LogQueue depth=%d/%d (%.0f%%)", depth, cap, pct))
        }
        if pct > 90 {
            log.Logger.Error("logprocessor", fmt.Sprintf(
                "LogQueue near capacity: depth=%d/%d (%.0f%%); events may be dropped", depth, cap, pct))
        }
    }
}
```

### Step 4 — Add a dropped-event counter

Declare an atomic counter at the top of `logprocessor.go` (or in a shared `metrics.go`):

```go
import "sync/atomic"

var logsDropped atomic.Int64
```

Increment it in every collector's `default:` branch (Step 2). Expose it in `monitorQueueDepth`:

```go
dropped := logsDropped.Load()
if dropped > 0 {
    log.Logger.Warning("logprocessor", fmt.Sprintf(
        "Total logs dropped since start: %d", dropped))
}
```

### Step 5 — Add a simple dead-letter file (optional but recommended)

For operators who need to recover dropped events, write discarded logs to a rolling dead-letter file rather than logging a one-liner and discarding:

```go
func writeToDLQ(source string, l *plugins.Log) {
    dlqPath := filepath.Join(config.GetDataPath(), "dlq", "dropped-logs.jsonl")
    _ = os.MkdirAll(filepath.Dir(dlqPath), 0755)
    f, err := os.OpenFile(dlqPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    if err != nil {
        return
    }
    defer f.Close()
    entry, _ := json.Marshal(map[string]any{
        "ts":         time.Now().UTC().Format(time.RFC3339Nano),
        "source":     source,
        "id":         l.Id,
        "dataType":   l.DataType,
        "dataSource": l.DataSource,
        "tenantId":   l.TenantId,
        "raw":        l.Raw,
    })
    _, _ = f.Write(append(entry, '\n'))
}
```

Call `writeToDLQ("syslog", log)` (or `"netflow"`, `"file"`, etc.) in each collector's `default:` branch in addition to (or instead of) the warning log.

---

## Test Commands

```bash
# Build the agent
cd /Users/encryptshell/GIT/UTMStack-11/agent
go build ./...

# Unit tests with race detector
go test -race ./... -v

# Vet
go vet ./...

# Integration: fill the queue artificially and verify no deadlock
# (manual test procedure)
# 1. Start local-dev stack
# 2. Stop the event-processor container: docker stop utmstack-event-processor
# 3. Send 20,000 syslog messages via netcat: for i in $(seq 20000); do echo "<34>$i test message" | nc -u -w0 127.0.0.1 7014; done
# 4. Observe agent logs: docker logs utmstack-agent -f | grep -E "(LogQueue|dropped|DLQ)"
# 5. Verify: no goroutine hangs, dropped events are counted, DLQ file is written
# 6. Restart event-processor: docker start utmstack-event-processor
# 7. Verify: retry loop re-enqueues DB records without deadlock
```

Write this unit test in `agent/agent/logprocessor_test.go`:

```go
func TestCleanCountedLogs_DoesNotDeadlockWhenQueueFull(t *testing.T) {
    // Fill LogQueue to capacity
    originalCap := 10
    LogQueue = make(chan *plugins.Log, originalCap)
    for i := 0; i < originalCap; i++ {
        LogQueue <- &plugins.Log{Id: fmt.Sprintf("fill-%d", i)}
    }

    // The retry send must not block — it must return within a short timeout
    done := make(chan struct{})
    go func() {
        // simulate the re-enqueue logic from CleanCountedLogs
        select {
        case LogQueue <- &plugins.Log{Id: "retry-1"}:
        default:
            // expected: queue full, skip
        }
        close(done)
    }()

    select {
    case <-done:
        // pass: no deadlock
    case <-time.After(500 * time.Millisecond):
        t.Fatal("CleanCountedLogs retry blocked — deadlock detected")
    }
}

func TestMonitorQueueDepth_LogsWarningAbove50Percent(t *testing.T) {
    LogQueue = make(chan *plugins.Log, 100)
    // Fill to 60%
    for i := 0; i < 60; i++ {
        LogQueue <- &plugins.Log{Id: fmt.Sprintf("t-%d", i)}
    }

    // Just verify no panic — a full test would capture log output
    p := &LogProcessor{}
    ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
    defer cancel()
    go p.monitorQueueDepth() // must not panic
    <-ctx.Done()
}
```

---

## Acceptance Criteria

- [ ] `CleanCountedLogs()` no longer uses a blocking send into `LogQueue`; when the queue is full it defers the retry to the next tick.
- [ ] All collector `queue <-` sends are non-blocking (`select`/`default`). No collector goroutine can block indefinitely on a full queue.
- [ ] A dropped-event counter increments for each discarded event and is reported in the log stream at least every 30 seconds when non-zero.
- [ ] Queue depth is logged as a warning when >50% and an error when >90%.
- [ ] A dead-letter file (`dlq/dropped-logs.jsonl`) is created and populated when events are dropped.
- [ ] `TestCleanCountedLogs_DoesNotDeadlockWhenQueueFull` passes within the 500ms deadline.
- [ ] `go build ./...` and `go test -race ./...` pass with no errors or race conditions.
- [ ] `go vet ./...` is clean.
