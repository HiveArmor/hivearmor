//go:build !linux && !windows

package agent

import (
	"context"
	"fmt"
	"runtime"

	"github.com/hivearmor/agent/config"
)

func startEdrCollectorOS(cnf *config.Config) {
	// No-op on unsupported platforms.
}

func startEdrCollectorWithContextOS(cnf *config.Config, ctx context.Context) {
	// No-op on unsupported platforms (macOS EDR uses ESF in serv/service.go).
	_ = ctx
}

func applyNetworkIsolation(isoType string, allowedIPs []string) error {
	return fmt.Errorf("network isolation not supported on %s", runtime.GOOS)
}

func liftNetworkIsolation() error {
	return fmt.Errorf("network isolation not supported on %s", runtime.GOOS)
}
