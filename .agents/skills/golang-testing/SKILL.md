---
name: golang-testing
description: Production-grade Go tests — table-driven tests, testify, goleak, Testcontainers, CEL rule testing. Use when writing or reviewing tests in event-processor, plugins, or agent-manager.
metadata:
  type: skill
  source: samber/cc-skills-golang (adapted)
---

# Go Testing Patterns

## When This Skill Applies
- Writing tests for `event-processor/rules/`, `event-processor/pipeline/`
- Plugin correlation handler testing
- Any `_test.go` file across Go services

## Table-Driven Tests — Standard Pattern
```go
func TestCELRule(t *testing.T) {
    tests := []struct {
        name    string
        event   *Event
        rule    string
        want    bool
        wantErr bool
    }{
        {
            name:  "matches brute force",
            event: &Event{Type: "auth", FailCount: 10, TimeWindow: 60},
            rule:  "event.fail_count > 5 && event.time_window <= 60",
            want:  true,
        },
        {
            name:  "no match below threshold",
            event: &Event{Type: "auth", FailCount: 3, TimeWindow: 60},
            rule:  "event.fail_count > 5 && event.time_window <= 60",
            want:  false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := EvalCEL(tt.rule, tt.event)
            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
            assert.Equal(t, tt.want, got)
        })
    }
}
```

## testify — Prefer require over assert for fatal checks
```go
import (
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// require stops the test immediately on failure (use for setup/preconditions)
require.NoError(t, err)
require.NotNil(t, result)

// assert continues the test (use for validating output fields)
assert.Equal(t, "critical", alert.Severity)
assert.Contains(t, alert.Tags, "brute-force")
```

## Goroutine Leak Detection
```go
import "go.uber.org/goleak"

func TestWorkerPool(t *testing.T) {
    defer goleak.VerifyNone(t)

    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    pool := NewWorkerPool(ctx, 4)
    // test pool behavior
    // goleak.VerifyNone catches any lingering goroutines at test end
}
```

## Testcontainers for OpenSearch Integration Tests
```go
import "github.com/testcontainers/testcontainers-go"

func TestOpenSearchWriter(t *testing.T) {
    ctx := context.Background()

    req := testcontainers.ContainerRequest{
        Image:        "opensearchproject/opensearch:2",
        ExposedPorts: []string{"9200/tcp"},
        Env: map[string]string{
            "discovery.type":              "single-node",
            "OPENSEARCH_INITIAL_ADMIN_PASSWORD": "Test@12345!",
        },
        WaitingFor: wait.ForHTTP("/").WithPort("9200"),
    }
    container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: req,
        Started:          true,
    })
    require.NoError(t, err)
    defer container.Terminate(ctx)

    host, _ := container.Host(ctx)
    port, _ := container.MappedPort(ctx, "9200")
    // use host:port for writer tests
}
```

## Plugin Correlation Handler Test
```go
func TestAlertsPlugin_Correlate(t *testing.T) {
    alert := &plugins.Alert{
        ID:       "test-001",
        Severity: "high",
        Source:   "windows-auth",
    }
    
    ctx := context.Background()
    _, err := correlate(ctx, alert)
    require.NoError(t, err)
}
```

## Coverage Targets
- `event-processor/rules/`: 85% minimum — rules engine is safety-critical
- `event-processor/pipeline/`: 75% minimum
- Plugins: 60% minimum (integration-heavy)

Run: `go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out`
