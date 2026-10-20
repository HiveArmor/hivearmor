package agent

import (
	"strings"
	"testing"
	"time"
)

// --- scans section parse / normalize --------------------------------------

func TestParseScansSection_FullShape(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"scans": {
			"cis":  {"enabled": true, "profile": "CIS_Ubuntu_22.04_L1", "mode": "scheduled", "cronOrInterval": "24h", "source": "agent"},
			"vuln": {"enabled": true, "mode": "realtime", "cronOrInterval": "30m", "source": "agent"}
		}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Scans == nil || doc.Scans.CIS == nil || doc.Scans.Vuln == nil {
		t.Fatalf("scans not parsed: %+v", doc.Scans)
	}
	if doc.Scans.CIS.Profile != "CIS_Ubuntu_22.04_L1" {
		t.Fatalf("cis profile: %q", doc.Scans.CIS.Profile)
	}
	if !doc.Scans.CIS.RunByAgent() {
		t.Fatal("cis should run by agent")
	}
	if doc.Scans.CIS.IsRealtime() {
		t.Fatal("cis mode scheduled, not realtime")
	}
	if got := doc.Scans.CIS.EffectiveInterval(); got != 24*time.Hour {
		t.Fatalf("cis interval: %s", got)
	}
	if !doc.Scans.Vuln.IsRealtime() {
		t.Fatal("vuln should be realtime")
	}
}

func TestScans_SourceDefaultsToAgent(t *testing.T) {
	raw := `{"scans": {"cis": {"enabled": true, "profile": "p"}}}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Scans.CIS.Source != ScanSourceAgent {
		t.Fatalf("source default: %q", doc.Scans.CIS.Source)
	}
	if !doc.Scans.CIS.RunByAgent() {
		t.Fatal("agent-sourced enabled scan should run")
	}
}

func TestScans_IngestSourceNotRunByAgent(t *testing.T) {
	raw := `{"scans": {"cis": {"enabled": true, "profile": "p", "source": "ingest"}}}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Scans.CIS.RunByAgent() {
		t.Fatal("ingest-sourced scan must NOT run by the agent (reserved lane)")
	}
}

func TestScans_DisabledNotRun(t *testing.T) {
	raw := `{"scans": {"cis": {"enabled": false, "profile": "p", "source": "agent"}}}`
	doc, _ := ParseAgentPolicyDocument(raw)
	if doc.Scans.CIS.RunByAgent() {
		t.Fatal("disabled scan must not run")
	}
}

func TestScans_IntervalClamped(t *testing.T) {
	cases := []struct {
		in   string
		want time.Duration
	}{
		{"1m", MinScanInterval},     // below floor → clamped up
		{"500h", MaxScanInterval},   // above ceiling → clamped down
		{"6h", 6 * time.Hour},       // in range → unchanged
		{"", DefaultScanInterval},   // empty → default
		{"0 2 * * *", DefaultScanInterval}, // cron expr (not a duration) → default
	}
	for _, c := range cases {
		s := &ScanSpec{CronOrInterval: c.in}
		if got := s.EffectiveInterval(); got != c.want {
			t.Fatalf("interval %q => %s, want %s", c.in, got, c.want)
		}
	}
}

func TestScans_CronPendingDetection(t *testing.T) {
	if (&ScanSpec{CronOrInterval: "24h"}).CronOrIntervalIsDuration() != true {
		t.Fatal("24h is a duration")
	}
	if (&ScanSpec{CronOrInterval: "0 2 * * *"}).CronOrIntervalIsDuration() != false {
		t.Fatal("cron expr is not a duration")
	}
	if (&ScanSpec{CronOrInterval: ""}).CronOrIntervalIsDuration() != false {
		t.Fatal("empty is not a duration")
	}
}

