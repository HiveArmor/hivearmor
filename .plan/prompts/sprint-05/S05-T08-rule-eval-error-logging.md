# S05-T08: Add Error Logging for Correlation Rule CEL Evaluation Failures

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** FLOW-07
**Dependencies:** S05-T07 (must_not_term operator bugs should be fixed before adding logging that would expose them)
**Estimated time:** 2–3 hours

---

## Context

When a correlation rule contains a malformed CEL expression, a type error, or any runtime evaluation error, the current code silently discards the error and moves on to the next rule. The only exception is rule ID 1001, which has a hardcoded `fmt.Printf` debug statement (engine.go line 65) — all other rules receive no diagnostic output whatsoever.

This silence is a serious operational problem. An analyst who writes a new rule and observes "no alerts" has no way to determine whether the rule evaluated correctly against the event stream (and there were genuinely no matches) or whether the rule's CEL expression failed to compile or evaluate. Debugging currently requires attaching a debugger or adding a `fmt.Printf` and recompiling.

The exact silent-drop sites found in the codebase are:

- `event-processor/rules/engine.go` line 67: `if err != nil || !ok { continue }` — CEL evaluation error for any rule except 1001 is silently swallowed.
- `event-processor/rules/engine.go` line 54: `eventJSON, _ := json.Marshal(...)` — marshal error means CEL evaluates against an empty string, causing every rule to fail silently.
- `event-processor/enterprise/sequence/engine.go` lines 74 and 101: `ok, _ := getCEL().Evaluate(...)` — the blank identifier discards the error completely in the sequence engine.
- `event-processor/pipeline/cel_where.go` lines 33–36: CEL error in a pipeline filter returns `false` with no log.

This task addresses all four sites. Do **not** promote these to hard failures that stop the engine — the fix is structured logging that allows monitoring and debugging without disrupting rule evaluation for other rules.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/event-processor/rules/engine.go` — full file. Key lines:
   - 50–84: `Evaluate()` function.
   - 54: silent marshal error.
   - 63–69: CEL call and silent error discard.
   - 65: existing debug print for rule 1001 — replace this pattern properly.
2. `/Users/encryptshell/GIT/UTMStack-11/event-processor/enterprise/sequence/engine.go` — lines 70–110. The `_, _` blank-identifier discards.
3. `/Users/encryptshell/GIT/UTMStack-11/event-processor/pipeline/cel_where.go` — full file. Lines 22–38.
4. `/Users/encryptshell/GIT/UTMStack-11/event-processor/rules/types.go` — the `Rule` struct. Note which field holds the rule ID and name (needed for log context).
5. The SDK CEL layer at `go/pkg/mod/github.com/threatwinds/go-sdk@v1.1.26/plugins/cel.go` — see that `execute()` (line 259) correctly wraps the error with context before returning it. The error message already includes sufficient detail.

---

## Implementation Steps

### Step 1 — Fix event-processor/rules/engine.go

**Change 1: Marshal error at line 54**

```go
// Before:
eventJSON, _ := json.Marshal(eventToMap(event))
eventStr := string(eventJSON)

// After:
eventJSON, err := json.Marshal(eventToMap(event))
if err != nil {
    log.Printf("[rules.Evaluate] failed to marshal event id=%s dataType=%s: %v",
        event.Id, event.DataType, err)
    return nil // cannot evaluate any rule without JSON representation
}
eventStr := string(eventJSON)
```

(Use whatever logger is already imported in the file — `log.Printf`, `catcher.Error`, or the project's structured logger.)

**Change 2: CEL evaluation error at lines 63–69**

```go
// Before:
ok, err := getCEL().Evaluate(&eventStr, rule.Where)
if rule.ID == 1001 {
    fmt.Printf("[CEL DEBUG] rule=%d ok=%v err=%v eventJSON=%s\n", ...)
}
if err != nil || !ok {
    continue
}

// After:
ok, evalErr := getCEL().Evaluate(&eventStr, rule.Where)
if evalErr != nil {
    log.Printf("[rules.Evaluate] CEL error rule.id=%d rule.name=%q expression=%q error=%v",
        rule.ID, rule.Name, rule.Where, evalErr)
    continue
}
if !ok {
    continue
}
```

Remove the `if rule.ID == 1001` debug block entirely — replace it with the general error log above.

**Change 3: Second marshal error at line 72 (correlation path)**

```go
// Before:
flatJSON, _ := json.Marshal(eventToMap(event))

// After:
flatJSON, marshalErr := json.Marshal(eventToMap(event))
if marshalErr != nil {
    log.Printf("[rules.Evaluate] failed to marshal event for correlation check rule.id=%d: %v",
        rule.ID, marshalErr)
    continue
}
```

**Change 4: Silent errors in executeSearchRequest (lines 175 and 177)**

```go
// Before:
body, _ := json.Marshal(query)
req, _ := http.NewRequest("POST", url, ...)

// After:
body, err := json.Marshal(query)
if err != nil {
    return false, fmt.Errorf("marshal query for rule correlation: %w", err)
}
req, err := http.NewRequest("POST", url, bytes.NewReader(body))
if err != nil {
    return false, fmt.Errorf("build HTTP request for rule correlation: %w", err)
}
```

### Step 2 — Fix event-processor/enterprise/sequence/engine.go

**Lines 74 and 101:** Replace blank identifier with error logging.

```go
// Before (line 74):
ok, _ := getCEL().Evaluate(&s, stepDef.Where)

