# S05-T07: Implement must_not_term Operator in Correlation Rule Filter Builder

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** FLOW-08
**Dependencies:** None (S05-T08 depends on this)
**Estimated time:** 1–2 hours

---

## Context

The correlation rule DSL supports an `Expression` struct with an `Operator` string field (`event-processor/rules/types.go` lines 39–43). The engine that builds OpenSearch queries from rule expressions (`event-processor/rules/engine.go` lines 145–173) handles `filter_term` and `filter_match` operators correctly by appending to a `musts` slice. However, the `case "must_not_term":` branch (line 157) contains only the comment `// handled below`, and no code below it ever collects `must_not` expressions. The final query (lines 167–173) only ever has a `"must"` clause — `"must_not"` is never present.

The practical consequence: exactly one production rule uses `must_not_term` — `rules/cloud/aws/aws/console_login_impossible_travel.yml` (line 42). This rule is intended to fire when a second AWS Console login occurs from a **different** country than the first. The `must_not_term` expression is supposed to exclude events from the same country. Because the clause is silently dropped, the rule fires on any second login from any country — producing both false positives and missing the impossible-travel detection entirely.

The SDK's reference implementation (`go-sdk@v1.1.26/plugins/rules.go` lines 58–72) also handles `must_not_match` — a second missing operator that should be implemented at the same time.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/event-processor/rules/engine.go` — lines 140–180. The broken switch. Pay close attention to the structure of the `musts` slice and the query map built at line 167.
2. `/Users/encryptshell/GIT/UTMStack-11/event-processor/rules/types.go` — lines 39–43. The `Expression` struct.
3. `/Users/encryptshell/go/pkg/mod/github.com/threatwinds/go-sdk@v1.1.26/plugins/rules.go` — lines 58–72. The SDK reference: shows `must_not_term` and `must_not_match` cases.
4. `/Users/encryptshell/GIT/UTMStack-11/rules/cloud/aws/aws/console_login_impossible_travel.yml` — lines 39–44. The only existing rule using `must_not_term`. Use this as the integration test fixture.

---

## Implementation Steps

### Step 1 — Add mustNots collection alongside musts

Edit `event-processor/rules/engine.go`, the `executeSearchRequest` function (or whichever function contains the switch at lines 145–173).

**Current code (lines 144–173), abbreviated:**
```go
var musts []map[string]any
for _, expr := range sr.With {
    val := resolveTemplate(expr.Value, eventJSON)
    switch expr.Operator {
    case "filter_term":
        musts = append(musts, map[string]any{
            "term": map[string]any{expr.Field + ".keyword": val},
        })
    case "filter_match":
        musts = append(musts, map[string]any{
            "match": map[string]any{expr.Field: val},
        })
    case "must_not_term":
        // handled below    <-- this comment is incorrect; nothing handles it
    }
}
// ...
query := map[string]any{
    "query": map[string]any{
        "bool": map[string]any{"must": musts},
    },
    "size": 1,
    "track_total_hits": true,
}
```

**Fixed code:**
```go
var musts []map[string]any
var mustNots []map[string]any

for _, expr := range sr.With {
    val := resolveTemplate(expr.Value, eventJSON)
    switch expr.Operator {
    case "filter_term":
        musts = append(musts, map[string]any{
            "term": map[string]any{expr.Field + ".keyword": val},
        })
    case "filter_match":
        musts = append(musts, map[string]any{
            "match": map[string]any{expr.Field: val},
        })
    case "must_not_term":
        mustNots = append(mustNots, map[string]any{
            "term": map[string]any{expr.Field + ".keyword": val},
        })
    case "must_not_match":
        mustNots = append(mustNots, map[string]any{
            "match": map[string]any{expr.Field: val},
        })
    }
}

boolQuery := map[string]any{}
if len(musts) > 0 {
    boolQuery["must"] = musts
}
if len(mustNots) > 0 {
    boolQuery["must_not"] = mustNots
}

query := map[string]any{
    "query": map[string]any{
        "bool": boolQuery,
    },
    "size": 1,
    "track_total_hits": true,
}
```

That is the complete fix. No other files need changing.

### Step 2 — Verify no other switch-case handles must_not operators elsewhere

Run:
```bash
grep -rn "must_not_term\|must_not_match\|MustNot" \
  /Users/encryptshell/GIT/UTMStack-11/event-processor/ \
  /Users/encryptshell/GIT/UTMStack-11/plugins/
```

If any other engine or filter builder handles rule operators (e.g., a second switch in a sequence or risk engine), apply the same `mustNots` pattern there.

