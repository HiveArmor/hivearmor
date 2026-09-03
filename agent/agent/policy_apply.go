package agent

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/utils"
)

// Collector hot-toggle capability (STAGING CANDIDATE).
//
// Hot-apply on APPLY_POLICY / startup without process restart:
//   - fim watch rules (via FIM applier callback) — new roots + exclude filters
//   - response.allow_shell (runtime gate)
//
// FIM hot-reload notes:
//   - New exclude patterns drop events immediately; excluded paths are not seeded.
//   - New watch roots are added immediately; old roots get best-effort Remove.
//   - Recursive subdir watches under a removed root may linger until process
//     restart (fsnotify has no portable remove-all); stale events are filtered.
//
// Desired-state recorded; takes effect on next agent process start
// (service wiring consults CollectorDesiredEnabled):
//   - collectors.dns, netconn, usb, netflow, syslog, file
//
// Always mode-gated (EDR install), not hot-toggled here:
//   - ebpf, etw, esf

var (
	appliedPolicyMu sync.RWMutex
	appliedPolicy   *AgentPolicyDocument

	fimApplierMu sync.RWMutex
	fimApplier   func(rules []FIMWatchRule, mode string) error

	shellPolicyEnabled atomic.Bool
)

// SetFIMPolicyApplier registers the callback used when policy FIM sections apply.
func SetFIMPolicyApplier(fn func(rules []FIMWatchRule, mode string) error) {
	fimApplierMu.Lock()
	defer fimApplierMu.Unlock()
	fimApplier = fn
}

// GetAppliedPolicy returns the last successfully applied document (may be nil).
func GetAppliedPolicy() *AgentPolicyDocument {
	appliedPolicyMu.RLock()
	defer appliedPolicyMu.RUnlock()
	return appliedPolicy
}

// CollectorDesiredEnabled returns desired enablement for a collector name.
// Missing key → true (historical default). Explicit false disables at next start.
func CollectorDesiredEnabled(name string) bool {
	appliedPolicyMu.RLock()
	defer appliedPolicyMu.RUnlock()
	if appliedPolicy == nil || appliedPolicy.Collectors == nil {
		return true
	}
	enabled, ok := appliedPolicy.Collectors[name]
	if !ok {
		return true
	}
	return enabled
}

// PolicyAllowsShell reports the runtime shell gate from the last applied policy.
func PolicyAllowsShell() bool {
	return shellPolicyEnabled.Load()
}

// ApplyPolicyConfig parses and applies a policy JSON document to runtime subsystems.
func ApplyPolicyConfig(policyConfig string) error {
	doc, err := ParseAgentPolicyDocument(policyConfig)
	if err != nil {
		return err
	}
	return applyParsedPolicy(doc)
}

func applyParsedPolicy(doc *AgentPolicyDocument) error {
	if doc == nil {
		doc = &AgentPolicyDocument{}
	}

	if doc.FIM != nil {
		fimApplierMu.RLock()
		applier := fimApplier
		fimApplierMu.RUnlock()
		if applier != nil {
			if err := applier(doc.FIM.Rules, doc.FIM.Mode); err != nil {
				return fmt.Errorf("fim apply: %w", err)
			}
		} else {
			stashFIMPolicy(doc.FIM.Rules, doc.FIM.Mode)
		}
	}

	shellPolicyEnabled.Store(AllowShellFromPolicy(doc))

	appliedPolicyMu.Lock()
	appliedPolicy = doc
	appliedPolicyMu.Unlock()

	utils.Logger.LogF(100, "policy_apply: applied schema_version=%d allow_shell=%v collectors=%d",
		doc.SchemaVersion, shellPolicyEnabled.Load(), len(doc.Collectors))
	return nil
}

// LoadAndApplyLatestPolicy loads the newest PolicyState row and applies it.
// No-op when no rows exist.
func LoadAndApplyLatestPolicy() error {
	db, err := database.GetDB()
	if err != nil {
		return fmt.Errorf("policy_apply: db: %w", err)
	}
	if err := db.Migrate(&PolicyState{}); err != nil {
		return fmt.Errorf("policy_apply: migrate: %w", err)
	}
	var states []PolicyState
	if err := db.GetAll(&states); err != nil {
		return fmt.Errorf("policy_apply: load: %w", err)
	}
	if len(states) == 0 {
		return nil
	}
	latest := states[0]
	for _, s := range states[1:] {
		if s.AppliedAt > latest.AppliedAt {
			latest = s
		}
	}
	if err := ApplyPolicyConfig(latest.PolicyConfig); err != nil {
		return err
	}
	utils.Logger.LogF(100, "policy_apply: loaded stored policy_id=%d version=%d",
		latest.PolicyID, latest.AppliedVersion)
	return nil
}

// EnvAllowRemoteShell is the staging override env var (value "1" or "true").
const EnvAllowRemoteShell = "HIVEARMOR_ALLOW_REMOTE_SHELL"

// ShellExecutionAllowed combines local config, env, and applied policy.
// Default: deny unstructured remote shell.
func ShellExecutionAllowed(allowRemoteShellConfig bool) bool {
	if allowRemoteShellConfig {
		return true
	}
	if envTruthy(os.Getenv(EnvAllowRemoteShell)) {
		return true
	}
	return PolicyAllowsShell()
}

func envTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// ShellDeniedMessage is returned in CommandResult when shell is blocked.
const ShellDeniedMessage = "REMOTE_SHELL denied: unstructured shell disabled by default; enable via config allow_remote_shell, policy response.allow_shell, or env HIVEARMOR_ALLOW_REMOTE_SHELL; prefer EDR_* commands"

var (
	pendingFIMMu    sync.Mutex
	pendingFIMRules []FIMWatchRule
	pendingFIMMode  string
	pendingFIMSet   bool
)

func stashFIMPolicy(rules []FIMWatchRule, mode string) {
	pendingFIMMu.Lock()
	defer pendingFIMMu.Unlock()
	pendingFIMRules = append([]FIMWatchRule(nil), rules...)
	pendingFIMMode = mode
	pendingFIMSet = true
}

// PeekPendingFIMPolicy returns stashed FIM policy without clearing (collector may register applier later).
func PeekPendingFIMPolicy() (rules []FIMWatchRule, mode string, ok bool) {
	pendingFIMMu.Lock()
	defer pendingFIMMu.Unlock()
	if !pendingFIMSet {
		return nil, "", false
	}
	return append([]FIMWatchRule(nil), pendingFIMRules...), pendingFIMMode, true
}
