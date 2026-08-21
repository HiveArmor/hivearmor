// no_leak_property_test.go — Property 10: NoLeakInvariant for AlertsPlugin
//
// For any *plugins.Event with non-empty TenantPrefix, the AlertsPlugin write
// path must send the document to the tenant-scoped index ONLY and must never
// reference the global daily index v3-hive-alert-YYYY.MM.DD.
//
// This file covers the AlertsPlugin portion of Property 10.  The EventsPlugin
// portion is in plugins/events/no_leak_property_test.go.
//
// The fifteen RemainingPlugins (aws, azure, bitdefender, compliance-orchestrator,
// config, crowdstrike, feeds, gcp, geolocation, inputs, modules-config, o365,
// soc-ai, sophos, stats) do not perform direct OpenSearch writes — they route
// all events through plugins.SendLogsFromChannel, which delivers JSON payloads
// to the EventsPlugin's BulkQueue.  The EventsPlugin then calls
// sdkos.BuildTenantIndex(dataType, tenantPrefix) using the tenantPrefix field
// embedded in the JSON by ResolveAndSetTenantPrefix.  The NoLeakInvariant for
// those fifteen plugins is therefore structurally guaranteed by the EventsPlugin
// write path and is verified in plugins/events/no_leak_property_test.go.
//
// Feature: sprint-22-tenant-index-routing, Property 10
// Validates: Requirements 5.9, 6.1, 8.5
package main

import (
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/hivearmor/sdk/plugins"
)

const (
	noLeakIterations      = 100
	noLeakLowerAlphaNum   = "abcdefghijklmnopqrstuvwxyz0123456789"
	noLeakLowerAlphaNumHy = "abcdefghijklmnopqrstuvwxyz0123456789-"
)

// randNoLeakTenantPrefix generates a random prefix matching ^[a-z0-9][a-z0-9-]{1,19}$.
func randNoLeakTenantPrefix(rng *rand.Rand) string {
	tailLen := 1 + rng.Intn(19)
	b := make([]byte, 1+tailLen)
	b[0] = noLeakLowerAlphaNum[rng.Intn(len(noLeakLowerAlphaNum))]
	for i := 1; i < len(b); i++ {
		b[i] = noLeakLowerAlphaNumHy[rng.Intn(len(noLeakLowerAlphaNumHy))]
	}
	return string(b)
}

// globalAlertIndexRe matches the global daily-index pattern v3-hive-alert-YYYY.MM.DD
// (date segment immediately after "alert-", no tenant prefix in between).
var globalAlertIndexRe = regexp.MustCompile(`v3-hive-alert-\d{4}\.\d{2}\.\d{2}`)

// TestProperty10_AlertsPlugin_NoLeakInvariant asserts that for any *plugins.Event
// carrying a non-empty TenantPrefix, the AlertsPlugin write path routes the document
// to the tenant-scoped index v3-hive-alert-<tenantPrefix>-YYYY.MM.DD and never to
// the global index v3-hive-alert-YYYY.MM.DD.
//
// Feature: sprint-22-tenant-index-routing, Property 10
// Validates: Requirements 5.9, 6.1, 8.5
func TestProperty10_AlertsPlugin_NoLeakInvariant(t *testing.T) {
	if !alertsTestReady {
		t.Skip("test server not initialised (alertsTestReady=false)")
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < noLeakIterations; i++ {
		tenantPrefix := randNoLeakTenantPrefix(rng)

		event := &plugins.Event{
			Id:           fmt.Sprintf("p10-alert-%d", i),
			TenantPrefix: tenantPrefix,
		}
		alert := &plugins.Alert{
			Id:        fmt.Sprintf("p10-id-%d", i),
			Name:      fmt.Sprintf("p10-test-%d", i),
			Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
			Severity:  "low",
			Events:    []*plugins.Event{event},
		}

		// Reset and run the write path.
		capturedMu.Lock()
		capturedIndex = ""
		capturedMu.Unlock()

		_ = newAlert(alert, nil, event)

		// Wait for the HTTP request to arrive at the test server.
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
			t.Fatalf("Property 10 iteration %d: no HTTP request captured (tenantPrefix=%q)", i, tenantPrefix)
		}

		// Assert: captured index is NOT the global daily index.
		if globalAlertIndexRe.MatchString(gotIndex) && !strings.Contains(gotIndex, tenantPrefix) {
			t.Fatalf(
				"Property 10 iteration %d: NoLeakInvariant violated — "+
					"tenant-scoped event (tenantPrefix=%q) routed to global index %q",
				i, tenantPrefix, gotIndex,
			)
		}

		// Assert: captured index contains the tenant prefix.
		if !strings.Contains(gotIndex, tenantPrefix) {
			t.Fatalf(
				"Property 10 iteration %d: captured index %q does not contain tenant prefix %q",
				i, gotIndex, tenantPrefix,
			)
		}
	}
}
