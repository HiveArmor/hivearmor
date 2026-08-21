---
name: golang-design-patterns
description: Idiomatic Go design patterns — functional options, middleware chains, circuit breaker, plugin architecture, dependency injection. Use when designing new Go services or plugins.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go Design Patterns

## When This Skill Applies
- Adding a new correlation plugin to `plugins/`
- Designing new service interfaces in event-processor or agent-manager
- Refactoring existing Go code for testability

## Functional Options (plugin configuration pattern)
```go
type PluginConfig struct {
    OpenSearchURL  string
    OpenSearchUser string
    OpenSearchPass string
    MaxRetries     int
    BatchSize      int
}

type Option func(*PluginConfig)

func WithMaxRetries(n int) Option {
    return func(c *PluginConfig) { c.MaxRetries = n }
}

func WithBatchSize(n int) Option {
    return func(c *PluginConfig) { c.BatchSize = n }
}

func NewPlugin(opts ...Option) *Plugin {
    cfg := &PluginConfig{MaxRetries: 3, BatchSize: 100} // sensible defaults
    for _, o := range opts {
        o(cfg)
    }
    return &Plugin{cfg: cfg}
}
```

## Middleware Chain (HTTP and gRPC interceptors)
```go
type Middleware func(http.Handler) http.Handler

func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
    // Apply in reverse so first middleware is outermost
    for i := len(middlewares) - 1; i >= 0; i-- {
        h = middlewares[i](h)
    }
    return h
}

// Usage:
handler := Chain(mux,
    loggingMiddleware,
    authMiddleware(internalKey),
    rateLimitMiddleware,
)
```

## Plugin Registration Pattern (existing HiveArmor pattern)
```go
// Every plugin MUST follow this exact pattern — event-processor loads by binary name
func main() {
    plugins.InitCorrelationPlugin("com.hivearmor.<name>", correlate)
}

// Handler signature — do not change
func correlate(ctx context.Context, alert *plugins.Alert) (*emptypb.Empty, error) {
    // 1. Check if this plugin handles this alert type
    if !shouldHandle(alert) {
        return &emptypb.Empty{}, nil
    }
    // 2. Enrich / correlate
    // 3. Write back to OpenSearch if needed
    return &emptypb.Empty{}, nil
}
```
Plugin binary name MUST be `com.hivearmor.<name>.plugin` — event-processor loads by this exact name.

## Circuit Breaker (for OpenSearch calls in plugins)
```go
type CircuitBreaker struct {
    failures  int
    threshold int
    lastFail  time.Time
    timeout   time.Duration
    mu        sync.Mutex
}

func (cb *CircuitBreaker) Call(fn func() error) error {
    cb.mu.Lock()
    if cb.failures >= cb.threshold && time.Since(cb.lastFail) < cb.timeout {
        cb.mu.Unlock()
        return errors.New("circuit open — OpenSearch unavailable")
    }
    cb.mu.Unlock()

    if err := fn(); err != nil {
        cb.mu.Lock()
        cb.failures++
        cb.lastFail = time.Now()
        cb.mu.Unlock()
        return err
    }
    cb.mu.Lock()
    cb.failures = 0
    cb.mu.Unlock()
    return nil
}
```
Use in plugins instead of the current `os.Exit(1) + sleep` pattern.

## Interface-Driven Design (for testability)
```go
// Define interfaces at the consumer, not the producer
type AlertStore interface {
    Index(ctx context.Context, index string, alert *Alert) error
    Search(ctx context.Context, query SearchQuery) ([]Alert, error)
}

// Concrete implementation
type OpenSearchAlertStore struct { client *opensearch.Client }

// Test mock — implement the same interface
type MockAlertStore struct {
    IndexFn  func(ctx context.Context, index string, alert *Alert) error
}
```

## Error Wrapping (always add context)
```go
// GOOD — caller knows where and why
if err := store.Index(ctx, index, alert); err != nil {
    return fmt.Errorf("correlate %s: index alert %s: %w", pluginName, alert.ID, err)
}

// BAD — loses context
if err != nil { return err }
```
