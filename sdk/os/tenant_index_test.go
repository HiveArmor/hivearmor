package os_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
)

func TestBuildCurrentDayIndex_Format(t *testing.T) {
	got := sdkos.BuildCurrentDayIndex("alert")
	date := time.Now().UTC().Format("2006.01.02")
	expected := "v3-hive-alert-" + date
	if got != expected {
		t.Fatalf("BuildCurrentDayIndex(\"alert\") = %q, want %q", got, expected)
	}
}

func TestBuildCurrentDayIndex_Event(t *testing.T) {
	got := sdkos.BuildCurrentDayIndex("event")
	if !strings.HasPrefix(got, "v3-hive-event-") {
		t.Fatalf("BuildCurrentDayIndex(\"event\") = %q, want prefix \"v3-hive-event-\"", got)
	}
}

func TestBuildCurrentDayIndex_Lowercase(t *testing.T) {
	// dataType is lowercased automatically
	lower := sdkos.BuildCurrentDayIndex("alert")
	upper := sdkos.BuildCurrentDayIndex("ALERT")
	if lower != upper {
		t.Fatalf("BuildCurrentDayIndex should be case-insensitive: %q vs %q", lower, upper)
	}
}

func TestBuildTenantIndex_WithPrefix(t *testing.T) {
	got := sdkos.BuildTenantIndex("alert", "acme")
	date := time.Now().UTC().Format("2006.01.02")
	expected := "v3-hive-alert-acme-" + date
	if got != expected {
		t.Fatalf("BuildTenantIndex(\"alert\", \"acme\") = %q, want %q", got, expected)
	}
}

func TestBuildTenantIndex_EmptyPrefix(t *testing.T) {
	withTenant := sdkos.BuildTenantIndex("alert", "")
	withoutTenant := sdkos.BuildCurrentDayIndex("alert")
	if withTenant != withoutTenant {
		t.Fatalf("BuildTenantIndex with empty prefix should equal BuildCurrentDayIndex: %q vs %q",
			withTenant, withoutTenant)
	}
}

func TestBuildTenantIndex_PrefixSanitized(t *testing.T) {
	// Special chars in prefix are stripped
	got := sdkos.BuildTenantIndex("alert", "Acme Corp!")
	if strings.Contains(got, " ") || strings.Contains(got, "!") || strings.Contains(got, "A") {
		t.Fatalf("BuildTenantIndex should sanitize prefix: %q", got)
	}
	// Should contain "acmecorp" (uppercase dropped, space and ! stripped)
	if !strings.Contains(got, "acmecorp") {
		t.Fatalf("BuildTenantIndex(%q): sanitized form should contain 'acmecorp', got %q",
			"Acme Corp!", got)
	}
}

func TestBuildIndexPattern_Wildcard(t *testing.T) {
	got := sdkos.BuildIndexPattern("alert")
	if got != "v3-hive-alert-*" {
		t.Fatalf("BuildIndexPattern(\"alert\") = %q, want \"v3-hive-alert-*\"", got)
	}
}

func TestBuildIndexPattern_Event(t *testing.T) {
	got := sdkos.BuildIndexPattern("event")
	if got != "v3-hive-event-*" {
		t.Fatalf("BuildIndexPattern(\"event\") = %q, want \"v3-hive-event-*\"", got)
	}
}

func TestBuildTenantIndexPattern_WithPrefix(t *testing.T) {
	got := sdkos.BuildTenantIndexPattern("alert", "acme")
	if got != "v3-hive-alert-acme-*" {
		t.Fatalf("BuildTenantIndexPattern(\"alert\", \"acme\") = %q, want \"v3-hive-alert-acme-*\"", got)
	}
}

func TestBuildTenantIndexPattern_EmptyPrefix(t *testing.T) {
	got := sdkos.BuildTenantIndexPattern("event", "")
	if got != "v3-hive-event-*" {
		t.Fatalf("BuildTenantIndexPattern with empty prefix should equal BuildIndexPattern, got %q", got)
	}
}

func TestBuildTenantIndex_DatePartFormat(t *testing.T) {
	// Verify that the date part uses dots not dashes
	got := sdkos.BuildTenantIndex("alert", "test")
	// Date format should be YYYY.MM.DD (dots between year, month, day)
	parts := strings.Split(got, "-")
	// parts: ["v3", "hive", "alert", "test", "2026.07.25"]
	if len(parts) < 5 {
		t.Fatalf("BuildTenantIndex parts: expected >=5, got %d from %q", len(parts), got)
	}
	datePart := parts[len(parts)-1]
	if !strings.Contains(datePart, ".") {
		t.Fatalf("Date part should use dots: %q (full index: %q)", datePart, got)
	}
	if strings.Count(datePart, ".") != 2 {
		t.Fatalf("Date part should have exactly 2 dots (YYYY.MM.DD): %q", datePart)
	}
}

func TestBuildTenantIndex_KnownFormat(t *testing.T) {
	// Regression test: document the exact format so changes are visible.
	// This test uses the live UTC date; it is not a fixture test.
	today := time.Now().UTC().Format("2006.01.02")
	cases := []struct {
		dataType     string
		tenantPrefix string
		want         string
	}{
		{"alert", "acme", fmt.Sprintf("v3-hive-alert-acme-%s", today)},
		{"event", "globex", fmt.Sprintf("v3-hive-event-globex-%s", today)},
		{"log", "", fmt.Sprintf("v3-hive-log-%s", today)},
	}
	for _, tc := range cases {
		got := sdkos.BuildTenantIndex(tc.dataType, tc.tenantPrefix)
		if got != tc.want {
			t.Errorf("BuildTenantIndex(%q, %q) = %q, want %q",
				tc.dataType, tc.tenantPrefix, got, tc.want)
		}
	}
}
