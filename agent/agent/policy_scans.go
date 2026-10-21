package agent

import (
	"strings"
	"sync"
	"time"
)

// PT-5 scan-cadence section (SPEC-PT-5, Option A — native, reuse-first).
//
// The scans section drives WHEN the agent runs its native scanners:
//   - scans.cis  → the net-new OpenSCAP/OVAL CIS benchmark engine (profile-selected).
//   - scans.vuln → the EXISTING agent SBOM package inventory feeding HaVulnService
//                  (CVE + EPSS). PT-5 adds ONLY the cadence knob; it does not add a
//                  parallel vuln model.
//
// Both sub-sections share the same cadence shape (enabled / profile / mode /
// cronOrInterval / source). Only source=agent is implemented by this build;
// source=ingest is reserved for a later external-scanner lane and is treated as
// "not run by the agent" (honest capability — never silently pretend).
//
// Design contract (PT-0 §6): unknown / older-shape fields are IGNORED, never fatal.
// An agent that predates this section deserializes the document, keeps the sections
// it understands, and drops the rest.

// Scan modes.
const (
	ScanModeScheduled = "scheduled"
	ScanModeRealtime  = "realtime"
)

// Scan sources. Only agent is built in PT-5; ingest is reserved.
const (
	ScanSourceAgent  = "agent"
	ScanSourceIngest = "ingest"
)

// Scan cadence clamps. A scheduled interval below the floor would let a template
// saturate a customer endpoint; the ceiling keeps a mis-set cron from starving a
// scan forever. Realtime scans are additionally debounced by the engine.
const (
	MinScanInterval     = 15 * time.Minute
	MaxScanInterval     = 168 * time.Hour // 7 days
	DefaultScanInterval = 24 * time.Hour
)

// ScansPolicySection carries the CIS and Vuln scan cadences.
type ScansPolicySection struct {
	CIS  *ScanSpec `json:"cis,omitempty"`
	Vuln *ScanSpec `json:"vuln,omitempty"`
}

// ScanSpec is one scanner's cadence configuration.
type ScanSpec struct {
	// Enabled turns the scanner on. A nil/false Enabled means the scanner does not run.
	Enabled bool `json:"enabled,omitempty"`
	// Profile selects the benchmark/content (CIS only), e.g. "CIS_Ubuntu_22.04_L1".
	// Ignored for vuln (the SBOM inventory has no profile).
	Profile string `json:"profile,omitempty"`
	// Mode is "scheduled" (cron/interval cadence) or "realtime" (re-check on change).
	Mode string `json:"mode,omitempty"`
	// CronOrInterval is a Go duration ("24h", "30m") or a cron expression. PT-5
	// parses durations natively; a cron expression is accepted but falls back to the
	// default interval until a cron engine lands (reported as partial, not enforced).
	CronOrInterval string `json:"cronOrInterval,omitempty"`
	// Source is "agent" (native, built PT-5) or "ingest" (external scanner, reserved).
	Source string `json:"source,omitempty"`
}

// normalizeScansSection trims and lower-cases enum-like fields. An unrecognised mode
// or source is left as-is here (the apply layer treats unknown source as not-run and
// unknown mode as scheduled) so a newer document never crashes apply.
func normalizeScansSection(in *ScansPolicySection) {
	if in == nil {
		return
	}
	normalizeScanSpec(in.CIS)
	normalizeScanSpec(in.Vuln)
}

func normalizeScanSpec(s *ScanSpec) {
	if s == nil {
		return
	}
	s.Profile = strings.TrimSpace(s.Profile)
	s.Mode = strings.ToLower(strings.TrimSpace(s.Mode))
	s.CronOrInterval = strings.TrimSpace(s.CronOrInterval)
	s.Source = strings.ToLower(strings.TrimSpace(s.Source))
	if s.Source == "" {
		s.Source = ScanSourceAgent
	}
}

// RunByAgent reports whether this agent build runs the scan: it must be enabled and
// sourced from the agent (ingest is reserved and never run here).
func (s *ScanSpec) RunByAgent() bool {
	return s != nil && s.Enabled && s.Source == ScanSourceAgent
}

// IsRealtime reports whether the scan re-checks on change events rather than on a
// fixed cadence. Any non-realtime mode (including empty/unknown) is scheduled.
func (s *ScanSpec) IsRealtime() bool {
	return s != nil && s.Mode == ScanModeRealtime
}

// EffectiveInterval returns the clamped scheduled cadence for the scan. A parseable
// Go duration is clamped into [MinScanInterval, MaxScanInterval]; anything else
// (empty, or a cron expression this build cannot evaluate yet) falls back to the
// default. Realtime scans ignore the interval but keep it as a safety re-scan floor.
func (s *ScanSpec) EffectiveInterval() time.Duration {
	if s == nil || strings.TrimSpace(s.CronOrInterval) == "" {
		return DefaultScanInterval
	}
	d, err := time.ParseDuration(s.CronOrInterval)
	if err != nil {
		// A cron expression or malformed value — not evaluable by this build.
		return DefaultScanInterval
	}
	return clampScanInterval(d)
}

// CronOrIntervalIsDuration reports whether CronOrInterval parsed as a Go duration.
// A false result for a non-empty value means a cron expression the agent cannot yet
// evaluate (reported honestly as partial cadence enforcement).
func (s *ScanSpec) CronOrIntervalIsDuration() bool {
	if s == nil || strings.TrimSpace(s.CronOrInterval) == "" {
		return false
	}
	_, err := time.ParseDuration(s.CronOrInterval)
	return err == nil
}

func clampScanInterval(d time.Duration) time.Duration {
	if d <= 0 {
		return DefaultScanInterval
	}
	if d < MinScanInterval {
		return MinScanInterval
	}
	if d > MaxScanInterval {
		return MaxScanInterval
	}
	return d
}

// cisCapabilityProber lets the native CIS engine report, at runtime, whether this
// host can actually run an OpenSCAP scan (SCAP content present + oscap available).
// It is registered by the engine via SetCISCapabilityProber. Until registered — or
// on a build with no engine — CIS is parsed-only: the agent records the desired
// cadence but cannot run a scan, and must say so honestly.
var (
	cisCapabilityMu     sync.RWMutex
	cisCapabilityProber func() EnforcementStatus
)

// SetCISCapabilityProber registers the runtime CIS capability probe. Passing nil
// resets to the parsed-only default.
func SetCISCapabilityProber(fn func() EnforcementStatus) {
	cisCapabilityMu.Lock()
	defer cisCapabilityMu.Unlock()
	cisCapabilityProber = fn
}

// cisEngineCapability returns the honest CIS enforcement level. Default parsed-only
// when no engine has registered a probe.
func cisEngineCapability() EnforcementStatus {
	cisCapabilityMu.RLock()
	prober := cisCapabilityProber
	cisCapabilityMu.RUnlock()
	if prober == nil {
		return EnforcementParsedOnly
	}
	return prober()
}

