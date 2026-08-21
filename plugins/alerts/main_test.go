package main

// Tests for AlertsPlugin tenant-index routing (S22-T03).
//
// Validates: Requirements 5.7, 5.8, 5.9, 5.10
//
// These tests reuse the shared httptest.Server and sdkos connection set up by
// TestMain in main_property_test.go.  They call the write-path function
// newAlert directly and assert that the captured HTTP requests contain the
// correct index names.
//
// No live OpenSearch, no PostgreSQL, no Docker is required.
// Tests are safe to run under:  go test -short ./...

import (
	"fmt"
	"regexp"
	"strings"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// waitForCapturedIndex blocks until capturedIndex (from main_property_test.go)
// is non-empty or the timeout is exceeded.  Returns the captured value.
func waitForCapturedIndex(timeout time.Duration) string {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		capturedMu.Lock()
		v := capturedIndex
		capturedMu.Unlock()
		if v != "" {
			return v
		}
		time.Sleep(5 * time.Millisecond)
	}
	return ""
}

// resetCapture zeroes the shared captured index so each test starts clean.
func resetCapture() {
	capturedMu.Lock()
	capturedIndex = ""
	capturedMu.Unlock()
}

// buildMinimalAlert returns the minimum *plugins.Alert + *plugins.Event needed for
// newAlert to run without panicking or short-circuiting to a duplicate path.
// The function name is shared with main_property_test.go which also calls it.
func buildMinimalAlert(alertID string, event *plugins.Event) *plugins.Alert {
	return &plugins.Alert{
		Id:        alertID,
		Name:      "example-test-alert",
		Severity:  "medium",
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Events:    []*plugins.Event{event},
		// Empty DeduplicateBy and GroupBy ensure isDuplicate and
		// getPreviousAlertId return early without hitting OpenSearch search.
	}
}

// ---------------------------------------------------------------------------
// Case 1: tenant-scoped index
// ---------------------------------------------------------------------------

// TestAlertsPlugin_TenantScopedIndex verifies that an alert whose event carries
// TenantId="acme-tenant" and TenantPrefix="acme" is indexed into
// "v3-hive-alert-acme-<today-UTC>".
//
// Validates: Requirement 5.7
func TestAlertsPlugin_TenantScopedIndex(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised (alertsTestReady=false)")
	}
	resetCapture()

	event := &plugins.Event{
		Id:           "ex-evt-tenant-1",
		TenantId:     "acme-tenant",
		TenantPrefix: "acme",
	}
	alert := buildMinimalAlert("ex-alert-tenant-1", event)

	if err := newAlert(alert, nil, event); err != nil {
		t.Fatalf("newAlert(tenantPrefix=acme) returned unexpected error: %v", err)
	}

	got := waitForCapturedIndex(5 * time.Second)
	if got == "" {
		t.Fatal("timed out waiting for index request to arrive at test server")
	}

	today := time.Now().UTC().Format("2006.01.02")
	wantSubstr := "v3-hive-alert-acme-" + today

	if !strings.Contains(got, wantSubstr) {
		t.Errorf("captured _index %q does not contain expected substring %q", got, wantSubstr)
	}

	// Sanity-check using the SDK builder as ground truth.
	expected := sdkos.BuildTenantIndex("alert", "acme")
	if got != expected {
		t.Errorf("captured _index %q != sdkos.BuildTenantIndex(%q,%q) = %q", got, "alert", "acme", expected)
	}
}

// ---------------------------------------------------------------------------
// Case 2: global (no-tenant) index
// ---------------------------------------------------------------------------

// TestAlertsPlugin_GlobalIndex verifies that an alert whose event has no
// TenantPrefix is indexed into the global daily index "v3-hive-alert-YYYY.MM.DD"
// and does NOT contain a tenant segment between "alert" and the date.
//
// Validates: Requirement 5.8
func TestAlertsPlugin_GlobalIndex(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised (alertsTestReady=false)")
	}
	resetCapture()

	event := &plugins.Event{
		Id:           "ex-evt-global-1",
		TenantId:     "",
		TenantPrefix: "",
	}
	alert := buildMinimalAlert("ex-alert-global-1", event)

	if err := newAlert(alert, nil, event); err != nil {
		t.Fatalf("newAlert(tenantPrefix='') returned unexpected error: %v", err)
	}

	got := waitForCapturedIndex(5 * time.Second)
	if got == "" {
		t.Fatal("timed out waiting for index request to arrive at test server")
	}

	today := time.Now().UTC().Format("2006.01.02")

	// Must match the global daily-index pattern.
	globalPattern := regexp.MustCompile(`^v3-hive-alert-\d{4}\.\d{2}\.\d{2}$`)
	if !globalPattern.MatchString(got) {
		t.Errorf("captured _index %q does not match global pattern v3-hive-alert-YYYY.MM.DD", got)
	}

	// Must NOT have an extra segment inserted between "alert" and the date.
	// If a tenant prefix were leaked it would look like v3-hive-alert-<word>-YYYY.MM.DD.
	tenantPattern := regexp.MustCompile(`v3-hive-alert-[a-z][a-z0-9-]+-\d{4}\.\d{2}\.\d{2}`)
	if tenantPattern.MatchString(got) {
		t.Errorf("global index %q must not contain a tenant segment (today=%s)", got, today)
	}

	// Sanity-check via SDK builder.
	expected := sdkos.BuildTenantIndex("alert", "")
	if got != expected {
		t.Errorf("captured _index %q != sdkos.BuildTenantIndex(%q,%q) = %q", got, "alert", "", expected)
	}
}

// ---------------------------------------------------------------------------
// Case 3: NoLeakInvariant — tenant-scoped event must not reference global index
// ---------------------------------------------------------------------------

// TestAlertsPlugin_NoLeakInvariant asserts that when an event carries a
// non-empty TenantPrefix the write-path sends the document to the tenant-scoped
// index and not to the global daily index.
//
// The invariant is: the captured _index for a tenant-scoped alert must NOT match
// the pattern v3-hive-alert-YYYY.MM.DD (global daily index without tenant segment).
//
// Validates: Requirement 5.9
func TestAlertsPlugin_NoLeakInvariant(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised (alertsTestReady=false)")
	}
	resetCapture()

	event := &plugins.Event{
		Id:           "ex-evt-noleak-1",
		TenantId:     "acme-tenant",
		TenantPrefix: "acme",
	}
	alert := buildMinimalAlert("ex-alert-noleak-1", event)

	if err := newAlert(alert, nil, event); err != nil {
		t.Fatalf("newAlert(tenantPrefix=acme) returned unexpected error: %v", err)
	}

	got := waitForCapturedIndex(5 * time.Second)
	if got == "" {
		t.Fatal("timed out waiting for index request to arrive at test server")
	}

	// globalIndexOnly matches v3-hive-alert-YYYY.MM.DD with the date
	// immediately following "alert-" — no tenant prefix in between.
	globalIndexOnly := regexp.MustCompile(`^v3-hive-alert-\d{4}\.\d{2}\.\d{2}$`)
	if globalIndexOnly.MatchString(got) {
		t.Errorf(
			"NoLeakInvariant violated: tenant-scoped alert (tenantPrefix=acme) "+
				"was written to global index %q instead of tenant index", got,
		)
	}

	// Verify it landed in the correct tenant-scoped index.
	today := time.Now().UTC().Format("2006.01.02")
	wantSubstr := fmt.Sprintf("v3-hive-alert-acme-%s", today)
	if !strings.Contains(got, wantSubstr) {
		t.Errorf("captured _index %q does not contain expected tenant segment %q", got, wantSubstr)
	}
}
