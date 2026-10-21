//go:build linux

package cis

import (
	"context"
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/hivearmor/agent/utils"
)

// oscapBinary is the OpenSCAP CLI the engine shells out to. Resolved from PATH.
const oscapBinary = "oscap"

// maxScanDuration bounds a single scan so a pathological content file cannot pin the
// endpoint indefinitely. The context is cancelled at this deadline.
const maxScanDuration = 10 * time.Minute

// engineAvailable reports whether this host can actually run an OpenSCAP scan:
// the oscap binary must be on PATH. Content presence is checked per-profile at scan
// time. Used by the capability prober so the agent advertises CIS honestly.
func engineAvailable() bool {
	_, err := exec.LookPath(oscapBinary)
	return err == nil
}

// runOscap evaluates a profile against its out-of-band SCAP content and returns the
// normalized report. It is resource-bounded (single invocation, hard deadline) and
// writes its XCCDF results to a temp file it cleans up. Content and control ids are
// safe to log; no raw customer data is logged.
func runOscap(profile, mode string) (*ScanReport, error) {
	contentPath := contentFileFor(profile)
	if contentPath == "" {
		return nil, errNoContent(profile)
	}

	resultsFile, err := os.CreateTemp("", "ha-cis-results-*.xml")
	if err != nil {
		return nil, fmt.Errorf("cis: creating results temp file: %w", err)
	}
	resultsPath := resultsFile.Name()
	_ = resultsFile.Close()
	defer func() { _ = os.Remove(resultsPath) }()

	ctx, cancel := context.WithTimeout(context.Background(), maxScanDuration)
	defer cancel()

	started := time.Now()
	// oscap xccdf eval --profile <profile> --results <file> <content>
	// --results emits XCCDF TestResult; we parse rule-result entries from it.
	args := []string{
		"xccdf", "eval",
		"--profile", profile,
		"--results", resultsPath,
		contentPath,
	}
	cmd := exec.CommandContext(ctx, oscapBinary, args...) //nolint:gosec // fixed binary, sanitized args
	// Lower scheduling priority best-effort so a scan never starves the endpoint.
	applyResourceBounds(cmd)

	// oscap xccdf eval exit codes: 0 = all rules passed, 1 = tool/processing error
	// (FATAL), 2 = at least one rule failed/unknown — a NORMAL scan outcome. So treat
	// 0 and 2 as success and parse the results file; anything else (incl. 1) is fatal.
	out, runErr := cmd.CombinedOutput()
	finished := time.Now()
	if ctx.Err() == context.DeadlineExceeded {
		return nil, fmt.Errorf("cis: scan for profile %q exceeded %s deadline", profile, maxScanDuration)
	}
	if exitErr, ok := runErr.(*exec.ExitError); ok {
		if code := exitErr.ExitCode(); code != 0 && code != 2 {
			// 2 == "at least one rule failed", a normal result; anything else is fatal.
			utils.Logger.ErrorF("cis: oscap exited with code %d for profile %q", code, profile)
			return nil, fmt.Errorf("cis: oscap failed (exit %d) for profile %q", code, profile)
		}
	} else if runErr != nil {
		utils.Logger.ErrorF("cis: oscap invocation failed for profile %q: %v", profile, runErr)
		return nil, fmt.Errorf("cis: oscap invocation failed: %w", runErr)
	}
	_ = out // combined output intentionally not logged (may be verbose); results parsed from file

	report, parseErr := parseXccdfResults(resultsPath)
	if parseErr != nil {
		return nil, parseErr
	}
	report.Profile = profile
	report.Mode = mode
	report.StartedAt = started
	report.FinishedAt = finished
	report.ContentHash = contentHash(contentPath)
	if report.Benchmark == "" {
		report.Benchmark = strings.TrimSuffix(filepath.Base(contentPath), ".xml")
	}
	utils.Logger.LogF(100, "cis: scan complete profile=%s controls=%d duration=%s",
		profile, len(report.Results), finished.Sub(started))
	return report, nil
}

// --- minimal XCCDF result parsing (namespace-agnostic via local names) ---------

type xccdfTestResult struct {
	XMLName     xml.Name            `xml:"TestResult"`
	RuleResults []xccdfRuleResult   `xml:"rule-result"`
}

type xccdfRuleResult struct {
	Idref  string `xml:"idref,attr"`
	Result string `xml:"result"`
	// Severity on the rule-result when present (XCCDF 1.2).
	Severity string `xml:"severity,attr"`
}

// parseXccdfResults extracts rule-results from an oscap --results XCCDF file. The file
// is a datastream/ARF or bare XCCDF; we scan for any TestResult element by local name
// so we are resilient to the exact wrapper oscap emits.
func parseXccdfResults(path string) (*ScanReport, error) {
	raw, err := os.ReadFile(path) //nolint:gosec // engine-created temp file
	if err != nil {
		return nil, fmt.Errorf("cis: reading oscap results: %w", err)
	}

	report := &ScanReport{Results: []ControlResult{}}

	dec := xml.NewDecoder(strings.NewReader(string(raw)))
	for {
		tok, tokErr := dec.Token()
		if tokErr != nil {
			break // EOF or malformed tail — keep what we parsed
		}
		se, ok := tok.(xml.StartElement)
		if !ok || se.Name.Local != "TestResult" {
			continue
		}
		var tr xccdfTestResult
		if err := dec.DecodeElement(&tr, &se); err != nil {
			utils.Logger.ErrorF("cis: decoding TestResult: %v", err)
			continue
		}
		for _, rr := range tr.RuleResults {
			idref := strings.TrimSpace(rr.Idref)
			if idref == "" {
				continue
			}
			report.Results = append(report.Results, ControlResult{
				ControlID: shortControlID(idref),
				Idref:     idref,
				Title:     shortControlID(idref),
				Severity:  strings.TrimSpace(rr.Severity),
				Status:    normalizeStatus(strings.TrimSpace(rr.Result)),
			})
		}
	}

	if len(report.Results) == 0 {
		return nil, fmt.Errorf("cis: no rule-results parsed from oscap output")
	}
	return report, nil
}
