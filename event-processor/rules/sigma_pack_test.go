package rules

import (
	"strings"
	"testing"
)

// TestSigmaPackLoads verifies the Sigma-format detection files under
// builtin-rules/ are compiled and loaded (B0-1). Before this change they were
// silently skipped with "missing CEL where".
func TestSigmaPackLoads(t *testing.T) {
	const dir = "../builtin-rules"

	rep := LoadFromDir(dir)

	loadedSigma := 0
	for _, r := range AllRules() {
		if strings.HasPrefix(r.Name, "SIGMA") {
			loadedSigma++
		}
	}

	// Acceptance target from the B0-1 spec: the Sigma pack now loads.
	if loadedSigma < 100 {
		t.Fatalf("expected >=100 Sigma rules to load, got %d (report: loaded=%d skipped=%d)",
			loadedSigma, rep.Loaded, rep.Skipped)
	}

	// Live rule count should have risen well past the old CEL-only baseline (~108).
	if rep.Loaded < 200 {
		t.Fatalf("expected >=200 total rules loaded, got %d", rep.Loaded)
	}

	// No Sigma file may be skipped with the generic "missing CEL where" — a
	// Sigma skip must carry a specific compiler reason.
	for _, inv := range rep.Invalid {
		if strings.Contains(inv, "missing CEL where") {
			t.Errorf("a rule was skipped with generic 'missing CEL where' (Sigma should compile or report a specific reason): %s", inv)
		}
	}
}

// TestSigmaRulesEvaluate spot-checks that loaded Sigma rules are wired into
// GetRules(dataType) for windows.
func TestSigmaRulesEvaluate(t *testing.T) {
	const dir = "../builtin-rules"
	LoadFromDir(dir)

	winRules := GetRules("windows")
	if len(winRules) == 0 {
		t.Fatalf("no windows rules loaded")
	}
	sawSigma := false
	for _, r := range winRules {
		if strings.HasPrefix(r.Name, "SIGMA") && r.Where != "" {
			sawSigma = true
			break
		}
	}
	if !sawSigma {
		t.Errorf("expected at least one SIGMA-derived rule under dataType=windows")
	}
}
