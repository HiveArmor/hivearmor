package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// Regression test for the CEF/LEEF header-pipe escaping defect.
//
// Bug: grok header patterns written '\|' were double-escaped by patternToRegex (which
// QuoteMeta-quotes literal segments) into a literal backslash+pipe, so the CEF/LEEF header
// never split at runtime. Fix: use a plain '|' in the header patterns (QuoteMeta escapes it
// to a correct '\|' regex), and use BARE grok field_names (not 'log.<x>') so the captured
// header fields land at event.Log["<x>"] rather than the literal key event.Log["log.<x>"].
//
// NOTE: a SEPARATE, deeper engine bug remains — KVOp ignores its `source` parameter and
// always parses data["raw"], so CEF extension key=value promotion to origin/target/action
// is not exercised here. That fix touches the shared kv operator (13 parsers) and is tracked
// for its own change. This test asserts only the header split, which the pipe fix delivers.

func syslogExecute(dataType, raw string) *plugins.Event {
	filtersDir := filepath.Join("..", "..", "filters", "syslog")
	Init(filtersDir)
	return Execute(&plugins.Log{
		Id: "syslog-hdr", DataType: dataType, DataSource: "x",
		TenantId: "default", Raw: raw, Timestamp: "2026-09-13T00:00:00Z",
	})
}

func TestCEFHeaderSplits(t *testing.T) {
	raw := `CEF:0|Security|threatmanager|1.0|100|worm stopped|10|src=10.0.0.1 dst=2.1.2.2 act=blocked`
	event := syslogExecute("SYSLOG_CEF", raw)
	if event == nil {
		t.Fatal("expected the CEF event to be retained")
	}
	// Header must split — name carries the human-readable event with its space intact,
	// and the extension is isolated from the header.
	if got := event.Log["name"].GetStringValue(); got != "worm stopped" {
		t.Fatalf("CEF header did not split: expected name=%q, got %q", "worm stopped", got)
	}
	if got := event.Log["product"].GetStringValue(); got != "threatmanager" {
		t.Fatalf("expected CEF product, got %q", got)
	}
	if got := event.Log["cefExtension"].GetStringValue(); got != "src=10.0.0.1 dst=2.1.2.2 act=blocked" {
		t.Fatalf("expected isolated CEF extension, got %q", got)
	}
}

func TestLEEFHeaderSplits(t *testing.T) {
	raw := "LEEF:2.0|Lancope|StealthWatch|1.0|41|src=192.0.2.1\tdst=198.51.100.2"
	event := syslogExecute("SYSLOG_LEEF", raw)
	if event == nil {
		t.Fatal("expected the LEEF event to be retained")
	}
	if got := event.Log["product"].GetStringValue(); got != "StealthWatch" {
		t.Fatalf("LEEF header did not split: expected product=%q, got %q", "StealthWatch", got)
	}
}
