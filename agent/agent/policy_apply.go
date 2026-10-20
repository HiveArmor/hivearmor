package agent

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/telemetry"
	"github.com/hivearmor/agent/utils"
)

// Collector hot-toggle capability (STAGING CANDIDATE).
//
// Hot-apply on APPLY_POLICY / startup without process restart:
//   - fim watch rules (via FIM applier callback) — new roots + exclude filters;
//     replace uses best-effort full WatchList rebuild (fewer restarts)
//   - response.allow_shell (runtime gate)
//   - telemetry.sca_interval_hours / sbom_interval_hours (SCA/SBOM loop)
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

	registryApplierMu sync.RWMutex
	registryApplier   func(keys []string, mode string) error

	shellPolicyEnabled atomic.Bool

	appliedPolicyID      atomic.Int64
	appliedPolicyVersion atomic.Int64

	// PT-4 section appliers. Each is optional: when no collector has registered an
	// applier yet, the desired state is stashed and consumed at collector start.
	userLogApplierMu sync.RWMutex
	userLogApplier   func(tails []UserLogTail) error

	changeRegistryApplierMu sync.RWMutex
	changeRegistryApplier   func(rootKeys []string) error

	// PT-5 scans applier. The native scanner engine (CIS + vuln cadence) registers
	// this; until it does, the desired scans state is stashed and consumed at start.
	scansApplierMu sync.RWMutex
	scansApplier   func(scans *ScansPolicySection) error
)

// SetScansPolicyApplier registers the callback used when the scans section applies.
// The native scanner engine registers this to (re)arm CIS + vuln scan cadence.
func SetScansPolicyApplier(fn func(scans *ScansPolicySection) error) {
	scansApplierMu.Lock()
	defer scansApplierMu.Unlock()
	scansApplier = fn
}

// SetUserLogPolicyApplier registers the callback used when the userLog section applies.
// The file-tail collector registers this to honour arbitrary file-tail specs at runtime.
func SetUserLogPolicyApplier(fn func(tails []UserLogTail) error) {
	userLogApplierMu.Lock()
	defer userLogApplierMu.Unlock()
	userLogApplier = fn
}

// SetChangeRegistryPolicyApplier registers the callback for change.registry root-keys.
// On Windows the registry FIM watcher registers this to extend watched HKLM keys.
func SetChangeRegistryPolicyApplier(fn func(rootKeys []string) error) {
	changeRegistryApplierMu.Lock()
	defer changeRegistryApplierMu.Unlock()
	changeRegistryApplier = fn
}

// SetFIMPolicyApplier registers the callback used when policy FIM sections apply.
func SetFIMPolicyApplier(fn func(rules []FIMWatchRule, mode string) error) {
	fimApplierMu.Lock()
	defer fimApplierMu.Unlock()
	fimApplier = fn
}

// SetRegistryPolicyApplier registers the callback for Windows registry FIM keys.
func SetRegistryPolicyApplier(fn func(keys []string, mode string) error) {
	registryApplierMu.Lock()
	defer registryApplierMu.Unlock()
	registryApplier = fn
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

// RecordAppliedPolicyMeta stores the last successfully applied policy id/version for vitals.
func RecordAppliedPolicyMeta(policyID int64, version int) {
	appliedPolicyID.Store(policyID)
	appliedPolicyVersion.Store(int64(version))
}

// AppliedPolicyMeta returns the last recorded applied policy id and version (0 if none).
func AppliedPolicyMeta() (policyID int64, version int) {
	return appliedPolicyID.Load(), int(appliedPolicyVersion.Load())
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

		var regKeys []string
		regMode := FIMModeMerge
		if doc.FIM.Registry != nil {
			regKeys = doc.FIM.Registry.Keys
			if doc.FIM.Registry.Mode != "" {
				regMode = doc.FIM.Registry.Mode
			}
		}
		registryApplierMu.RLock()
		regApplier := registryApplier
		registryApplierMu.RUnlock()
		if regApplier != nil {
			if err := regApplier(regKeys, regMode); err != nil {
				return fmt.Errorf("fim registry apply: %w", err)
			}
		} else {
			stashRegistryPolicy(regKeys, regMode)
		}
	}

	shellPolicyEnabled.Store(AllowShellFromPolicy(doc))
	applyTelemetryIntervals(doc.Telemetry)
	applySections(doc)

	appliedPolicyMu.Lock()
	appliedPolicy = doc
	appliedPolicyMu.Unlock()

	utils.Logger.LogF(100, "policy_apply: applied schema_version=%d allow_shell=%v collectors=%d sca=%s sbom=%s event_logs=%s user_logs=%s change_registry=%s script_items=%s cert_stores=%s caps=[%s]",
		doc.SchemaVersion, shellPolicyEnabled.Load(), len(doc.Collectors),
		telemetry.EffectiveSCAInterval(), telemetry.EffectiveSBOMInterval(),
		sectionCount(eventLogCount(doc.Event)), sectionCount(len(doc.UserLog)),
		sectionCount(changeRegistryCount(doc.Change)), sectionCount(scriptItemCount(doc.Script)),
		sectionCount(len(doc.Certificate)), CapabilityAdvertisement())
	return nil
}