// After:
ok, celErr := getCEL().Evaluate(&s, stepDef.Where)
if celErr != nil {
    log.Printf("[sequence.Evaluate] CEL error rule.id=%d step=%d expression=%q error=%v",
        rule.ID, stepIdx, stepDef.Where, celErr)
    ok = false
}
```

Apply the same change at line 101 (the step-0 check):

```go
// Before (line 101):
ok, _ := getCEL().Evaluate(&s, rule.Steps[0].Where)

// After:
ok, celErr := getCEL().Evaluate(&s, rule.Steps[0].Where)
if celErr != nil {
    log.Printf("[sequence.Evaluate] CEL error initialising rule.id=%d step=0 expression=%q error=%v",
        rule.ID, rule.Steps[0].Where, celErr)
    continue
}
```

### Step 3 — Fix event-processor/pipeline/cel_where.go

```go
// Before (lines 33-36):
result, err := celCache.Evaluate(&s, expression)
if err != nil {
    return false
}

// After:
result, err := celCache.Evaluate(&s, expression)
if err != nil {
    log.Printf("[pipeline.EvalWhere] CEL error expression=%q error=%v", expression, err)
    return false
}
```

### Step 4 — Add a rate-limited error log helper (prevent log flooding)

If a rule has a permanently broken expression, the same error will be logged for every event that passes through the engine. Under load this generates thousands of log lines per second. Add a simple rate limiter:

```go
// In rules/engine.go or a shared util:
var (
    celErrorsMu   sync.Mutex
    celErrorsSeen = map[string]time.Time{} // key: ruleID+expression hash
)

const celErrorLogInterval = 60 * time.Second

func shouldLogCELError(ruleID int, expression string) bool {
    key := fmt.Sprintf("%d::%s", ruleID, expression)
    celErrorsMu.Lock()
    defer celErrorsMu.Unlock()
    last, ok := celErrorsSeen[key]
    if !ok || time.Since(last) > celErrorLogInterval {
        celErrorsSeen[key] = time.Now()
        return true
    }
    return false
}
```

Use it in the error log:
```go
if evalErr != nil {
    if shouldLogCELError(rule.ID, rule.Where) {
        log.Printf("[rules.Evaluate] CEL error rule.id=%d rule.name=%q expression=%q error=%v (suppressing duplicates for 60s)",
            rule.ID, rule.Name, rule.Where, evalErr)
    }
    continue
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/event-processor
go build ./...
go test ./rules/... -v -run "TestCEL"
go test ./enterprise/sequence/... -v
go test ./pipeline/... -v
go test ./... -race
go vet ./...
```

Write these tests in `event-processor/rules/engine_cel_logging_test.go`:

```go
package rules

import (
    "bytes"
    "log"
    "strings"
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestEvaluate_LogsCELErrorInstead0fSilentDrop(t *testing.T) {
    var buf bytes.Buffer
    log.SetOutput(&buf)
    defer log.SetOutput(nil)

    // Inject a rule with an invalid CEL expression
    rules := []Rule{{
        ID:    9999,
        Name:  "broken-rule",
        Where: `this is not valid CEL !!!`,
    }}
    withTestRules(rules, func() {
        event := makeTestEvent("syslog", "test")
        alerts := Evaluate(event)
        assert.Empty(t, alerts, "broken rule must not produce alerts")
    })

    logOutput := buf.String()
    assert.Contains(t, logOutput, "CEL error",           "must log CEL error")
    assert.Contains(t, logOutput, "9999",                "must include rule ID in log")
    assert.Contains(t, logOutput, "broken-rule",         "must include rule name in log")
    assert.Contains(t, logOutput, "this is not valid",   "must include expression in log")
}

func TestEvaluate_RateLimitsDuplicateCELErrors(t *testing.T) {
    var logCount int
    // patch shouldLogCELError to count calls
    // ... (depends on how you expose the function)
    // Assert: with 1000 events, the error is logged at most ceil(1000/throttle) times
}

func TestEvaluate_MarshalErrorReturnsNilAndLogs(t *testing.T) {
    var buf bytes.Buffer
    log.SetOutput(&buf)
    defer log.SetOutput(nil)

    // Pass an event whose ToMap produces an unmarshalable value
    // (this requires injecting the event-to-map conversion)
    // Simplified: assert that a nil return from Evaluate does not panic
    alerts := Evaluate(nil) // nil event
    assert.Nil(t, alerts)
}
```

---

## Acceptance Criteria

- [ ] A rule with a malformed CEL expression logs an error message containing the rule ID, rule name, the expression string, and the CEL error detail. It does not log the same error more than once per 60 seconds per rule.
- [ ] The `if rule.ID == 1001` debug block is removed from `engine.go`.
- [ ] `event-processor/enterprise/sequence/engine.go` no longer uses blank identifiers (`_`) for CEL evaluation errors; errors are logged with rule ID and step index.
- [ ] `event-processor/pipeline/cel_where.go` logs CEL errors with the expression string before returning `false`.
- [ ] `json.Marshal` errors in `engine.go` are logged and cause an early return, not a silent pass-through with an empty JSON string.
- [ ] `executeSearchRequest` returns proper errors for marshal and HTTP request construction failures.
- [ ] `go build ./...`, `go test -race ./...`, and `go vet ./...` are clean.
- [ ] An operator who writes a rule with a typo in the CEL expression can find the error within 60 seconds by inspecting the event-processor container logs.
