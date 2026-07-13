# S05-T09: Fix v11-offense-* Index Writer and Data Model

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** FLOW-06
**Dependencies:** None
**Estimated time:** 3–5 hours

---

## Context

The `/offenses` page in the frontend reads from the `v11-offense-*` OpenSearch index via `OffenseResource.java`. The index is always empty in practice despite the writer code existing in `event-processor/enterprise/offense/engine.go`. Investigation reveals three distinct bugs that together cause the index to remain empty and render the offense page non-functional:

**Bug 1 — The offense writer is never called on the normal log processing path.**
`offense.Process(alert)` is registered as a callback inside `risk.Init(...)` in `main.go` (lines 60–63). However, `risk.AddScore()` — the function that triggers the risk scorer's flush loop and eventually invokes the callback — is never called anywhere in the event-processor codebase. The alert writer (`writer.WriteAlert`) is called directly from `processLog`, but the risk scorer callback chain is never reached. Offenses are therefore never created.

**Bug 2 — Field name mismatch between writer and reader.**
`engine.go` (line 180) writes the alert ID array as `"alertIds"`. The OpenSearch index template (index-mappings/main.go line 358) declares the field as `"alerts"`. `OffenseResource.java` (line 166) reads it as `offense.get("alerts")`. The `GET /api/offenses/{id}/alerts` endpoint always returns an empty list because the field it reads (`alerts`) is never written.

**Bug 3 — Status field type mismatch.**
`engine.go` writes `"status": 1` (integer). The frontend `Offense` TypeScript interface expects `"open" | "closed" | "false-positive"` (string). The backend `PUT /api/offenses/{id}/status` endpoint updates the field with a string. A freshly-written offense shows an unusable numeric status in the UI.

This task fixes all three bugs. The offense writer already exists and is well-designed — it just needs to be called correctly and have its data model made consistent.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/event-processor/main.go` — lines 55–75. Find `risk.Init`, the `offense.Process` callback registration, and the absence of any `risk.AddScore()` call.
2. `/Users/encryptshell/GIT/UTMStack-11/event-processor/enterprise/offense/engine.go` — full file. Understand `Process()` (lines 48–72), `findExistingOffense()` (lines 75–145), and `writeOffense()` (lines 167–205). Pay particular attention to line 180 (`"alertIds"` field) and line 184 (`"status": 1` integer).
3. `/Users/encryptshell/GIT/UTMStack-11/event-processor/writer/alerts.go` — lines 32–80. This is where `WriteAlert` is called from `processLog`. Note that `offense.Process` is NOT called here — it must be added.
4. `/Users/encryptshell/GIT/UTMStack-11/event-processor/enterprise/risk/scorer.go` — understand what `AddScore()` does and why it is not being called (the risk-score subsystem may be intentionally deferred; confirm before wiring it up).
5. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/web/rest/OffenseResource.java` — lines 150–180. See `offense.get("alerts")` — this must match the written field name.
6. `/Users/encryptshell/GIT/UTMStack-11/tools/index-mappings/main.go` — lines 338–366. The `offenseTemplate()` function; `"alerts"` field at line 358.

---

## Implementation Steps

### Fix 1 — Call offense.Process() directly from the alert write path

The simplest correct fix: call `offense.Process(alert)` immediately after every successful `WriteAlert` call, bypassing the broken risk-score callback chain entirely. The offense grouping logic (`Process()`) is self-contained and does not require the risk scorer.

**File:** `event-processor/writer/alerts.go` (or wherever `WriteAlert` is defined).

Find the point where a newly-written alert is returned/signalled as complete. Add:

```go
// In the function that writes an alert and confirms success:
func WriteAlert(alert *plugins.Alert) {
    // ... existing write logic ...

    // Trigger offense grouping after successful alert write.
    // offense.Process groups alerts sharing the same adversary within 2h
    // into a v11-offense-* document.
    go offense.Process(alert)
}
```

The `go` here is intentional — offense grouping involves an OpenSearch search + write and should not block the alert write path. The offense writer already handles its own errors internally.

Alternatively, if `WriteAlert` already has a callback mechanism, wire `offense.Process` there instead of adding it inline.

**Do NOT wire through `risk.AddScore`.** The risk scorer subsystem is incomplete (its flush loop is never triggered), and wiring through it would require S05-T09 to depend on completing the risk module. The direct call bypasses the broken dependency cleanly.

### Fix 2 — Reconcile the alertIds / alerts field name

Choose one name and apply it consistently. The index mapping field `"alerts"` is the most natural name for the frontend and Java code, so rename the Go writer to match.

**File:** `event-processor/enterprise/offense/engine.go` line 180.

```go
// Before:
"alertIds": append(relatedAlertIds, alert.Id),

// After:
"alerts": append(relatedAlertIds, alert.Id),
```

No changes required to `OffenseResource.java` (it already reads `offense.get("alerts")`) or to `index-mappings/main.go` (it already declares `"alerts"`).

Also verify line 196 and surrounding code — if there are other references to `"alertIds"` in `engine.go`, rename them all.

### Fix 3 — Write status as a string, not an integer

