---
name: golang-observability
description: Structured logging (slog), Prometheus metrics, OpenTelemetry tracing, pprof profiling for Go services. Use when adding observability to event-processor, agent-manager, or plugins.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go Observability Patterns

## When This Skill Applies
- Adding logging, metrics, or tracing to any Go service
- Debugging throughput/latency in the event processor pipeline
- Wiring OpenTelemetry for Codex enterprise observability

## Structured Logging — use `log/slog` (Go 1.21+)
```go
import "log/slog"

// Initialize with JSON handler for production
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
slog.SetDefault(logger)

// Always log with context fields, never fmt.Sprintf
slog.Info("event processed",
    "plugin", pluginName,
    "alert_id", alert.ID,
    "duration_ms", elapsed.Milliseconds(),
    "severity", alert.Severity,
)

// Error with stack context
slog.Error("opensearch write failed",
    "index", indexName,
    "error", err,
    "retries", retryCount,
)
```
Never use `log.Printf` or `fmt.Println` in service code — only `slog`.

## Prometheus Metrics
```go
import "github.com/prometheus/client_golang/prometheus"

var (
    eventsProcessed = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "hivearmor_events_processed_total",
            Help: "Total events processed by the pipeline",
        },
        []string{"plugin", "status"},
    )
    processingDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "hivearmor_processing_duration_seconds",
            Buckets: prometheus.DefBuckets,
        },
        []string{"stage"},
    )
)

func init() {
    prometheus.MustRegister(eventsProcessed, processingDuration)
}

// Usage
timer := prometheus.NewTimer(processingDuration.WithLabelValues("correlate"))
defer timer.ObserveDuration()
eventsProcessed.WithLabelValues(pluginName, "success").Inc()
```

## OpenTelemetry Tracing
```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
)

var tracer = otel.Tracer("github.com/hivearmor/event-processor")

func (p *Pipeline) Process(ctx context.Context, event *Event) error {
    ctx, span := tracer.Start(ctx, "pipeline.process")
    defer span.End()

    span.SetAttributes(
        attribute.String("event.type", event.Type),
        attribute.String("event.source", event.Source),
    )

    if err := p.enrich(ctx, event); err != nil {
        span.RecordError(err)
        return err
    }
    return nil
}
```

## pprof — Enable in All Services
```go
import _ "net/http/pprof"

// In main():
go func() {
    slog.Info("pprof listening", "addr", "localhost:6060")
    http.ListenAndServe("localhost:6060", nil)
}()
```

Profiling commands:
```bash
# CPU profile (30s)
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Memory heap
go tool pprof http://localhost:6060/debug/pprof/heap

# Goroutine leak check
curl http://localhost:6060/debug/pprof/goroutine?debug=2
```

## EPS (Events Per Second) Gauge — HiveArmor Specific
```go
var epsGauge = prometheus.NewGauge(prometheus.GaugeOpts{
    Name: "hivearmor_events_per_second",
    Help: "Current events-per-second ingestion rate",
})

// Track in a sliding window, update every second
// Frontend reads this via /api/ha-eps-stream (SSE)
```
