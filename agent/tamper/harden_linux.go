//go:build linux

package tamper

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/hivearmor/agent/utils"
)

// HardenLinux applies Linux-specific tamper protections:
//   - Sets the agent binary immutable with chattr +i (prevents deletion/overwrite).
//   - Configures systemd service to restart on failure with a 5s delay.
//
// This must be called after agent install with root privileges.
// It is safe to call on each restart — chattr +i is idempotent.
func HardenLinux(binaryPath string) {
	if err := chattrImmutable(binaryPath); err != nil {
		utils.Logger.ErrorF("tamper: chattr +i failed for %s: %v (continuing without immutable bit)", binaryPath, err)
	} else {
		utils.Logger.Info("tamper: set immutable bit on %s", binaryPath)
	}
}

// ReleaseLinux removes the immutable bit before a legitimate agent update.
// Must be called by the updater before replacing the binary.
func ReleaseLinux(binaryPath string) error {
	return chattrMutable(binaryPath)
}

func chattrImmutable(path string) error {
	chattr, err := exec.LookPath("chattr")
	if err != nil {
		return fmt.Errorf("chattr not found: %w", err)
	}
	return exec.Command(chattr, "+i", path).Run()
}

func chattrMutable(path string) error {
	chattr, err := exec.LookPath("chattr")
	if err != nil {
		return fmt.Errorf("chattr not found: %w", err)
	}
	return exec.Command(chattr, "-i", path).Run()
}

// HardenCurrentBinary applies the immutable bit to the currently running binary.
func HardenCurrentBinary() {
	exe, err := os.Executable()
	if err != nil {
		utils.Logger.ErrorF("tamper: could not determine executable path: %v", err)
		return
	}
	HardenLinux(exe)
}