func TestScans_UnknownFieldsIgnored(t *testing.T) {
	// A newer-shape document with extra keys must not crash apply.
	raw := `{"scans": {"cis": {"enabled": true, "profile": "p", "futureField": 42, "nested": {"x": 1}}, "unknownScan": {"enabled": true}}}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("unknown fields must be ignored, got error: %v", err)
	}
	if doc.Scans == nil || doc.Scans.CIS == nil || !doc.Scans.CIS.Enabled {
		t.Fatalf("known fields must survive: %+v", doc.Scans)
	}
}

func TestScans_NilSafe(t *testing.T) {
	var s *ScanSpec
	if s.RunByAgent() || s.IsRealtime() {
		t.Fatal("nil ScanSpec must be safe and falsey")
	}
	if s.EffectiveInterval() != DefaultScanInterval {
		t.Fatal("nil ScanSpec interval must default")
	}
	normalizeScansSection(nil) // must not panic
}

// --- capability advertisement ---------------------------------------------

func TestSectionCapabilities_IncludesScans(t *testing.T) {
	// Default (no engine prober registered) → CIS parsed-only, vuln enforced.
	SetCISCapabilityProber(nil)
	caps := SectionCapabilities()
	if caps["scans.vuln"] != EnforcementFull {
		t.Fatalf("scans.vuln should be enforced, got %q", caps["scans.vuln"])
	}
	if caps["scans.cis"] != EnforcementParsedOnly {
		t.Fatalf("scans.cis default should be parsed-only, got %q", caps["scans.cis"])
	}

	// With an engine that reports enforced.
	SetCISCapabilityProber(func() EnforcementStatus { return EnforcementFull })
	defer SetCISCapabilityProber(nil)
	caps = SectionCapabilities()
	if caps["scans.cis"] != EnforcementFull {
		t.Fatalf("scans.cis with engine should be enforced, got %q", caps["scans.cis"])
	}

	// The advertisement string must carry the scans keys deterministically.
	adv := CapabilityAdvertisement()
	if !strings.Contains(adv, "scans.cis=") || !strings.Contains(adv, "scans.vuln=enforced") {
		t.Fatalf("advertisement missing scans caps: %q", adv)
	}
}

func TestSectionCapabilities_RealtimeVulnIsPartial(t *testing.T) {
	SetCISCapabilityProber(nil)
	// Apply a policy requesting REALTIME vuln — no change-trigger hook exists, so the
	// honest capability is partial, not enforced.
	doc, err := ParseAgentPolicyDocument(
		`{"scans": {"vuln": {"enabled": true, "mode": "realtime", "source": "agent"}}}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply: %v", err)
	}
	defer func() {
		// Reset applied policy so later tests see the default enforced state.
		_ = applyParsedPolicy(&AgentPolicyDocument{})
	}()
	if got := SectionCapabilities()["scans.vuln"]; got != EnforcementPartial {
		t.Fatalf("realtime vuln should be partial, got %q", got)
	}

	// A scheduled vuln policy is fully enforced.
	sched, _ := ParseAgentPolicyDocument(
		`{"scans": {"vuln": {"enabled": true, "mode": "scheduled", "cronOrInterval": "12h", "source": "agent"}}}`)
	if err := applyParsedPolicy(sched); err != nil {
		t.Fatalf("apply scheduled: %v", err)
	}
	if got := SectionCapabilities()["scans.vuln"]; got != EnforcementFull {
		t.Fatalf("scheduled vuln should be enforced, got %q", got)
	}
}

// --- apply wiring ----------------------------------------------------------

func TestApplyScans_RegistersPendingWhenNoApplier(t *testing.T) {
	SetScansPolicyApplier(nil)
	doc, err := ParseAgentPolicyDocument(`{"scans": {"cis": {"enabled": true, "profile": "p", "source": "agent"}}}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply: %v", err)
	}
	pending, ok := PeekPendingScansPolicy()
	if !ok || pending == nil || pending.CIS == nil || pending.CIS.Profile != "p" {
		t.Fatalf("expected stashed scans policy, got ok=%v pending=%+v", ok, pending)
	}
}

func TestApplyScans_CallsApplierWhenRegistered(t *testing.T) {
	var gotEnabled bool
	var gotProfile string
	SetScansPolicyApplier(func(scans *ScansPolicySection) error {
		if scans != nil && scans.CIS != nil {
			gotEnabled = scans.CIS.RunByAgent()
			gotProfile = scans.CIS.Profile
		}
		return nil
	})
	defer SetScansPolicyApplier(nil)

	doc, _ := ParseAgentPolicyDocument(`{"scans": {"cis": {"enabled": true, "profile": "CIS_Win", "source": "agent"}}}`)
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !gotEnabled || gotProfile != "CIS_Win" {
		t.Fatalf("applier not invoked correctly: enabled=%v profile=%q", gotEnabled, gotProfile)
	}
}
