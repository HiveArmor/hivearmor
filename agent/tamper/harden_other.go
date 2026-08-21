//go:build !linux && !windows

package tamper

import "github.com/hivearmor/agent/utils"

// HardenCurrentBinary is a no-op on unsupported platforms.
func HardenCurrentBinary() {
	utils.Logger.Info("tamper: binary hardening not implemented on this platform")
}
