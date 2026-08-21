---
name: golang-concurrency
description: Idiomatic Go concurrency patterns — goroutines, channels, worker pools, context cancellation, fan-out/fan-in, sync primitives. Use when writing event processor pipelines, plugin workers, or any concurrent Go code.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go Concurrency Patterns

## When This Skill Applies
- Writing or reviewing code in `event-processor/pipeline/`, `event-processor/enrichment/`, `plugins/*/`
- Any goroutine spawning, channel communication, or sync.WaitGroup usage
- Context propagation through async call chains

## Core Rules

### Always propagate context
```go
// GOOD
func processEvent(ctx context.Context, e *Event) error {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }
    // ...
}

// BAD — ignores cancellation
func processEvent(e *Event) error { ... }
```

### Worker pool pattern (use for plugin fan-out)
```go
func workerPool(ctx context.Context, jobs <-chan Job, numWorkers int) <-chan Result {
    results := make(chan Result, numWorkers)
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                select {
                case <-ctx.Done():
                    return
                case results <- process(job):
                }
            }
        }()
    }
    go func() { wg.Wait(); close(results) }()
    return results
}
```

### Fan-out / fan-in (event processor pipeline pattern)
```go
func fanOut[T any](ctx context.Context, input <-chan T, n int) []<-chan T {
    outputs := make([]<-chan T, n)
    for i := range outputs {
        ch := make(chan T)
        outputs[i] = ch
        go func(out chan<- T) {
            defer close(out)
            for v := range input {
                select {
                case <-ctx.Done(): return
                case out <- v:
                }
            }
        }(ch)
    }
    return outputs
}
```

### Channel ownership rule
The goroutine that creates a channel owns it and is responsible for closing it. Never close a channel from a receiver.

### sync.Once for init (threat intel cache pattern)
```go
var (
    cache     map[string]tiEntry
    cacheOnce sync.Once
    cacheMu   sync.RWMutex
)

func getCache() map[string]tiEntry {
    cacheOnce.Do(func() { cache = loadFromOpenSearch() })
    cacheMu.RLock()
    defer cacheMu.RUnlock()
    return cache
}
```

### Avoid goroutine leaks
- Every goroutine must have a defined exit condition
- Use `goleak` in tests: `defer goleak.VerifyNone(t)`
- Never spawn goroutines in library code without providing a way to stop them

## Anti-Patterns to Avoid
- `go func() { ... }()` without context cancellation check
- Closing a nil channel (panics)
- Sending to a closed channel (panics)
- Using `time.Sleep` for synchronization — use channels or `sync.WaitGroup`
- Unbuffered channels in hot paths — benchmark first

## HiveArmor-Specific Notes
- `event-processor/enrichment/feeds.go` uses a 15-minute refresh loop — use `time.NewTicker` not `time.Sleep` in a loop
- Plugin correlation handlers receive `context.Context` — always check `ctx.Done()` before OpenSearch calls
- `agent-manager` gRPC streaming — use `stream.Context()` for cancellation propagation
