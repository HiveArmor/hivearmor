package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/hivearmor/agent/utils"
)

func TestCredentialEnvelopeRoundTripAndTamperRejection(t *testing.T) {
	installationID := "069ea0b4-249d-49c5-bbda-7278e80769e0"
	credential := "ha_agent_test-credential"
	envelope, err := encryptAgentCredential(credential, "test-build-wrapping-key", installationID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(envelope, credentialEnvelopePrefix) || strings.Contains(envelope, credential) {
		t.Fatalf("credential envelope is not versioned or exposed plaintext: %q", envelope)
	}
	got, err := decryptAgentCredential(envelope, "test-build-wrapping-key", installationID)
	if err != nil || got != credential {
		t.Fatalf("round trip failed: got %q, err %v", got, err)
	}
	tampered := envelope[:len(envelope)-1] + "A"
	if _, err := decryptAgentCredential(tampered, "test-build-wrapping-key", installationID); err == nil {
		t.Fatal("tampered credential envelope was accepted")
	}
}

func TestCredentialEnvelopeReadsLegacyAndUpgradesOnWrite(t *testing.T) {
	installationID := "d54e9631-09db-4f47-abcd-163899daf8cd"
	legacy, err := utils.EncryptAES("legacy-device-key", "legacy-build-key", installationID)
	if err != nil {
		t.Fatal(err)
	}
	got, err := decryptAgentCredential(legacy, "legacy-build-key", installationID)
	if err != nil || got != "legacy-device-key" {
		t.Fatalf("legacy credential was not readable: got %q, err %v", got, err)
	}
	upgraded, err := encryptAgentCredential(got, "legacy-build-key", installationID)
	if err != nil || !strings.HasPrefix(upgraded, credentialEnvelopePrefix) {
		t.Fatalf("credential was not upgraded: %q, err %v", upgraded, err)
	}
}

func TestWriteProtectedYAMLUsesOwnerOnlyPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yml")
	if err := writeProtectedYAML(path, Config{Server: "siem.example", AgentID: 7, AgentKey: "sealed"}); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if got := info.Mode().Perm(); got != 0o600 {
			t.Fatalf("protected config permissions = %o, want 600", got)
		}
	}
}
