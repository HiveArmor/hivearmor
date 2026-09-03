package fim

import (
	"runtime"
	"testing"

	"github.com/hivearmor/agent/agent"
)

func TestResolveWatchRules_Merge(t *testing.T) {
	policy := []WatchRule{{Path: "/custom", Recursive: true}}
	got := ResolveWatchRules(policy, agent.FIMModeMerge)
	if len(got) < 2 {
		t.Fatalf("expected defaults+policy, got %d", len(got))
	}
	last := got[len(got)-1]
	if last.Path != "/custom" {
		t.Fatalf("last rule path=%s", last.Path)
	}
}

func TestResolveWatchRules_Replace(t *testing.T) {
	policy := []WatchRule{{Path: "/only", Recursive: false}}
	got := ResolveWatchRules(policy, agent.FIMModeReplace)
	if len(got) != 1 || got[0].Path != "/only" {
		t.Fatalf("replace: %+v", got)
	}
}

func TestResolveWatchRules_EmptyFallsBack(t *testing.T) {
	got := ResolveWatchRules(nil, agent.FIMModeReplace)
	defaults := defaultRules()
	if len(got) != len(defaults) {
		t.Fatalf("empty replace should use defaults: got %d want %d", len(got), len(defaults))
	}
}

func TestRulesFromAgentPolicy(t *testing.T) {
	in := []agent.FIMWatchRule{{Path: "/a", Recursive: true, Exclude: []string{"*.tmp"}}}
	out := RulesFromAgentPolicy(in)
	if len(out) != 1 || out[0].Path != "/a" || !out[0].Recursive || out[0].Exclude[0] != "*.tmp" {
		t.Fatalf("%+v", out)
	}
}

func TestDefaultRulesNonEmptyOnSupportedOS(t *testing.T) {
	switch runtime.GOOS {
	case "linux", "windows", "darwin":
		if len(defaultRules()) == 0 {
			t.Fatal("expected platform defaults")
		}
	}
}

func TestApplyPolicyRules_WithoutLiveCollector(t *testing.T) {
	runtimeRulesMu.Lock()
	liveCollector = nil
	runtimeRules = nil
	runtimeRulesMu.Unlock()

	err := ApplyPolicyRules([]WatchRule{{Path: "/tmp/ha-fim-test", Recursive: false}}, agent.FIMModeReplace)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	runtimeRulesMu.RLock()
	defer runtimeRulesMu.RUnlock()
	if len(runtimeRules) != 1 || runtimeRules[0].Path != "/tmp/ha-fim-test" {
		t.Fatalf("runtimeRules=%+v", runtimeRules)
	}
}
