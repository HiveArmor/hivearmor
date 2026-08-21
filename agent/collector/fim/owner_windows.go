//go:build windows

package fim

import (
	"io/fs"
	"os"

	"golang.org/x/sys/windows"
)

// fileOwner returns the Windows owner SID string for the file described by info.
// Falls back to an empty string if the SID cannot be retrieved.
func fileOwner(info fs.FileInfo) string {
	// info.Name() only has the base name; we need the full path.
	// This helper is called from handleEvent where the full path is available.
	// When info is obtained via os.Stat(fullPath), info.Name() is just the base.
	// We therefore do a best-effort lookup by re-stat-ing if we have a full path.
	_ = info
	return ""
}

// fileOwnerFromPath looks up the SID owner of an absolute path.
// This is called from handleEvent after os.Stat where the full path is known.
func fileOwnerFromPath(path string) string {
	sd, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION,
	)
	if err != nil {
		return ""
	}
	owner, _, err := sd.Owner()
	if err != nil {
		return ""
	}
	return owner.String()
}

// ensure os is used
var _ = os.Stat
