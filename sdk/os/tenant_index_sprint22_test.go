package os_test

import (
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
)

// TestSprint22CanonicalIndexCases verifies the seven CanonicalIndexCases from the
// Sprint 22 glossary against the four existing SDK builders in sdk/os/tenant_index.go.
// No SDK source is modified by this file.
func TestSprint22CanonicalIndexCases(t *testing.T) {
	today := time.Now().UTC().Format("2006.01.02")

	t.Run("Case1_BuildCurrentDayIndex_alert", func(t *testing.T) {
		got := sdkos.BuildCurrentDayIndex("alert")
		want := "v3-hive-alert-" + today
		if got != want {
			t.Fatalf("case Case1_BuildCurrentDayIndex_alert: got %q, want %q", got, want)
		}
	})

	t.Run("Case2_BuildCurrentDayIndex_event", func(t *testing.T) {
		got := sdkos.BuildCurrentDayIndex("event")
		want := "v3-hive-event-" + today
		if got != want {
			t.Fatalf("case Case2_BuildCurrentDayIndex_event: got %q, want %q", got, want)
		}
	})

	t.Run("Case3_BuildTenantIndex_alert_acme", func(t *testing.T) {
		got := sdkos.BuildTenantIndex("alert", "acme")
		want := "v3-hive-alert-acme-" + today
		if got != want {
			t.Fatalf("case Case3_BuildTenantIndex_alert_acme: got %q, want %q", got, want)
		}
	})

	t.Run("Case4_BuildTenantIndex_event_empty", func(t *testing.T) {
		got := sdkos.BuildTenantIndex("event", "")
		want := sdkos.BuildCurrentDayIndex("event")
		if got != want {
			t.Fatalf("case Case4_BuildTenantIndex_event_empty: got %q, want %q", got, want)
		}
	})

	t.Run("Case5_BuildIndexPattern_alert", func(t *testing.T) {
		got := sdkos.BuildIndexPattern("alert")
		want := "v3-hive-alert-*"
		if got != want {
			t.Fatalf("case Case5_BuildIndexPattern_alert: got %q, want %q", got, want)
		}
	})

	t.Run("Case6_BuildTenantIndexPattern_alert_acme", func(t *testing.T) {
		got := sdkos.BuildTenantIndexPattern("alert", "acme")
		want := "v3-hive-alert-acme-*"
		if got != want {
			t.Fatalf("case Case6_BuildTenantIndexPattern_alert_acme: got %q, want %q", got, want)
		}
	})

	t.Run("Case7_BuildTenantIndexPattern_event_empty", func(t *testing.T) {
		got := sdkos.BuildTenantIndexPattern("event", "")
		want := sdkos.BuildIndexPattern("event")
		if got != want {
			t.Fatalf("case Case7_BuildTenantIndexPattern_event_empty: got %q, want %q", got, want)
		}
	})
}
