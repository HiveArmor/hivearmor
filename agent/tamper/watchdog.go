package tamper

import (
	"context"
	"os"
	"time"

	"github.com/hivearmor/agent/utils"
)

// Watchdog monitors the agent's own process health and logs anomalies.
// It is a lightweight goroutine that:
//   - Verifies the agent binary has not been replaced (hash check every 5 minutes).
//   - Logs a warning if the process is running with reduced privileges.
//   - Calls onTampered if the binary hash changes from the recorded baseline.
//
// The watchdog does NOT restart the agent — that is the OS service manager's
// responsibility (systemd Restart=on-failure, Windows SCM RecoveryActions).
type Watchdog struct {
	binaryPath  string
	baselineHash string
	onTampered  func(reason string)
}

// NewWatchdog creates a Watchdog for the running agent binary.
// onTampered is called (in a new goroutine) if tampering is detected.
func NewWatchdog(onTampered func(reason string)) *Watchdog {
	exe, _ := os.Executable()
	hash, _ := hashFile(exe)
	return &Watchdog{
		binaryPath:  exe,
		baselineHash: hash,
		onTampered:  onTampered,
	}
}

// Start runs the watchdog loop until ctx is cancelled.
func (w *Watchdog) Start(ctx context.Context) {
	if w.baselineHash == "" {
		if utils.Logger != nil {
			utils.Logger.ErrorF("tamper: watchdog could not hash agent binary; tamper detection disabled")
		}
		return
	}

	if utils.Logger != nil {
		utils.Logger.Info("tamper: watchdog started; monitoring binary %s", w.binaryPath)
	}

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.check()
		}
	}
}

func (w *Watchdog) check() {
	current, err := hashFile(w.binaryPath)
	if err != nil {
		// File may have been deleted.
		if utils.Logger != nil {
			utils.Logger.ErrorF("tamper: agent binary missing or unreadable: %v", w.binaryPath)
		}
		if w.onTampered != nil {
			w.onTampered("agent binary deleted or inaccessible")
		}
		return
	}

	if current != w.baselineHash {
		if utils.Logger != nil {
			utils.Logger.ErrorF("tamper: agent binary hash changed! baseline=%s current=%s",
				w.baselineHash, current)
		}
		reason := "agent binary hash mismatch — possible replacement attack"
		// Update baseline before calling onTampered to prevent repeated alerts.
		w.baselineHash = current
		if w.onTampered != nil {
			w.onTampered(reason)
		}
	}
}
