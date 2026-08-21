//go:build linux

package serv

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteLinuxTelemetryFilesCreatesDropInAndLeavesExistingEnv(t *testing.T) {
	root := t.TempDir()
	envPath := filepath.Join(root, "agent.env")
	dropDir := filepath.Join(root, "HiveArmorAgent.service.d")
	if err := os.WriteFile(envPath, []byte("HA_TENANT_ID=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	reloads := 0
	err := writeLinuxTelemetryFiles(linuxTelemetryPaths{
		EnvFile:    envPath,
		DropInDir:  dropDir,
		DropInFile: "10-telemetry.conf",
	}, func() error {
		reloads++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloads != 1 {
		t.Fatalf("reload called %d times", reloads)
	}
	got, err := os.ReadFile(filepath.Join(dropDir, "10-telemetry.conf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != telemetryDropInContents() {
		t.Fatalf("unexpected drop-in: %s", got)
	}
	kept, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(kept) != "HA_TENANT_ID=1\n" {
		t.Fatalf("existing env was overwritten: %s", kept)
	}
}

func TestWriteLinuxTelemetryFilesWritesTemplateWhenMissing(t *testing.T) {
	root := t.TempDir()
	envPath := filepath.Join(root, "etc", "hivearmor", "agent.env")
	dropDir := filepath.Join(root, "dropin")
	if err := writeLinuxTelemetryFiles(linuxTelemetryPaths{
		EnvFile:    envPath,
		DropInDir:  dropDir,
		DropInFile: "10-telemetry.conf",
	}, nil); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("env mode %v want 0600", info.Mode().Perm())
	}
	body, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != telemetryEnvTemplate() {
		t.Fatalf("unexpected template: %s", body)
	}
}
