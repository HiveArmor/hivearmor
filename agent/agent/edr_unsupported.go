//go:build !linux && !windows

package agent

import (
	"fmt"
	"runtime"

	"github.com/hivearmor/agent/config"
)

func startEdrCollectorOS(cnf *config.Config) {
	// No-op on unsupported platforms.
}

func applyNetworkIsolation(isoType string, allowedIPs []string) error {
	return fmt.Errorf("network isolation not supported on %s", runtime.GOOS)
}

func liftNetworkIsolation() error {
	return fmt.Errorf("network isolation not supported on %s", runtime.GOOS)
}
