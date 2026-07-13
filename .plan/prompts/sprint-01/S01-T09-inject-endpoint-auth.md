# S01-T09 — Add Authentication to POST :8090/v1/inject Endpoint

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue ID:** FLOW-04  
**Dependencies:** S01-T08 (eventprocessor must be stable)  
**Estimated time:** 2 hours

---

## Context

The eventprocessor exposes an HTTP endpoint at port 8090 (`POST /v1/inject`) that accepts synthetic log events and injects them directly into the processing pipeline. This endpoint has no authentication middleware. Any local process (or network-accessible attacker) can inject fabricated security events, poisoning the SIEM's alert data.

**Affected:** Event processor HTTP server (`eventprocessor/` or `plugins/inputs/` HTTP handler)

---

## What to Read First

1. `eventprocessor/` — look for HTTP server setup, find the `/v1/inject` route handler
2. Look for any existing auth middleware in the codebase (grep for `authMiddleware`, `apiKeyMiddleware`, or similar)
3. `local-dev/docker-compose.yml` — find the eventprocessor port mappings (port 8090)
4. `agent-manager/utils/auth.go` — pattern for API key validation (not for copy, just for context)

---

## Implementation Steps

### Step 1: Locate the inject endpoint

Run:
```bash
grep -r "v1/inject\|/inject" /Users/encryptshell/GIT/UTMStack-11/eventprocessor/ \
  /Users/encryptshell/GIT/UTMStack-11/plugins/ --include="*.go" -l
```

Read the files found. Identify where the HTTP handler for `/v1/inject` is registered.

### Step 2: Create an API key for internal inject calls

The inject endpoint is called by internal components only (not by agents or external systems). Use a shared secret configured via environment variable.

Add to `eventprocessor/config/` (or wherever config is read):

```go
type Config struct {
    // ... existing fields
    InjectAPIKey string `env:"EVENTPROCESSOR_INJECT_KEY"`
}
```

### Step 3: Create auth middleware

Create: `eventprocessor/middleware/auth.go` (or equivalent path in the project)

```go
package middleware

import (
    "net/http"
)

func InjectKeyAuth(expectedKey string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            key := r.Header.Get("X-Inject-Key")
            if key == "" {
                key = r.URL.Query().Get("key")
            }
            if expectedKey == "" || key != expectedKey {
                http.Error(w, "Unauthorized", http.StatusUnauthorized)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

### Step 4: Apply middleware to the inject route

In the HTTP server setup, wrap only the inject endpoint:

```go
mux := http.NewServeMux()

// Unauthenticated health check
mux.HandleFunc("/health", healthHandler)

// Authenticated inject endpoint
injectHandler := middleware.InjectKeyAuth(cfg.InjectAPIKey)(http.HandlerFunc(injectHandler))
mux.Handle("/v1/inject", injectHandler)

server := &http.Server{
    Addr:    ":8090",
    Handler: mux,
}
```

### Step 5: Bind inject endpoint to loopback only (defence-in-depth)

If the inject endpoint is only called from within the same host (not from other containers), change the listen address:

```go
// BEFORE: listen on all interfaces
Addr: ":8090"

// AFTER: loopback only (if inject is only called locally)
Addr: "127.0.0.1:8090"
```

If other containers must call it (e.g., the inputs plugin from a different container), keep `:8090` but enforce the API key.

### Step 6: Update docker-compose to set the inject key

In `local-dev/docker-compose.yml`, add to the eventprocessor service:
```yaml
- EVENTPROCESSOR_INJECT_KEY=${EVENTPROCESSOR_INJECT_KEY:-change-me-in-production}
```

Update any service that calls `/v1/inject` to pass the key:
```yaml
# The calling service also needs the key
- EVENTPROCESSOR_INJECT_KEY=${EVENTPROCESSOR_INJECT_KEY:-change-me-in-production}
```

### Step 7: Tests

Create: `eventprocessor/middleware/auth_test.go`

```go
package middleware_test

import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestInjectKeyAuth_withCorrectKey_allows(t *testing.T) {
    handler := InjectKeyAuth("secret-key")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
    req.Header.Set("X-Inject-Key", "secret-key")
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)
    if w.Code != http.StatusOK {
        t.Errorf("expected 200, got %d", w.Code)
    }
}

func TestInjectKeyAuth_withWrongKey_blocks(t *testing.T) {
    handler := InjectKeyAuth("secret-key")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
    req.Header.Set("X-Inject-Key", "wrong-key")
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)
    if w.Code != http.StatusUnauthorized {
        t.Errorf("expected 401, got %d", w.Code)
    }
}

func TestInjectKeyAuth_withNoKey_blocks(t *testing.T) {
    handler := InjectKeyAuth("secret-key")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    req := httptest.NewRequest(http.MethodPost, "/v1/inject", nil)
    w := httptest.NewRecorder()

    handler.ServeHTTP(w, req)
    if w.Code != http.StatusUnauthorized {
        t.Errorf("expected 401, got %d", w.Code)
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/eventprocessor

go build ./...
go test ./middleware/... -v

# Manual test against running eventprocessor:
# Without key — should get 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":"fake"}'
# Expected: 401

# With correct key — should accept
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8090/v1/inject \
  -H "X-Inject-Key: change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":"fake"}'
# Expected: 200 or 202
```

---

## Acceptance Criteria

- [ ] `POST /v1/inject` returns HTTP 401 without valid `X-Inject-Key` header
- [ ] `POST /v1/inject` succeeds with the correct key
- [ ] `EVENTPROCESSOR_INJECT_KEY` env var controls the expected key
- [ ] All 3 middleware unit tests pass
- [ ] `go build ./...` succeeds
- [ ] Key is documented in `.env.example`
