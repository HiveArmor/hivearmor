package agent

import (
	"os"
	"testing"
	"time"

	"github.com/hivearmor/agent/telemetry"
)

func TestParseAgentPolicyDocument_Empty(t *testing.T) {
	doc, err := ParseAgentPolicyDocument("")
	if err != nil {
		t.Fatalf("empty: %v", err)
	}
	if doc.SchemaVersion != 0 {
		t.Fatalf("expected schema 0, got %d", doc.SchemaVersion)
	}
}

func TestParseAgentPolicyDocument_V1(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"fim": {
			"mode": "replace",
			"rules": [{"path": "/opt/app", "recursive": true}]
		},
		"collectors": {"netflow": false, "fim": true},
		"response": {"allow_shell": true}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.SchemaVersion != 1 {
		t.Fatalf("schema: %d", doc.SchemaVersion)
	}
	if doc.FIM.Mode != FIMModeReplace {
		t.Fatalf("mode: %s", doc.FIM.Mode)
	}
	if len(doc.FIM.Rules) != 1 || doc.FIM.Rules[0].Path != "/opt/app" {
		t.Fatalf("rules: %+v", doc.FIM.Rules)
	}
	if !AllowShellFromPolicy(doc) {
		t.Fatal("expected allow_shell")
	}
	if doc.Collectors["netflow"] {
		t.Fatal("expected netflow false")
	}
}

func TestParseAgentPolicyDocument_UnsupportedVersion(t *testing.T) {
	_, err := ParseAgentPolicyDocument(`{"schema_version": 99}`)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseAgentPolicyDocument_BadFIMMode(t *testing.T) {
	_, err := ParseAgentPolicyDocument(`{"schema_version":1,"fim":{"mode":"append","rules":[{"path":"/x"}]}}`)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestApplyPolicyConfig_ShellAndCollectors(t *testing.T) {
	shellPolicyEnabled.Store(false)
	appliedPolicyMu.Lock()
	appliedPolicy = nil
	appliedPolicyMu.Unlock()

	err := ApplyPolicyConfig(`{
		"schema_version": 1,
		"collectors": {"dns": false},
		"response": {"allow_shell": true}
	}`)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !PolicyAllowsShell() {
		t.Fatal("shell should be enabled")
	}
	if CollectorDesiredEnabled("dns") {
		t.Fatal("dns should be disabled")
	}
	if !CollectorDesiredEnabled("fim") {
		t.Fatal("fim missing key should default true")
	}
}

func TestShellExecutionAllowed_Paths(t *testing.T) {
	shellPolicyEnabled.Store(false)
	t.Setenv(EnvAllowRemoteShell, "")
	if ShellExecutionAllowed(false) {
		t.Fatal("default deny")
	}
	if !ShellExecutionAllowed(true) {
		t.Fatal("config allow")
	}
	t.Setenv(EnvAllowRemoteShell, "true")
	if !ShellExecutionAllowed(false) {
		t.Fatal("env allow")
	}
	t.Setenv(EnvAllowRemoteShell, "")
	shellPolicyEnabled.Store(true)
	if !ShellExecutionAllowed(false) {
		t.Fatal("policy allow")
	}
	_ = os.Unsetenv(EnvAllowRemoteShell)
}

func TestShellDeniedMessage_NoSecrets(t *testing.T) {
	if ShellDeniedMessage == "" {
		t.Fatal("empty message")
	}
	for _, bad := range []string{"Bearer", "password", "REPLACE_KEY", "token="} {
		if containsFold(ShellDeniedMessage, bad) {
			t.Fatalf("message must not contain %q", bad)
		}
	}
}

func TestParseAgentPolicyDocument_TelemetryIntervals(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"telemetry": {
			"sca_interval_hours": 3,
			"sbom_interval_hours": 12
		}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Telemetry == nil || doc.Telemetry.SCAIntervalHours == nil || *doc.Telemetry.SCAIntervalHours != 3 {
		t.Fatalf("sca hours: %+v", doc.Telemetry)
	}
	if doc.Telemetry.SBOMIntervalHours == nil || *doc.Telemetry.SBOMIntervalHours != 12 {
		t.Fatalf("sbom hours: %+v", doc.Telemetry)
	}
}

func TestClampTelemetryIntervalHours(t *testing.T) {
	if got := ClampTelemetryIntervalHours(nil); got != DefaultTelemetryIntervalHours {
		t.Fatalf("nil: %d", got)
	}
	zero := 0
	if got := ClampTelemetryIntervalHours(&zero); got != DefaultTelemetryIntervalHours {
		t.Fatalf("zero: %d", got)
	}
	low := MinTelemetryIntervalHours - 1
	if low < 1 {
		low = 0
	}
	// 0 already tested; value 1 should stay 1
	one := 1
	if got := ClampTelemetryIntervalHours(&one); got != 1 {
		t.Fatalf("one: %d", got)
	}
	high := MaxTelemetryIntervalHours + 50
	if got := ClampTelemetryIntervalHours(&high); got != MaxTelemetryIntervalHours {
		t.Fatalf("high: %d", got)
	}
}

func TestApplyPolicyConfig_TelemetryIntervals(t *testing.T) {
	shellPolicyEnabled.Store(false)
	appliedPolicyMu.Lock()
	appliedPolicy = nil
	appliedPolicyMu.Unlock()

	err := ApplyPolicyConfig(`{
		"schema_version": 1,
		"telemetry": {"sca_interval_hours": 2, "sbom_interval_hours": 4}
	}`)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if telemetry.EffectiveSCAInterval() != 2*time.Hour {
		t.Fatalf("sca: %v", telemetry.EffectiveSCAInterval())
	}
	if telemetry.EffectiveSBOMInterval() != 4*time.Hour {
		t.Fatalf("sbom: %v", telemetry.EffectiveSBOMInterval())
	}
	// restore defaults
	telemetry.SetScanIntervals(6*time.Hour, 6*time.Hour)
}

func TestParseAgentPolicyDocument_NegativeTelemetryRejected(t *testing.T) {
	_, err := ParseAgentPolicyDocument(`{"schema_version":1,"telemetry":{"sca_interval_hours":-1}}`)
	if err == nil {
		t.Fatal("expected error for negative hours")
	}
}


func containsFold(s, sub string) bool {
	return len(sub) > 0 && (len(s) >= len(sub)) &&
		(indexFold(s, sub) >= 0)
}

func indexFold(s, sub string) int {
	// small helper without importing strings for case-fold search of ASCII tokens
	sl, subl := len(s), len(sub)
	for i := 0; i+subl <= sl; i++ {
		ok := true
		for j := 0; j < subl; j++ {
			a, b := s[i+j], sub[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				ok = false
				break
			}
		}
		if ok {
			return i
		}
	}
	return -1
}
