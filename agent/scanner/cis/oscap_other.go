//go:build !linux

package cis

import (
	"fmt"
	"os/exec"
)

// On non-Linux hosts this build ships no OpenSCAP runner. The engine reports CIS as
// parsed-only (it records the desired cadence but cannot run a scan), honestly — it
// never invents a result. Windows/macOS CIS is a later platform lane.

func engineAvailable() bool { return false }

func runOscap(profile, mode string) (*ScanReport, error) {
	return nil, fmt.Errorf("cis: native OpenSCAP engine is not available on this platform")
}

func applyResourceBounds(cmd *exec.Cmd) { /* no-op on non-Linux */ }