// applySections wires the PT-4 template sections to runtime behaviour, honestly.
//   - userLog      → file-tail applier (or stashed for collector start).
//   - change.registry → Windows registry watcher applier (or stashed).
//   - event / script / certificate → desired-state recorded on the applied document and
//     advertised via SectionCapabilities; script content is NEVER logged or executed.
//
// Every applier failure is logged (no raw customer data) and does not abort the rest of
// the apply — one unsupported section must not block the sections the agent DOES enforce.
func applySections(doc *AgentPolicyDocument) {
	if len(doc.UserLog) > 0 {
		userLogApplierMu.RLock()
		applier := userLogApplier
		userLogApplierMu.RUnlock()
		if applier != nil {
			if err := applier(doc.UserLog); err != nil {
				utils.Logger.ErrorF("policy_apply: userLog apply failed: %v", err)
			}
		} else {
			stashUserLogPolicy(doc.UserLog)
		}
	}

	if doc.Change != nil && len(doc.Change.Registry) > 0 {
		rootKeys := RegistryRootKeysFromChange(doc.Change)
		changeRegistryApplierMu.RLock()
		applier := changeRegistryApplier
		changeRegistryApplierMu.RUnlock()
		if applier != nil {
			if err := applier(rootKeys); err != nil {
				utils.Logger.ErrorF("policy_apply: change.registry apply failed: %v", err)
			}
		} else {
			stashChangeRegistryPolicy(rootKeys)
		}
	}

	// event / script / certificate: parsed + capability-advertised. No runtime action
	// is taken that the agent cannot honestly enforce. Script content is deliberately
	// not executed and not logged (SPEC-PT-4 §4).

	applyScans(doc.Scans)
}

// applyScans wires the PT-5 scans section to runtime behaviour, honestly.
//   - scans.vuln (source=agent): drives the cadence of the EXISTING SBOM package
//     inventory loop that feeds HaVulnService. When enabled with a scheduled interval
//     we tighten the SBOM post interval to that cadence; realtime keeps the default
//     interval as a safety floor and relies on change-triggered re-scans in the engine.
//   - scans.cis (source=agent): handed to the native OpenSCAP/OVAL scanner applier
//     (or stashed until it registers). The engine decides enforceability at runtime
//     (SCAP content present + oscap available) — we never pretend here.
//
// An ingest-sourced or disabled scan is a no-op for the agent (reserved lane).
func applyScans(scans *ScansPolicySection) {
	if scans == nil {
		return
	}

	// Vuln cadence reuses the SBOM inventory loop. Only tighten the interval; never
	// loosen the SCA cadence, which serves a different (config-observation) purpose.
	if scans.Vuln.RunByAgent() && !scans.Vuln.IsRealtime() {
		sbom := scans.Vuln.EffectiveInterval()
		telemetry.SetSBOMInterval(sbom)
		utils.Logger.LogF(100, "policy_apply: scans.vuln cadence applied sbom_interval=%s", sbom)
	}

	// CIS engine: hand to the applier if registered, else stash for engine start.
	scansApplierMu.RLock()
	applier := scansApplier
	scansApplierMu.RUnlock()
	if applier != nil {
		if err := applier(scans); err != nil {
			utils.Logger.ErrorF("policy_apply: scans apply failed: %v", err)
		}
	} else {
		stashScansPolicy(scans)
	}
}

func eventLogCount(sec *EventPolicySection) int {
	if sec == nil {
		return 0
	}
	return len(sec.EventLogs)
}

func changeRegistryCount(sec *ChangePolicySection) int {
	if sec == nil {
		return 0
	}
	return len(sec.Registry)
}

func scriptItemCount(sec *ScriptPolicySection) int {
	if sec == nil {
		return 0
	}
	return len(sec.WMI) + len(sec.PowerShell)
}

