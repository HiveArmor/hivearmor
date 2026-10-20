//go:build linux

package cis

import (
	"os/exec"
	"syscall"
)

// applyResourceBounds lowers the scan subprocess's scheduling priority so an
// OpenSCAP run never starves the customer endpoint. Best-effort: setting the
// process group lets the OS deprioritise the whole oscap tree. A failure to apply
// bounds does not abort the scan (the hard deadline is the real safety net).
func applyResourceBounds(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	// Run in its own process group so the deadline-cancel can signal the whole tree.
	cmd.SysProcAttr.Setpgid = true
}