---

## Test Commands

```bash
# Build the event-processor
cd /Users/encryptshell/GIT/UTMStack-11/event-processor
go build ./...

# Unit tests
go test ./rules/... -v -run "TestMustNot"

# All event-processor tests
go test ./... -race

# Vet
go vet ./...
```

Write this unit test in `event-processor/rules/engine_test.go`:

```go
package rules

import (
    "testing"
    "encoding/json"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestBuildQuery_MustNotTermExcludesMatchingField(t *testing.T) {
    sr := SearchRequest{
        With: []Expression{
            {Field: "logType",                   Operator: "filter_term",    Value: "ConsoleLogin"},
            {Field: "origin.geolocation.countryCode", Operator: "must_not_term", Value: "US"},
        },
    }

    eventJSON := `{"logType":"ConsoleLogin","origin":{"geolocation":{"countryCode":"US"}}}`
    query := buildBoolQuery(sr.With, eventJSON) // extract the query-building logic into a testable function

    raw, err := json.Marshal(query)
    require.NoError(t, err)

    var parsed map[string]any
    require.NoError(t, json.Unmarshal(raw, &parsed))

    boolClause := parsed["query"].(map[string]any)["bool"].(map[string]any)
    assert.Contains(t, boolClause, "must",      "must clause must be present")
    assert.Contains(t, boolClause, "must_not",  "must_not clause must be present when must_not_term is used")

    mustNots := boolClause["must_not"].([]any)
    assert.Len(t, mustNots, 1, "exactly one must_not clause expected")

    termClause := mustNots[0].(map[string]any)["term"].(map[string]any)
    assert.Contains(t, termClause, "origin.geolocation.countryCode.keyword")
    assert.Equal(t, "US", termClause["origin.geolocation.countryCode.keyword"])
}

func TestBuildQuery_MustNotMatchExcludesMatchingField(t *testing.T) {
    sr := SearchRequest{
        With: []Expression{
            {Field: "message", Operator: "must_not_match", Value: "test"},
        },
    }
    query := buildBoolQuery(sr.With, `{"message":"test"}`)
    raw, _ := json.Marshal(query)
    var parsed map[string]any
    json.Unmarshal(raw, &parsed)

    boolClause := parsed["query"].(map[string]any)["bool"].(map[string]any)
    assert.Contains(t, boolClause, "must_not")
    mustNots := boolClause["must_not"].([]any)
    assert.Len(t, mustNots, 1)
    matchClause := mustNots[0].(map[string]any)["match"].(map[string]any)
    assert.Equal(t, "test", matchClause["message"])
}

func TestBuildQuery_FilterTermOnly_HasNoMustNot(t *testing.T) {
    sr := SearchRequest{
        With: []Expression{
            {Field: "status", Operator: "filter_term", Value: "active"},
        },
    }
    query := buildBoolQuery(sr.With, `{"status":"active"}`)
    raw, _ := json.Marshal(query)
    var parsed map[string]any
    json.Unmarshal(raw, &parsed)

    boolClause := parsed["query"].(map[string]any)["bool"].(map[string]any)
    assert.NotContains(t, boolClause, "must_not", "must_not must not appear when no must_not_term expressions exist")
}

func TestBuildQuery_EmptyExpressions_ProducesEmptyBool(t *testing.T) {
    query := buildBoolQuery(nil, `{}`)
    raw, _ := json.Marshal(query)
    var parsed map[string]any
    json.Unmarshal(raw, &parsed)

    boolClause := parsed["query"].(map[string]any)["bool"].(map[string]any)
    assert.Empty(t, boolClause, "empty expressions must produce empty bool clause")
}
```

Note: to make `buildBoolQuery` testable, extract the query-building loop from `executeSearchRequest` into a separate package-level function. This is a good refactoring regardless.

---

## Acceptance Criteria

- [ ] `case "must_not_term":` in `engine.go` appends a term clause to `mustNots` (not `musts`).
- [ ] `case "must_not_match":` is added and appends a match clause to `mustNots`.
- [ ] The OpenSearch query includes a `"must_not"` key in the `bool` clause when at least one `must_not_term` or `must_not_match` expression is present.
- [ ] The `"must_not"` key is absent from the query when no such expressions exist (no empty array pollution).
- [ ] `console_login_impossible_travel.yml` produces alerts only when the second login originates from a country code **different** from the first — not for same-country logins.
- [ ] `TestBuildQuery_MustNotTermExcludesMatchingField` and sibling tests pass.
- [ ] `go build ./...` and `go test -race ./...` are clean.
