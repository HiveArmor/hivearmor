package cis

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

// Engine runs the native CIS benchmark scanner on a policy-driven cadence and posts
// normalized results to the backend CIS ingest endpoint. One Engine per agent process.
//
// Concurrency contract: a single scan runs at a time (scanMu). A realtime trigger
// while a scan is in flight is coalesced into one pending re-scan (debounced) rather
// than stacking scans — this is the endpoint-resource bound for realtime mode.
type Engine struct {
	cnf *config.Config

	mu          sync.Mutex
	profile     string
	enabled     bool
	realtime    bool
	interval    time.Duration
	cronPending bool // cadence was a cron expr this build cannot evaluate yet

	scanMu       sync.Mutex // serialises actual scans (single concurrent scan)
	rearmCh      chan struct{}
	realtimeCh   chan struct{}
	stopCh       chan struct{}
	stopOnce     sync.Once
	started      bool
	lastScan     time.Time
	realtimeMinGap time.Duration
}

// realtimeDebounce is the minimum gap between realtime-triggered scans, so a burst of
// change events (e.g. a package-install storm) cannot trigger a scan storm.
const realtimeDebounce = 5 * time.Minute

// cisPostTimeout bounds the result-post HTTP call.
const cisPostTimeout = 60 * time.Second

// NewEngine constructs the CIS engine bound to the agent config.
func NewEngine(cnf *config.Config) *Engine {
	return &Engine{
		cnf:            cnf,
		interval:       DefaultScanInterval,
		rearmCh:        make(chan struct{}, 1),
		realtimeCh:     make(chan struct{}, 1),
		stopCh:         make(chan struct{}),
		realtimeMinGap: realtimeDebounce,
	}
}

// DefaultScanInterval mirrors the agent package's default so the engine has a sane
// cadence before any policy applies.
const DefaultScanInterval = 24 * time.Hour

// Capability reports the honest CIS enforcement level for THIS host at THIS moment:
//   - "enforced"    when the oscap engine is available (content is checked per scan).
//   - "parsed-only" when the engine is unavailable (no oscap / unsupported platform):
//     the agent records the desired cadence but cannot run a scan.
//
// Returned as a plain string to avoid importing the agent package (which imports this
// one would create a cycle); the agent maps it to its EnforcementStatus.
func Capability() string {
	if engineAvailable() {
		return "enforced"
	}
	return "parsed-only"
}

// ApplyScans is the policy applier the agent package registers. It (re)arms the
// engine from the desired scans.cis spec. Vuln cadence is handled by the agent's
// SBOM loop, not here. Safe to call repeatedly (hot-apply).
//
// spec fields are passed primitively to avoid an import cycle with the agent package.
func (e *Engine) ApplyScans(cisEnabled, cisRealtime bool, cisProfile string, cisInterval time.Duration, cronPending bool) {
	e.mu.Lock()
	e.enabled = cisEnabled
	e.realtime = cisRealtime
	e.profile = strings.TrimSpace(cisProfile)
	if cisInterval > 0 {
		e.interval = cisInterval
	}
	e.cronPending = cronPending
	e.mu.Unlock()

	if !e.started {
		return
	}
	// Nudge the scheduler to re-read cadence.
	select {
	case e.rearmCh <- struct{}{}:
	default:
	}
}

// TriggerRealtime requests a realtime re-scan (e.g. from a package-change event).
// Coalesced and debounced by the run loop. No-op when realtime mode is off.
func (e *Engine) TriggerRealtime() {
	e.mu.Lock()
	rt := e.realtime && e.enabled
	e.mu.Unlock()
	if !rt {
		return
	}
	select {
	case e.realtimeCh <- struct{}{}:
	default:
	}
}

// Start launches the engine run loop. It returns immediately; the loop runs until
// ctx is cancelled or Stop is called.
func (e *Engine) Start(ctx context.Context) {
	e.mu.Lock()
	if e.started {
		e.mu.Unlock()
		return
	}
	e.started = true
	e.mu.Unlock()
	go e.run(ctx)
}

// Stop halts the run loop.
func (e *Engine) Stop() {
	e.stopOnce.Do(func() { close(e.stopCh) })
}

func (e *Engine) run(ctx context.Context) {
	timer := time.NewTimer(e.nextDelay())
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-e.stopCh:
			return
		case <-e.rearmCh:
			resetTimer(timer, e.nextDelay())
		case <-e.realtimeCh:
			e.maybeRealtimeScan()
		case <-timer.C:
			e.scheduledScan()
			resetTimer(timer, e.nextDelay())
		}
	}
}

// nextDelay returns the sleep before the next scheduled scan. Realtime mode still
// keeps a slow safety-floor scan at the interval so a host is never silently un-scanned.
func (e *Engine) nextDelay() time.Duration {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.enabled {
		// Parked: wake slowly to notice a re-enable via rearmCh anyway.
		return MaxParkDelay
	}
	if e.interval <= 0 {
		return DefaultScanInterval
	}
	return e.interval
}

// MaxParkDelay is the wake cadence when scanning is disabled (just to re-check state).
const MaxParkDelay = time.Hour

func (e *Engine) scheduledScan() {
	e.mu.Lock()
	enabled, profile := e.enabled, e.profile
	mode := ScanModeScheduled
	e.mu.Unlock()
	if !enabled || profile == "" {
		return
	}
	e.doScan(profile, mode)
}

