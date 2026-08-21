// Feature: sprint-22-tenant-index-routing, Property 9
//
// Package main — shared test infrastructure and property-based test for the
// AlertsPlugin write path.
// Validates: Requirements 5.1, 5.2
//
// Property 9: Plugin write path equals SDK builder output byte-for-byte.
//
// For every arbitrary *plugins.Event with TenantPrefix matching "" or
// ^[a-z0-9][a-z0-9-]{1,19}$, the _index value sent to OpenSearch by
// the AlertsPlugin write path MUST equal sdkos.BuildTenantIndex("alert",
// event.TenantPrefix) byte-for-byte.
//
// This file also defines TestMain and the shared capture variables that the
// example unit tests in main_test.go rely on.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

// ---------------------------------------------------------------------------
// Shared capture state — used by both this file and main_test.go
// ---------------------------------------------------------------------------

// capturedIndex holds the most recently captured _index value from the test server.
// Protected by capturedMu.
var (
	capturedIndex string
	capturedMu    sync.Mutex
)

// alertsTestReady is true once TestMain has successfully connected sdkos.
var alertsTestReady bool

// alertsTestServer is the global httptest.Server shared across all test functions.
var alertsTestServer *httptest.Server

// ---------------------------------------------------------------------------
// TestMain — shared server setup (called once for the whole test binary)
// ---------------------------------------------------------------------------

// TestMain initialises the shared httptest.Server and calls sdkos.Connect once.
// Using TestMain means Connect (a singleton) is only ever called once per binary run.
// Both the example unit tests (main_test.go) and the property tests (this file)
// share this single server.
func TestMain(m *testing.M) {
	alertsTestServer = httptest.NewServer(http.HandlerFunc(alertsCaptureHandler))
	defer alertsTestServer.Close()

	// Connect the SDK singleton to the test server.
	// InsecureSkipVerify is already set inside the SDK Connect implementation.
	if err := sdkos.Connect([]string{alertsTestServer.URL}, "", ""); err != nil {
		fmt.Fprintf(os.Stderr, "alerts property test: sdkos.Connect failed: %v\n", err)
		os.Exit(1)
	}
	alertsTestReady = true

	os.Exit(m.Run())
}

// ---------------------------------------------------------------------------
// Test server handler
// ---------------------------------------------------------------------------

// alertsCaptureHandler is the HTTP handler for the test server.
// It handles:
//  1. PUT/POST /<index>/<id>?op_type=create — sdkos.IndexDoc single-doc call
//  2. POST /_bulk                           — potential bulk calls
//  3. POST /<index>/_search                 — search calls (isDuplicate, getPreviousAlertId)
//  4. POST /<index>/_refresh                — sdkos.RefreshIndex
//  5. GET  /_cluster/health                 — startup health check
//
// Every recognized call updates capturedIndex to the _index value observed.
func alertsCaptureHandler(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()

	path := r.URL.Path

	switch {
	case r.Method == http.MethodPost && strings.HasSuffix(path, "/_bulk"):
		// Bulk request — parse NDJSON to extract _index from the action line.
		idx := alertsExtractIndexFromBulkNDJSON(string(body))
		if idx != "" {
			capturedMu.Lock()
			capturedIndex = idx
			capturedMu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"took":1,"errors":false,"items":[{"index":{"_index":"x","_id":"1","_version":1,"result":"created","status":201}}]}`)

	case r.Method == http.MethodPost && strings.HasSuffix(path, "/_search"):
		// Return empty hits so isDuplicate and getPreviousAlertId do not
		// short-circuit the newAlert write path.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"hits":{"total":{"value":0},"hits":[]}}`)

	case r.Method == http.MethodPost && strings.HasSuffix(path, "/_refresh"):
		// Acknowledge refresh silently.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"_shards":{"total":1,"successful":1,"failed":0}}`)

	case (r.Method == http.MethodPut || r.Method == http.MethodPost) &&
		strings.Contains(path, "/_doc"):
		// Single-document index request: PUT /<index>/_doc/<id>?op_type=create
		// OpenSearch REST API format: the index name is the first path segment.
		segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
		if len(segments) >= 1 && segments[0] != "" {
			capturedMu.Lock()
			capturedIndex = segments[0]
			capturedMu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{"_index":"x","_id":"1","_version":1,"result":"created","status":201}`)

	case (r.Method == http.MethodPut || r.Method == http.MethodPost) &&
		!strings.Contains(path, "/_"):
		// Fallback: single-document index request without _doc segment.
		segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
		if len(segments) >= 1 && segments[0] != "" {
			capturedMu.Lock()
			capturedIndex = segments[0]
			capturedMu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{"_index":"x","_id":"1","_version":1,"result":"created","status":201}`)

	default:
		// Cluster health and other management calls — return a minimal OK.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"green"}`)
	}
}

