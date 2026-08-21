// empty_prefix_property_test.go — Property 11: AlertsPlugin empty-prefix fallback
//
// For any *plugins.Event with TenantPrefix == "", the AlertsPlugin write path
// must route the document to the global daily index, which must equal
// sdkos.BuildCurrentDayIndex("alert") byte-for-byte.
//
// Feature: sprint-22-tenant-index-routing, Property 11
// Validates: Requirements 6.3
package main

import (
	"fmt"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
	"github.com/hivearmor/sdk/plugins"
)

// TestProperty11_AlertsPlugin_EmptyPrefixFallback asserts that when TenantPrefix
// is empty the AlertsPlugin write path produces the same global daily index as
// sdkos.BuildCurrentDayIndex("alert"), preserving pre-sprint behaviour.
//
// Feature: sprint-22-tenant-index-routing, Property 11
// Validates: Requirements 6.3
func TestProperty11_AlertsPlugin_EmptyPrefixFallback(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised (alertsTestReady=false)")
	}

	const iterations = 100

	for i := 0; i < iterations; i++ {
		event := &plugins.Event{
			Id:           fmt.Sprintf("p11-alert-%d", i),
			TenantPrefix: "", // empty — must fall back to global daily index
		}
		alert := &plugins.Alert{
			Id:        fmt.Sprintf("p11-id-%d", i),
			Name:      fmt.Sprintf("p11-test-%d", i),
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			Severity:  "low",
			Events:    []*plugins.Event{event},
		}

		capturedMu.Lock()
		capturedIndex = ""
		capturedMu.Unlock()

		_ = newAlert(alert, nil, event)

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
			t.Fatalf("Property 11 iteration %d: no HTTP request captured", i)
		}

		expected := sdkos.BuildCurrentDayIndex("alert")
		if gotIndex != expected {
			t.Fatalf(
				"Property 11 iteration %d: captured _index %q != sdkos.BuildCurrentDayIndex(\"alert\") = %q",
				i, gotIndex, expected,
			)
		}
	}
}
