//go:build linux

package serv

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// EnsureLinuxTelemetryEnvironment writes the systemd drop-in and a secret-free
// env template when the env file does not already exist. Existing env files are
// left unchanged so operator secrets are not overwritten.
func EnsureLinuxTelemetryEnvironment() error {
	return writeLinuxTelemetryFiles(defaultLinuxTelemetryPaths(), daemonReloadHiveArmorAgent)
}

func writeLinuxTelemetryFiles(p linuxTelemetryPaths, reload func() error) error {
	if err := os.MkdirAll(p.DropInDir, 0o755); err != nil {
		return fmt.Errorf("create telemetry drop-in directory: %w", err)
	}
	dropInPath := filepath.Join(p.DropInDir, p.DropInFile)
	if err := os.WriteFile(dropInPath, []byte(telemetryDropInContents()), 0o644); err != nil {
		return fmt.Errorf("write telemetry drop-in: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(p.EnvFile), 0o750); err != nil {
		return fmt.Errorf("create telemetry env directory: %w", err)
	}
	if _, err := os.Stat(p.EnvFile); os.IsNotExist(err) {
		if err := os.WriteFile(p.EnvFile, []byte(telemetryEnvTemplate()), 0o600); err != nil {
			return fmt.Errorf("write telemetry env template: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("stat telemetry env: %w", err)
	}

	if reload != nil {
		if err := reload(); err != nil {
			return err
		}
	}
	return nil
}

func daemonReloadHiveArmorAgent() error {
	systemctl, err := exec.LookPath("systemctl")
	if err != nil {
		return nil
	}
	if err := exec.Command(systemctl, "daemon-reload").Run(); err != nil {
		return fmt.Errorf("systemctl daemon-reload: %w", err)
	}
	return nil
}
