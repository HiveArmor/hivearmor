//go:build linux || darwin

package fim

import (
	"fmt"
	"io/fs"
	"syscall"
)

// fileOwner returns "uid:gid" for the file described by info.
// On POSIX platforms, this is extracted from the underlying syscall.Stat_t.
func fileOwner(info fs.FileInfo) string {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return fmt.Sprintf("%d:%d", stat.Uid, stat.Gid)
	}
	return ""
}
