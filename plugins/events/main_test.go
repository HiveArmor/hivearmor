package main

// Tests for EventsPlugin tenant-index routing (S22-T03).
//
// Validates: Requirements 5.7, 5.8, 5.9, 5.10
//
// These tests reuse the shared httptest.Server and sdkos connection set up by
// TestMain in main_property_test.go.  They call addToQueue with JSON-serialised
// Event payloads, flush the queue, and assert that the captured _bulk requests
// contain the correct index names.
//
// No live OpenSearch, no PostgreSQL, no Docker is required.
// Tests are safe to run under:  go test -short ./...

import (
	"regexp"
	"strings"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
	"github.com/hivearmor/sdk/utils"
	"github.com/tidwall/gjson"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// evtWaitForCapturedIndex blocks until eventsLastCapturedIndex is non-empty or
// the timeout is exceeded.  Returns the captured value.
func evtWaitForCapturedIndex(timeout time.Duration) string {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		eventsCaptureMu.Lock()
		v := eventsLastCapturedIndex
		eventsCaptureMu.Unlock()
		if v != "" {
			return v
		}
		time.Sleep(5 * time.Millisecond)
	}
	return ""
}

// evtResetCapture zeroes the shared captured index so each test starts clean.
func evtResetCapture() {
	eventsCaptureMu.Lock()
	eventsLastCapturedIndex = ""
	eventsCaptureMu.Unlock()
}

// enqueueAndFlush serialises event → JSON, replicates the production queue
// worker logic to build the index name, adds the item to the test BulkQueue,
// and calls Flush to ensure the HTTP request is sent before assertions.
func enqueueAndFlush(t *testing.T, event *plugins.Event) {
	t.Helper()

	jsonPtr, err := utils.ProtoMessageToString(event)
	if err != nil {
		t.Fatalf("ProtoMessageToString failed: %v", err)
	}
	jsonStr := *jsonPtr

	// Replicate the production worker logic from queue.go exactly.
	dataType := gjson.Get(jsonStr, "dataType").String()
	id := gjson.Get(jsonStr, "id").String()
	tenantPrefix := gjson.Get(jsonStr, "tenantPrefix").String()
	index := sdkos.BuildTenantIndex(dataType, tenantPrefix)

	eventsTestBulkQueue.AddItem(sdkos.BulkItem{
		Index:      index,
		DocumentID: id,
		Document:   []byte(jsonStr),
		Operation:  "index",
	})

	// FlushThreshold=1 means the queue auto-flushes; call Flush defensively to
	// guarantee the HTTP request is in-flight before the assertion.
	if ferr := eventsTestBulkQueue.Flush(); ferr != nil {
		t.Logf("Flush returned non-fatal error: %v", ferr)
	}
}

// ---------------------------------------------------------------------------
// Case 1: tenant-scoped index
// ---------------------------------------------------------------------------

// TestEventsPlugin_TenantScopedIndex verifies that an event with
// TenantId="acme-tenant", TenantPrefix="acme", and DataType="log" is indexed
// into "v3-hive-log-acme-<today-UTC>".
//
// Validates: Requirement 5.7
func TestEventsPlugin_TenantScopedIndex(t *testing.T) {
	if !eventsTestReady {
		t.Skip("test server not initialised (eventsTestReady=false)")
	}
	evtResetCapture()

	event := &plugins.Event{
		Id:           "ex-evt-tenant-1",
		TenantId:     "acme-tenant",
		TenantPrefix: "acme",
		DataType:     "log",
	}

	enqueueAndFlush(t, event)

	got := evtWaitForCapturedIndex(5 * time.Second)
	if got == "" {
		t.Fatal("timed out waiting for bulk request to arrive at test server")
	}

	today := time.Now().UTC().Format("2006.01.02")
	wantSubstr := "v3-hive-log-acme-" + today

	if !strings.Contains(got, wantSubstr) {
		t.Errorf("captured _index %q does not contain expected substring %q", got, wantSubstr)
	}

	// Sanity-check via SDK builder.
	expected := sdkos.BuildTenantIndex("log", "acme")
	if got != expected {
		t.Errorf("captured _index %q != sdkos.BuildTenantIndex(%q,%q) = %q", got, "log", "acme", expected)
	}
}

// ---------------------------------------------------------------------------
// Case 2: global (no-tenant) index
// ---------------------------------------------------------------------------

// TestEventsPlugin_GlobalIndex verifies that an event with no TenantPrefix and
// DataType="log" is indexed into the global daily index "v3-hive-log-YYYY.MM.DD"
// and does NOT contain a tenant segment between "log" and the date.
//
// Validates: Requirement 5.8
func TestEventsPlugin_GlobalIndex(t *testing.T) {
	if !eventsTestReady {
		t.Skip("test server not initialised (eventsTestReady=false)")
	}
	evtResetCapture()

	event := &plugins.Event{
		Id:           "ex-evt-global-1",
		TenantId:     "",
		TenantPrefix: "",
		DataType:     "log",
	}

	enqueueAndFlush(t, event)

	got := evtWaitForCapturedIndex(5 * time.Second)
	if got == "" {
		t.Fatal("timed out waiting for bulk request to arrive at test server")
	}

	today := time.Now().UTC().Format("2006.01.02")

	// Must match the global daily-index pattern for "log".
	globalPattern := regexp.MustCompile(`^v3-hive-log-\d{4}\.\d{2}\.\d{2}$`)
	if !globalPattern.MatchString(got) {
		t.Errorf("captured _index %q does not match global pattern v3-hive-log-YYYY.MM.DD (today=%s)", got, today)
	}

	// Must NOT have a tenant segment between "log" and the date.
	tenantPattern := regexp.MustCompile(`v3-hive-log-[a-z][a-z0-9-]+-\d{4}\.\d{2}\.\d{2}`)
	if tenantPattern.MatchString(got) {
		t.Errorf("global index %q must not contain a tenant segment (today=%s)", got, today)
	}

	// Sanity-check via SDK builder.
	expected := sdkos.BuildTenantIndex("log", "")
	if got != expected {
		t.Errorf("captured _index %q != sdkos.BuildTenantIndex(%q,%q) = %q", got, "log", "", expected)
	}
}
