package agent

import (
	"github.com/hivearmor/agent/config"
)

// StartEdrCollector starts EDR collectors. The OS-specific implementations
// are in edr_linux.go, edr_windows.go, and edr_unsupported.go.
// This function blocks so the caller's goroutine stays alive.
func StartEdrCollector(cnf *config.Config) {
	startEdrCollectorOS(cnf)
	select {} // keep goroutine alive
}
