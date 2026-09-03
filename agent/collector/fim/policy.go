package fim

import (
	"path/filepath"
	"runtime"
	"sync"

	"github.com/hivearmor/agent/agent"
)

// WatchRule describes a single policy entry for FIM.
// Rules are either pushed from the server via policy sync or initialised
// from the built-in defaults below.
type WatchRule struct {
	// Path is the absolute file or directory path to watch.
	Path string `json:"path" yaml:"path"`
	// Recursive controls whether sub-directories are also watched.
	Recursive bool `json:"recursive" yaml:"recursive"`
	// Exclude is a list of glob patterns relative to Path to ignore.
	Exclude []string `json:"exclude,omitempty" yaml:"exclude,omitempty"`
}

var (
	runtimeRulesMu sync.RWMutex
	runtimeRules   []WatchRule
	liveCollector  *Collector
)

// ResolveWatchRules builds the effective watch list from defaults + policy.
// mode: "merge" (default) appends policy rules to platform defaults;
// "replace" uses only policy rules (falls back to defaults if policy rules empty).
func ResolveWatchRules(policyRules []WatchRule, mode string) []WatchRule {
	defaults := defaultRules()
	if len(policyRules) == 0 {
		return defaults
	}
	switch mode {
	case agent.FIMModeReplace:
		return append([]WatchRule(nil), policyRules...)
	default:
		merged := append([]WatchRule(nil), defaults...)
		return append(merged, policyRules...)
	}
}

// RulesFromAgentPolicy converts agent schema FIM rules to WatchRule.
func RulesFromAgentPolicy(in []agent.FIMWatchRule) []WatchRule {
	out := make([]WatchRule, 0, len(in))
	for _, r := range in {
		out = append(out, WatchRule{
			Path:      r.Path,
			Recursive: r.Recursive,
			Exclude:   append([]string(nil), r.Exclude...),
		})
	}
	return out
}

// RegisterPolicyApplier wires agent APPLY_POLICY → live FIM rule updates.
func RegisterPolicyApplier() {
	agent.SetFIMPolicyApplier(func(rules []agent.FIMWatchRule, mode string) error {
		return ApplyPolicyRules(RulesFromAgentPolicy(rules), mode)
	})
}

// ApplyPolicyRules updates the runtime rule set and, if a collector is running,
// refreshes fsnotify watches (STAGING CANDIDATE).
// Excludes and new roots hot-apply; removed recursive trees may need restart
// (see Collector.replaceWatchRules).
func ApplyPolicyRules(policyRules []WatchRule, mode string) error {
	resolved := ResolveWatchRules(policyRules, mode)

	runtimeRulesMu.Lock()
	runtimeRules = resolved
	c := liveCollector
	runtimeRulesMu.Unlock()

	if c != nil {
		return c.replaceWatchRules(resolved)
	}
	return nil
}

// currentStartupRules returns rules for a newly constructed collector.
func currentStartupRules() []WatchRule {
	if rules, mode, ok := agent.PeekPendingFIMPolicy(); ok {
		return ResolveWatchRules(RulesFromAgentPolicy(rules), mode)
	}
	runtimeRulesMu.RLock()
	defer runtimeRulesMu.RUnlock()
	if len(runtimeRules) > 0 {
		return append([]WatchRule(nil), runtimeRules...)
	}
	return defaultRules()
}

// defaultRules returns the built-in monitored paths for the current platform.
func defaultRules() []WatchRule {
	switch runtime.GOOS {
	case "linux":
		return linuxDefaultRules()
	case "windows":
		return windowsDefaultRules()
	case "darwin":
		return darwinDefaultRules()
	default:
		return nil
	}
}

func linuxDefaultRules() []WatchRule {
	paths := []string{
		"/etc",
		"/bin",
		"/sbin",
		"/usr/bin",
		"/usr/sbin",
		"/lib",
		"/lib64",
		"/boot",
		"/root/.ssh",
		"/etc/sudoers",
		"/etc/passwd",
		"/etc/shadow",
		"/etc/cron.d",
		"/etc/cron.daily",
		"/etc/cron.hourly",
		"/etc/cron.monthly",
		"/etc/cron.weekly",
		"/etc/crontab",
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: true})
	}
	return rules
}

func windowsDefaultRules() []WatchRule {
	sysroot := `C:\Windows`
	paths := []string{
		filepath.Join(sysroot, "System32"),
		filepath.Join(sysroot, "SysWOW64"),
		filepath.Join(sysroot, "System32", "drivers", "etc"),
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: false})
	}
	return rules
}

func darwinDefaultRules() []WatchRule {
	paths := []string{
		"/etc",
		"/bin",
		"/sbin",
		"/usr/bin",
		"/Library/LaunchDaemons",
		"/System/Library/LaunchDaemons",
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: true})
	}
	return rules
}