// alertsExtractIndexFromBulkNDJSON parses NDJSON bulk body and returns the _index
// value from the first action line.
//
// Bulk NDJSON format:
//
//	{"index":{"_index":"v3-hive-alert-acme-2025.01.01","_id":"evt-1"}}
//	{"field":"value"}
func alertsExtractIndexFromBulkNDJSON(body string) string {
	for _, line := range strings.Split(strings.TrimSpace(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			continue
		}
		for _, op := range []string{"index", "create", "update", "delete"} {
			raw, ok := envelope[op]
			if !ok {
				continue
			}
			var meta map[string]json.RawMessage
			if err := json.Unmarshal(raw, &meta); err != nil {
				continue
			}
			var idx string
			if err := json.Unmarshal(meta["_index"], &idx); err != nil {
				continue
			}
			return idx
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// Random data generators (mirrors the patterns in the SDK property tests)
// ---------------------------------------------------------------------------

const (
	p9LowerAlphaNum       = "abcdefghijklmnopqrstuvwxyz0123456789"
	p9LowerAlphaNumHyphen = "abcdefghijklmnopqrstuvwxyz0123456789-"
	p9PropertyIterations  = 100
)

// randAlertsTenantPrefix generates a random tenant prefix matching
// ^[a-z0-9][a-z0-9-]{1,19}$ (total length 2..20).
func randAlertsTenantPrefix(rng *rand.Rand) string {
	tailLen := 1 + rng.Intn(19) // 1..19, so total 2..20
	b := make([]byte, 1+tailLen)
	b[0] = p9LowerAlphaNum[rng.Intn(len(p9LowerAlphaNum))]
	for i := 1; i < len(b); i++ {
		b[i] = p9LowerAlphaNumHyphen[rng.Intn(len(p9LowerAlphaNumHyphen))]
	}
	return string(b)
}

// randAlertsTenantPrefixOrEmpty returns either "" (50% chance) or a valid prefix.
func randAlertsTenantPrefixOrEmpty(rng *rand.Rand) string {
	if rng.Intn(2) == 0 {
		return ""
	}
	return randAlertsTenantPrefix(rng)
}

// ---------------------------------------------------------------------------
// Property 9 — AlertsPlugin write path equals SDK builder output byte-for-byte
// ---------------------------------------------------------------------------

// TestProperty9_AlertsPlugin_WritePathEqualsBuildTenantIndex verifies that for
// every arbitrary TenantPrefix (empty or matching ^[a-z0-9][a-z0-9-]{1,19}$),
// the _index value sent by the AlertsPlugin write path (newAlert) equals
// sdkos.BuildTenantIndex("alert", event.TenantPrefix) byte-for-byte.
//
// The test uses alertsTestServer (set up in TestMain above) to capture the
// outbound HTTP request and reads the _index from the URL path (single-doc) or
// NDJSON body (bulk).
//
// Validates: Requirements 5.1, 5.2
// Feature: sprint-22-tenant-index-routing, Property 9
func TestProperty9_AlertsPlugin_WritePathEqualsBuildTenantIndex(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised")
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < p9PropertyIterations; i++ {
		tenantPrefix := randAlertsTenantPrefixOrEmpty(rng)

		// Ground truth: what the SDK builder produces.
		expectedIndex := sdkos.BuildTenantIndex("alert", tenantPrefix)

		// Build a minimal *plugins.Event carrying TenantPrefix.
		event := &plugins.Event{
			Id:           fmt.Sprintf("prop9-alert-%d", i),
			TenantPrefix: tenantPrefix,
		}

		// Build a minimal *plugins.Alert — no DeduplicateBy/GroupBy so
		// isDuplicate and getPreviousAlertId return immediately without
		// searching OpenSearch.
		alert := &plugins.Alert{
			Id:        fmt.Sprintf("prop9-alert-id-%d", i),
			Name:      fmt.Sprintf("property-test-alert-%d", i),
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			Severity:  "low",
			Events:    []*plugins.Event{event},
		}

		// Reset the captured index before each call.
		capturedMu.Lock()
		capturedIndex = ""
		capturedMu.Unlock()

		// Execute the AlertsPlugin write path.
		_ = newAlert(alert, nil, event)

		// Wait up to 2 seconds for the HTTP request to arrive.
		var gotIndex string
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			capturedMu.Lock()
			gotIndex = capturedIndex
			capturedMu.Unlock()
			if gotIndex != "" {
				break
			}
			time.Sleep(5 * time.Millisecond)
		}

		if gotIndex == "" {
			t.Fatalf(
				"Property 9 AlertsPlugin iteration %d: no HTTP request captured "+
					"(tenantPrefix=%q, expected _index=%q)",
				i, tenantPrefix, expectedIndex,
			)
		}

		if gotIndex != expectedIndex {
			t.Fatalf(
				"Property 9 AlertsPlugin iteration %d: captured _index %q != "+
					"sdkos.BuildTenantIndex(%q, %q) = %q",
				i, gotIndex, "alert", tenantPrefix, expectedIndex,
			)
		}
	}
}