func (e *Engine) maybeRealtimeScan() {
	e.mu.Lock()
	enabled, profile := e.enabled && e.realtime, e.profile
	gap := e.realtimeMinGap
	last := e.lastScan
	e.mu.Unlock()
	if !enabled || profile == "" {
		return
	}
	if !last.IsZero() && time.Since(last) < gap {
		utils.Logger.LogF(100, "cis: realtime trigger debounced (last scan %s ago)", time.Since(last))
		return
	}
	e.doScan(profile, ScanModeRealtime)
}

// doScan runs one scan under the single-scan guard and posts the result. Scan errors
// are logged and reported as a zero-result error outcome is NOT fabricated — a failed
// scan simply posts nothing (honest), and the per-host surface shows "not scanned".
func (e *Engine) doScan(profile, mode string) {
	if !e.scanMu.TryLock() {
		utils.Logger.LogF(100, "cis: scan already in progress; skipping %s trigger", mode)
		return
	}
	defer e.scanMu.Unlock()

	if !engineAvailable() {
		utils.Logger.Info("cis: scan requested but OpenSCAP engine is unavailable on this host (parsed-only)")
		return
	}
	if !hasContentForProfile(profile) {
		utils.Logger.ErrorF("cis: no SCAP content for profile %q; skipping scan", profile)
		return
	}

	report, err := runOscap(profile, mode)
	if err != nil {
		utils.Logger.ErrorF("cis: scan failed for profile %q: %v", profile, err)
		return
	}

	e.mu.Lock()
	e.lastScan = time.Now()
	e.mu.Unlock()

	if err := e.postReport(report); err != nil {
		utils.Logger.ErrorF("cis: posting scan results failed: %v", err)
	}
}

// postReport sends the normalized report to POST /api/ha-telemetry/cis.
func (e *Engine) postReport(report *ScanReport) error {
	base := telemetryBaseURL(e.cnf.Server)
	if base == "" {
		return fmt.Errorf("cis: empty server")
	}
	hostname, agentID, tenant := e.identity()
	pass, fail, errCount, na, notChecked := report.Tally()

	rows := make([]cisPayloadRow, 0, len(report.Results))
	for _, c := range report.Results {
		rows = append(rows, cisPayloadRow{
			ControlID:   c.ControlID,
			Title:       c.Title,
			Severity:    c.Severity,
			Status:      string(c.Status),
			Idref:       c.Idref,
			Remediation: c.Remediation,
		})
	}

	payload := cisPayload{
		AgentID:     agentID,
		Hostname:    hostname,
		TenantID:    tenant,
		Profile:     report.Profile,
		Benchmark:   report.Benchmark,
		ContentHash: report.ContentHash,
		Mode:        report.Mode,
		ScannedAt:   report.FinishedAt.UTC().Format(time.RFC3339),
		DurationMs:  report.FinishedAt.Sub(report.StartedAt).Milliseconds(),
		Summary: cisPayloadSummary{
			Total:      len(report.Results),
			Pass:       pass,
			Fail:       fail,
			Error:      errCount,
			NA:         na,
			NotChecked: notChecked,
		},
		Results: rows,
	}

	return e.postJSON(base+"/api/ha-telemetry/cis", payload)
}

func (e *Engine) identity() (hostname, agentID string, tenant *int64) {
	hostname = "unknown"
	if osInfo, err := utils.GetOsInfo(); err == nil && osInfo.Hostname != "" {
		hostname = osInfo.Hostname
	}
	if e.cnf != nil && e.cnf.AgentID > 0 {
		agentID = strconv.Itoa(int(e.cnf.AgentID))
	}
	if agentID == "" {
		agentID = strings.TrimSpace(os.Getenv("HA_AGENT_ID"))
	}
	if raw := strings.TrimSpace(os.Getenv("HA_TENANT_ID")); raw != "" {
		if n, convErr := strconv.ParseInt(raw, 10, 64); convErr == nil {
			tenant = &n
		}
	}
	return hostname, agentID, tenant
}

func (e *Engine) postJSON(url string, body any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("cis: marshaling payload: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("cis: building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if e.cnf != nil && e.cnf.AgentID > 0 && strings.TrimSpace(e.cnf.AgentKey) != "" {
		req.Header.Set("X-HiveArmor-Agent-Id", strconv.Itoa(int(e.cnf.AgentID)))
		req.Header.Set("X-Agent-Key", e.cnf.AgentKey)
	} else if internal := strings.TrimSpace(os.Getenv("HA_INTERNAL_KEY")); internal != "" {
		req.Header.Set("X-Internal-Key", internal)
	}

	skipTLS := e.cnf != nil && e.cnf.SkipCertValidation
	client := &http.Client{
		Timeout: cisPostTimeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: skipTLS}, //nolint:gosec
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("cis: posting results: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("cis: ingest returned status %d", resp.StatusCode)
	}
	utils.Logger.Info("cis: scan results accepted by backend")
	return nil
}

func telemetryBaseURL(server string) string {
	s := strings.TrimSpace(server)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
		return strings.TrimRight(s, "/")
	}
	return "https://" + s
}

func resetTimer(t *time.Timer, d time.Duration) {
	if !t.Stop() {
		select {
		case <-t.C:
		default:
		}
	}
	if d < time.Second {
		d = time.Second
	}
	t.Reset(d)
}