**File:** `event-processor/enterprise/offense/engine.go` line 184.

```go
// Before:
"status": 1,

// After:
"status": "open",
```

Update `findExistingOffense()` as well: if it reads the `status` field back from OpenSearch and compares it, ensure the comparison is against the string `"open"` rather than integer `1`.

### Fix 4 — Write offenseId back-reference onto alert documents (bonus fix)

The alert index mapping declares an `offenseId` field (index-mappings/main.go line 268) but `writer/alerts.go` never populates it. The `GET /api/offenses/{id}/alerts` endpoint fetches alerts by iterating the `alerts[]` array in the offense document, but the reverse lookup (find the offense an alert belongs to) is impossible without this field.

After `writeOffense` succeeds, update the related alert documents with the offense ID using an `updateByQuery`:

```go
// In offense/engine.go, after writeOffense():
func setOffenseIdOnAlerts(offenseID string, alertIDs []string) {
    if len(alertIDs) == 0 {
        return
    }
    query := map[string]any{
        "query": map[string]any{
            "terms": map[string]any{"id.keyword": alertIDs},
        },
        "script": map[string]any{
            "source": "ctx._source.offenseId = params.oid",
            "params": map[string]any{"oid": offenseID},
        },
    }
    body, _ := json.Marshal(query)
    url := fmt.Sprintf("%s/v11-alert-*/_update_by_query", oOSURL)
    req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        _ = catcher.Error("failed to set offenseId on alerts", err, nil)
        return
    }
    defer resp.Body.Close()
}
```

Call this after a successful `writeOffense()`:
```go
go setOffenseIdOnAlerts(offenseID, append(relatedAlertIds, alert.Id))
```

---

## Test Commands

```bash
# Build event-processor
cd /Users/encryptshell/GIT/UTMStack-11/event-processor
go build ./...

# Unit tests
go test ./enterprise/offense/... -v
go test ./... -race
go vet ./...

# Integration test (requires local-dev stack running):
# 1. Start the stack: cd local-dev && docker compose up -d
# 2. Inject test alerts that share the same adversary IP (>= 3 alerts):
curl -s -X POST http://localhost:9080/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"dataType":"syslog","dataSource":"test","raw":"test event","adversary":{"ip":"1.2.3.4"}}'
# (repeat 3+ times)
# 3. Query the offense index:
curl -s "http://localhost:9200/v11-offense-*/_search" \
  -u admin:admin --insecure | jq '.hits.hits'
# 4. Verify: offenses appear, status field is "open" (string), alerts field is a non-empty array
# 5. Hit the backend API:
curl -s "http://localhost:8080/api/offenses" \
  -H "Authorization: Bearer <token>" | jq '.content'
```

Write unit tests in `event-processor/enterprise/offense/engine_test.go`:

```go
func TestWriteOffense_StatusIsString(t *testing.T) {
    // Use a mock HTTP server to capture the PUT body
    var capturedBody []byte
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        capturedBody, _ = io.ReadAll(r.Body)
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"result":"created"}`))
    }))
    defer server.Close()

    // Wire the mock server URL as oOSURL
    originalURL := oOSURL
    oOSURL = server.URL
    defer func() { oOSURL = originalURL }()

    alert := &plugins.Alert{Id: "test-alert-1", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
    writeOffense("offense-uuid-1", alert, nil, 1)

    var doc map[string]any
    require.NoError(t, json.Unmarshal(capturedBody, &doc))
    assert.Equal(t, "open", doc["status"], "status must be string 'open', not integer 1")
}

func TestWriteOffense_AlertsFieldNotAlertIds(t *testing.T) {
    var capturedBody []byte
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        capturedBody, _ = io.ReadAll(r.Body)
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"result":"created"}`))
    }))
    defer server.Close()
    oOSURL = server.URL

    alert := &plugins.Alert{Id: "test-alert-2", Adversary: &plugins.Side{Ip: "1.2.3.4"}}
    writeOffense("offense-uuid-2", alert, []string{"related-1"}, 2)

    var doc map[string]any
    require.NoError(t, json.Unmarshal(capturedBody, &doc))
    assert.Contains(t, doc, "alerts",    "field must be 'alerts' to match index mapping")
    assert.NotContains(t, doc, "alertIds", "field 'alertIds' must not appear in written document")
}
```

---

## Acceptance Criteria

- [ ] `offense.Process(alert)` is called after every successful alert write, either directly from `WriteAlert` or via the alert-write callback chain.
- [ ] After injecting 3+ alerts sharing the same adversary IP, a document appears in `v11-offense-*` within the grouping window (2 hours, but visible immediately in integration testing with `_refresh`).
- [ ] The offense document's `status` field is the string `"open"`, not the integer `1`.
- [ ] The offense document's field for alert IDs is `"alerts"`, not `"alertIds"`.
- [ ] `GET /api/offenses` returns non-empty results when offenses exist.
- [ ] `GET /api/offenses/{id}/alerts` returns the alert documents belonging to that offense.
- [ ] `go build ./...` and `go test -race ./...` pass.
- [ ] The `/offenses` frontend page renders offense rows after the above integration test.