func applyTelemetryIntervals(section *TelemetryPolicySection) {
	var scaH, sbomH *int
	if section != nil {
		scaH = section.SCAIntervalHours
		sbomH = section.SBOMIntervalHours
	}
	sca := time.Duration(ClampTelemetryIntervalHours(scaH)) * time.Hour
	sbom := time.Duration(ClampTelemetryIntervalHours(sbomH)) * time.Hour
	telemetry.SetScanIntervals(sca, sbom)
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
	RecordAppliedPolicyMeta(latest.PolicyID, latest.AppliedVersion)
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

	pendingRegMu   sync.Mutex
	pendingRegKeys []string
	pendingRegMode string
	pendingRegSet  bool
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

func stashRegistryPolicy(keys []string, mode string) {
	pendingRegMu.Lock()
	defer pendingRegMu.Unlock()
	pendingRegKeys = append([]string(nil), keys...)
	pendingRegMode = mode
	pendingRegSet = true
}

// PeekPendingRegistryPolicy returns stashed registry FIM keys (Windows).
func PeekPendingRegistryPolicy() (keys []string, mode string, ok bool) {
	pendingRegMu.Lock()
	defer pendingRegMu.Unlock()
	if !pendingRegSet {
		return nil, "", false
	}
	return append([]string(nil), pendingRegKeys...), pendingRegMode, true
}

// PT-4 pending-section state: stashed until a collector registers its applier, then
// consumed at collector start (mirrors the FIM/registry pending pattern above).
var (
	pendingUserLogMu  sync.Mutex
	pendingUserLog    []UserLogTail
	pendingUserLogSet bool

	pendingChangeRegMu   sync.Mutex
	pendingChangeRegKeys []string
	pendingChangeRegSet  bool
)

func stashUserLogPolicy(tails []UserLogTail) {
	pendingUserLogMu.Lock()
	defer pendingUserLogMu.Unlock()
	pendingUserLog = append([]UserLogTail(nil), tails...)
	pendingUserLogSet = true
}

// PeekPendingUserLogPolicy returns stashed userLog tail specs without clearing, so the
// file-tail collector can pick them up when it starts after an early APPLY_POLICY.
func PeekPendingUserLogPolicy() (tails []UserLogTail, ok bool) {
	pendingUserLogMu.Lock()
	defer pendingUserLogMu.Unlock()
	if !pendingUserLogSet {
		return nil, false
	}
	return append([]UserLogTail(nil), pendingUserLog...), true
}

func stashChangeRegistryPolicy(rootKeys []string) {
	pendingChangeRegMu.Lock()
	defer pendingChangeRegMu.Unlock()
	pendingChangeRegKeys = append([]string(nil), rootKeys...)
	pendingChangeRegSet = true
}

// PeekPendingChangeRegistryPolicy returns stashed change.registry root-keys without
// clearing, so the Windows registry watcher can pick them up at start.
func PeekPendingChangeRegistryPolicy() (rootKeys []string, ok bool) {
	pendingChangeRegMu.Lock()
	defer pendingChangeRegMu.Unlock()
	if !pendingChangeRegSet {
		return nil, false
	}
	return append([]string(nil), pendingChangeRegKeys...), true
}

// PT-5 pending scans state: stashed until the native scanner engine registers its
// applier, then consumed at engine start (mirrors the FIM/userLog pending pattern).
var (
	pendingScansMu  sync.Mutex
	pendingScans    *ScansPolicySection
	pendingScansSet bool
)

func stashScansPolicy(scans *ScansPolicySection) {
	pendingScansMu.Lock()
	defer pendingScansMu.Unlock()
	pendingScans = cloneScansPolicy(scans)
	pendingScansSet = true
}

// PeekPendingScansPolicy returns the stashed scans section without clearing, so the
// native scanner engine can pick it up when it starts after an early APPLY_POLICY.
func PeekPendingScansPolicy() (scans *ScansPolicySection, ok bool) {
	pendingScansMu.Lock()
	defer pendingScansMu.Unlock()
	if !pendingScansSet {
		return nil, false
	}
	return cloneScansPolicy(pendingScans), true
}

// cloneScansPolicy returns a deep copy so a stashed section cannot be mutated by a
// later apply sharing the same pointer.
func cloneScansPolicy(in *ScansPolicySection) *ScansPolicySection {
	if in == nil {
		return nil
	}
	out := &ScansPolicySection{}
	if in.CIS != nil {
		cis := *in.CIS
		out.CIS = &cis
	}
	if in.Vuln != nil {
		vuln := *in.Vuln
		out.Vuln = &vuln
	}
	return out
}
