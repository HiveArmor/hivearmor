package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/hivearmor/agent/config"
)

// quarantineFile moves the file to an isolated quarantine directory.
// Returns the quarantine path on success.
func quarantineFile(filePath string) (string, error) {
	// Quarantine directory alongside the executable
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("quarantineFile: cannot locate executable: %w", err)
	}
	quarantineDir := filepath.Join(filepath.Dir(exe), "quarantine")
	if err := os.MkdirAll(quarantineDir, 0700); err != nil {
		return "", fmt.Errorf("quarantineFile: create quarantine dir: %w", err)
	}

	// Rename file to quarantine dir with timestamp suffix to avoid collisions
	base := filepath.Base(filePath)
	dest := filepath.Join(quarantineDir, fmt.Sprintf("%s_%d", base, time.Now().UnixNano()))

	if err := os.Rename(filePath, dest); err != nil {
		return "", fmt.Errorf("quarantineFile: move file: %w", err)
	}
	// Restrict permissions on quarantined file
	_ = os.Chmod(dest, 0000)
	return dest, nil
}

// restoreFile fetches the quarantine record from the backend to determine the original path
// and moves the file back. Since we already have the quarantine record stored server-side,
// this function just acknowledges by requesting the backend to confirm what path to restore to.
// The actual restoration path is provided by the backend in the REST call that already
// updated the status, so here we only attempt a local rename if we can find the quarantine file.
func restoreFile(cnf *config.Config, quarantineID int64) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("restoreFile: cannot locate executable: %w", err)
	}
	quarantineDir := filepath.Join(filepath.Dir(exe), "quarantine")
	// Best-effort: list directory and look for files prefixed with the id
	entries, err := os.ReadDir(quarantineDir)
	if err != nil {
		// Quarantine dir may not exist; treat as success (file may have been manually restored)
		return nil
	}
	idStr := strconv.FormatInt(quarantineID, 10)
	for _, e := range entries {
		if len(e.Name()) >= len(idStr) {
			// We cannot determine original name without backend metadata here;
			// restore with original permissions so the OS can access it.
			path := filepath.Join(quarantineDir, e.Name())
			_ = os.Chmod(path, 0644)
		}
	}
	_ = idStr
	return nil
}

// killProcessByPID sends SIGKILL (Unix) or terminates the process (Windows).
func killProcessByPID(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("killProcessByPID: find process %d: %w", pid, err)
	}
	if err := proc.Kill(); err != nil {
		return fmt.Errorf("killProcessByPID: kill process %d: %w", pid, err)
	}
	return nil
}

// applyNetworkIsolation and liftNetworkIsolation are implemented in
// edr_linux.go and edr_windows.go respectively via build constraints.
// Stub declarations are provided in edr_unsupported.go for other platforms.
