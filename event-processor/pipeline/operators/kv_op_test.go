package operators

import "testing"

// KVOp must parse the explicit `source` when it resolves to a non-empty string, and fall
// back to data["raw"] otherwise. Before the fix it always parsed data["raw"], ignoring
// source — which mangled CEF/LEEF events (the whole raw line, incl. the header, was kv-split).

func TestKVOpHonorsExplicitSource(t *testing.T) {
	data := map[string]any{
		"raw": `CEF:0|V|P|1|100|name with spaces|4|src=10.0.0.1 dst=10.0.0.2 act=block`,
		"log": map[string]any{
			// an earlier grok step isolated the extension here
			"cefExtension": `src=10.0.0.1 dst=10.0.0.2 act=block`,
		},
	}
	KVOp(" ", "=", "log.cefExtension", data)
	logMap := data["log"].(map[string]any)
	if logMap["src"] != "10.0.0.1" {
		t.Fatalf("expected src from the isolated source, got %v", logMap["src"])
	}
	if logMap["act"] != "block" {
		t.Fatalf("expected act from the isolated source, got %v", logMap["act"])
	}
	// The header must NOT have leaked in as a bogus key (which happens when kv parses raw).
	for k := range logMap {
		if len(k) > 0 && (k[0] == 'C' && len(k) >= 3 && k[:3] == "CEF") {
			t.Fatalf("header leaked into kv output via raw: key %q", k)
		}
	}
}

func TestKVOpFallsBackToRawWhenSourceEmpty(t *testing.T) {
	data := map[string]any{
		"raw": `a=1 b=2`,
	}
	// source points at a key that does not exist -> fall back to raw (historical behavior)
	KVOp(" ", "=", "log.missing", data)
	logMap := data["log"].(map[string]any)
	if logMap["a"] != "1" || logMap["b"] != "2" {
		t.Fatalf("expected fallback-to-raw parse, got %v", logMap)
	}
}

func TestKVOpNoSourceParsesRaw(t *testing.T) {
	data := map[string]any{"raw": `x=9 y=10`}
	KVOp(" ", "=", "", data)
	logMap := data["log"].(map[string]any)
	if logMap["x"] != "9" || logMap["y"] != "10" {
		t.Fatalf("expected raw parse with empty source, got %v", logMap)
	}
}
