package agent

import (
	"context"

	"github.com/hivearmor/agent/config"
)

// StartEdrCollector starts EDR collectors using a background context.
// The OS-specific implementations are in edr_linux.go, edr_windows.go,
// and edr_unsupported.go.
func StartEdrCollector(cnf *config.Config) {
	startEdrCollectorOS(cnf)
	select {} // keep goroutine alive until process exits
}

// StartEdrCollectorWithContext starts EDR collectors with a cancellable context.
// Both process-polling and file-watch goroutines stop cleanly when ctx is cancelled.
// This is called from serv/service.go for proper graceful shutdown.
func StartEdrCollectorWithContext(cnf *config.Config, ctx context.Context) {
	startEdrCollectorWithContextOS(cnf, ctx)
}
