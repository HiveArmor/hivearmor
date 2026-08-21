package cmd

import (
	"errors"
	"strings"
	"testing"

	"github.com/hivearmor/agent/config"
)

func TestReadDeviceCredentialFromStdin(t *testing.T) {
	got, err := readDeviceCredential("-", strings.NewReader("ha_agent_rotated-secret\n"))
	if err != nil || got != "ha_agent_rotated-secret" {
		t.Fatalf("got %q, err %v", got, err)
	}
	if _, err := readDeviceCredential("-", strings.NewReader("legacy-secret")); err == nil {
		t.Fatal("accepted an unsupported credential format")
	}
}

func TestApplyRotatedCredentialValidatesBeforeAtomicSaveAndRestart(t *testing.T) {
	current := &config.Config{Server: "siem.example", AgentID: 42, AgentKey: "old"}
	var calls []string
	var saved config.Config
	ops := credentialRotationOps{
		validate: func(got *config.Config, key string) error {
			calls = append(calls, "validate")
			if got.AgentKey != "old" || key != "ha_agent_new" {
				t.Fatal("unexpected validation input")
			}
			return nil
		},
		isActive: func(string) (bool, error) { calls = append(calls, "state"); return true, nil },
		save:     func(got *config.Config) error { calls = append(calls, "save"); saved = *got; return nil },
		restart:  func(string) error { calls = append(calls, "restart"); return nil },
	}
	if err := applyRotatedCredential(current, "ha_agent_new", ops); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, ",") != "validate,state,save,restart" {
		t.Fatalf("unexpected operation order: %v", calls)
	}
	if current.AgentKey != "old" || saved.AgentKey != "ha_agent_new" {
		t.Fatal("rotation mutated live configuration or failed to save new credential")
	}
}

func TestApplyRotatedCredentialDoesNotWriteInvalidCredential(t *testing.T) {
	saved := false
	ops := credentialRotationOps{
		validate: func(*config.Config, string) error { return errors.New("denied") },
		isActive: func(string) (bool, error) { return true, nil },
		save:     func(*config.Config) error { saved = true; return nil },
		restart:  func(string) error { return nil },
	}
	if err := applyRotatedCredential(&config.Config{AgentID: 1}, "ha_agent_bad", ops); err == nil || saved {
		t.Fatal("invalid credential was persisted")
	}
}
