---
name: golang-performance
description: Go performance optimization — allocation reduction, GC tuning, sync.Pool, hot-path profiling, benchmark methodology. Use for event-processor throughput work and plugin hot paths.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go Performance Patterns

## When This Skill Applies
- Event processor EPS (events-per-second) optimization
- Enrichment cache hot paths in `event-processor/enrichment/`
- Any benchmark or pprof investigation

## Allocation Reduction

### sync.Pool for frequently allocated objects
```go
var eventPool = sync.Pool{
    New: func() any { return &Event{} },
}

func processEvent(raw []byte) error {
    e := eventPool.Get().(*Event)
    defer func() {
        e.Reset() // clear fields before returning
        eventPool.Put(e)
    }()
    
    if err := json.Unmarshal(raw, e); err != nil {
        return err
    }
    return pipeline.Process(e)
}
```

### Pre-size slices and maps
```go
// BAD — repeated allocations
var alerts []Alert
for _, event := range events {
    alerts = append(alerts, toAlert(event))
}

// GOOD — single allocation
alerts := make([]Alert, 0, len(events))
for _, event := range events {
    alerts = append(alerts, toAlert(event))
}
```

### Avoid fmt.Sprintf in hot paths
```go
// BAD — allocates a string
index := fmt.Sprintf("_v3_hive_%s-%s", eventType, date)

// GOOD — use strings.Builder or direct concat for simple cases
index := "_v3_hive_" + eventType + "-" + date
```

## Benchmark Methodology
```go
func BenchmarkPipelineProcess(b *testing.B) {
    event := generateTestEvent()
    p := NewPipeline(testConfig)
    
    b.ReportAllocs()  // always report allocations
    b.ResetTimer()
    
    for i := 0; i < b.N; i++ {
        _ = p.Process(context.Background(), event)
    }
}
```

Run and compare:
```bash
go test -bench=BenchmarkPipelineProcess -benchmem -count=5 ./event-processor/pipeline/
# Compare before/after with benchstat:
benchstat old.txt new.txt
```

## GC Tuning for High-Throughput Ingestion
```go
// In main() — increase GC target percentage for high-alloc workloads
// Default is 100 (GC when heap doubles). Increase to reduce GC frequency.
// Trade: higher memory usage for less GC pause.
debug.SetGCPercent(200)

// For event processor: set GOGC=200 via env var instead of hardcoding
```

## Memory Layout — Struct Field Ordering
```go
// BAD — wastes 7 bytes of padding
type Alert struct {
    Active   bool      // 1 byte
    // 7 bytes padding
    ID       int64     // 8 bytes
    Severity string    // 16 bytes
}

// GOOD — pack bool with smaller fields, put large fields first
type Alert struct {
    ID        int64   // 8 bytes
    Severity  string  // 16 bytes
    Source    string  // 16 bytes
    Active    bool    // 1 byte
    // 7 bytes padding (at end, not between fields)
}
```

## EPS Target for HiveArmor Event Processor
Target: 10,000 EPS sustained on a 4-core container.
Profile at: `go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30`
Key bottlenecks to look for: JSON unmarshal, OpenSearch bulk write, CEL evaluation.
