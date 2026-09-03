package agent

import (
	"strings"
	"testing"
)

func TestCommandProcessorShellGate_DenyByDefault(t *testing.T) {
	shellPolicyEnabled.Store(false)
	t.Setenv(EnvAllowRemoteShell, "")

	if ShellExecutionAllowed(false) {
		t.Fatal("expected deny")
	}
	msg := ShellDeniedMessage
	if !strings.Contains(msg, "REMOTE_SHELL denied") {
		t.Fatalf("unexpected message: %s", msg)
	}
	if !strings.Contains(msg, "EDR_*") {
		t.Fatal("message should steer operators to EDR_*")
	}
}

func TestCommandProcessorShellGate_AllowConfig(t *testing.T) {
	shellPolicyEnabled.Store(false)
	t.Setenv(EnvAllowRemoteShell, "")
	if !ShellExecutionAllowed(true) {
		t.Fatal("config should allow")
	}
}
