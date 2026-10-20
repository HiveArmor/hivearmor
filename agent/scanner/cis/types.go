// Package cis implements the PT-5 native CIS benchmark engine (SPEC-PT-5, Option A).
//
// The engine runs CIS-benchmark checks via OpenSCAP/OVAL content selected by the
// template's scans.cis.profile, in scheduled or realtime mode, and posts normalized
// pass/fail-per-control results to the backend CIS ingest endpoint
// (POST /api/ha-telemetry/cis), which routes them to a NET-NEW OpenSearch index
// (v3-hive-cis-*) — DISTINCT from the vulnerability findings store.
//
// SCAP content is shipped and versioned OUT-OF-BAND (not baked into the binary); the
// engine resolves it from a content directory at runtime. Endpoint resource use is
// bounded (single concurrent scan, nice/ionice where available, realtime debounce).
//
// Coding conventions: the agent module is the documented catcher-free exception
// (AGT-SIZE-01) — this package uses utils.Logger for structured logging and
// fmt.Errorf for errors, never a raw logger and never InsecureSkipVerify. Scan
// content paths and control ids are safe to log; no raw customer data is logged.
package cis

import (
	"strings"
	"time"
)
// ControlStatus is the normalized per-control outcome.
type ControlStatus string

const (
	StatusPass          ControlStatus = "PASS"
	StatusFail          ControlStatus = "FAIL"
	StatusError         ControlStatus = "ERROR"
	StatusNotApplicable ControlStatus = "NOT_APPLICABLE"
	StatusNotChecked    ControlStatus = "NOT_CHECKED"
)

// Scan modes (local copy; the agent package owns the policy-facing constants, but
// importing it here would create a cycle). Values MUST match agent.ScanMode*.
const (
	ScanModeScheduled = "scheduled"
	ScanModeRealtime  = "realtime"
)

// normalizeStatus maps an OpenSCAP XCCDF rule-result value to a ControlStatus.
// Unknown values map to NOT_CHECKED (honest: we did not get a pass/fail).
func normalizeStatus(oscapResult string) ControlStatus {
	switch oscapResult {
	case "pass", "fixed":
		return StatusPass
	case "fail":
		return StatusFail
	case "error":
		return StatusError
	case "notapplicable":
		return StatusNotApplicable
	case "notchecked", "notselected", "informational", "unknown":
		return StatusNotChecked
	default:
		return StatusNotChecked
	}
}

// ControlResult is one CIS control (XCCDF rule) outcome.
type ControlResult struct {
	ControlID string        `json:"controlId"`
	Title     string        `json:"title"`
	Severity  string        `json:"severity,omitempty"`
	Status    ControlStatus `json:"status"`
	// Idref is the raw XCCDF rule id (for traceability / dedupe).
	Idref string `json:"idref,omitempty"`
	// Rationale/remediation are benchmark text, not customer data.
	Remediation string `json:"remediation,omitempty"`
}

// ScanReport is the full outcome of one CIS scan run, normalized for ingest.
type ScanReport struct {
	Profile     string          `json:"profile"`
	Benchmark   string          `json:"benchmark,omitempty"`
	ContentHash string          `json:"contentHash,omitempty"`
	StartedAt   time.Time       `json:"startedAt"`
	FinishedAt  time.Time       `json:"finishedAt"`
	Mode        string          `json:"mode"`
	Results     []ControlResult `json:"results"`
}

// Tally returns the pass/fail/error/na/notchecked counts.
func (r *ScanReport) Tally() (pass, fail, errCount, na, notChecked int) {
	for _, c := range r.Results {
		switch c.Status {
		case StatusPass:
			pass++
		case StatusFail:
			fail++
		case StatusError:
			errCount++
		case StatusNotApplicable:
			na++
		default:
			notChecked++
		}
	}
	return pass, fail, errCount, na, notChecked
}

// cisPayload is the body posted to POST /api/ha-telemetry/cis. It mirrors the SCA
// payload shape (agentId/hostname/results) but carries CIS-specific fields and is a
// DISTINCT endpoint so the backend can route it to the OpenSearch CIS index rather
// than the Postgres SCA store.
type cisPayload struct {
	AgentID     string            `json:"agentId"`
	Hostname    string            `json:"hostname"`
	TenantID    *int64            `json:"tenantId,omitempty"`
	Profile     string            `json:"profile"`
	Benchmark   string            `json:"benchmark,omitempty"`
	ContentHash string            `json:"contentHash,omitempty"`
	Mode        string            `json:"mode"`
	ScannedAt   string            `json:"scannedAt"`
	DurationMs  int64             `json:"durationMs"`
	Summary     cisPayloadSummary `json:"summary"`
	Results     []cisPayloadRow   `json:"results"`
}

type cisPayloadSummary struct {
	Total      int `json:"total"`
	Pass       int `json:"pass"`
	Fail       int `json:"fail"`
	Error      int `json:"error"`
	NA         int `json:"na"`
	NotChecked int `json:"notChecked"`
}

type cisPayloadRow struct {
	ControlID   string `json:"controlId"`
	Title       string `json:"title"`
	Severity    string `json:"severity,omitempty"`
	Status      string `json:"status"`
	Idref       string `json:"idref,omitempty"`
	Remediation string `json:"remediation,omitempty"`
}

// shortControlID trims the XCCDF rule-id prefix (xccdf_org.ssgproject.content_rule_…)
// to a readable control token, keeping the meaningful tail. Platform-neutral.
func shortControlID(idref string) string {
	if i := strings.LastIndex(idref, "_rule_"); i >= 0 {
		return idref[i+len("_rule_"):]
	}
	if i := strings.LastIndex(idref, ":"); i >= 0 && i+1 < len(idref) {
		return idref[i+1:]
	}
	return idref
}
