package agent

import (
	"os"
	"testing"
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
