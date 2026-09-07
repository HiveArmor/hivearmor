package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

const quarantineMetaSuffix = ".ha-meta.json"

// quarantineMeta remembers the original path so EDR_RESTORE can reverse the move
// without relying solely on backend metadata (AGT-EDR-02 light).
type quarantineMeta struct {
	OriginalPath  string `json:"original_path"`
	QuarantineID  string `json:"quarantine_id,omitempty"`
	QuarantinedAt int64  `json:"quarantined_at"`
	DestName      string `json:"dest_name,omitempty"`
}

// quarantineFile moves the file to an isolated quarantine directory and writes
// a sidecar meta file with the original path (+ optional backend quarantine id).
// Returns the quarantine path on success.
func quarantineFile(filePath, quarantineID string) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("quarantineFile: cannot locate executable: %w", err)
	}
	quarantineDir := filepath.Join(filepath.Dir(exe), "quarantine")
	if err := os.MkdirAll(quarantineDir, 0700); err != nil {
		return "", fmt.Errorf("quarantineFile: create quarantine dir: %w", err)
	}

	base := filepath.Base(filePath)
	destName := fmt.Sprintf("%s_%d", base, time.Now().UnixNano())
	if id := strings.TrimSpace(quarantineID); id != "" {
		// Prefer id-prefixed name so restore by backend quarantine id is O(1)-ish.
		destName = fmt.Sprintf("q%s_%s_%d", id, base, time.Now().UnixNano())
	}
	dest := filepath.Join(quarantineDir, destName)

	if err := os.Rename(filePath, dest); err != nil {
		return "", fmt.Errorf("quarantineFile: move file: %w", err)
	}
	_ = os.Chmod(dest, 0000)

	meta := quarantineMeta{
		OriginalPath:  filePath,
		QuarantineID:  strings.TrimSpace(quarantineID),
		QuarantinedAt: time.Now().Unix(),
		DestName:      destName,
	}
	if err := writeQuarantineMeta(dest, meta); err != nil {
		utils.Logger.ErrorF("quarantineFile: meta write: %v", err)
	}
	return dest, nil
}

func writeQuarantineMeta(dest string, meta quarantineMeta) error {
	raw, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	return os.WriteFile(dest+quarantineMetaSuffix, raw, 0600)
}

func readQuarantineMeta(dest string) (*quarantineMeta, error) {
	raw, err := os.ReadFile(dest + quarantineMetaSuffix)
	if err != nil {
		return nil, err
	}
	var meta quarantineMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

// restoreFile moves a quarantined file back to its original path using local meta.
// quarantineID is the backend UtmEdrQuarantine id (also stored in meta when cmdId is passed).
func restoreFile(cnf *config.Config, quarantineID int64) error {
	_ = cnf
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("restoreFile: cannot locate executable: %w", err)
	}
	quarantineDir := filepath.Join(filepath.Dir(exe), "quarantine")
	entries, err := os.ReadDir(quarantineDir)
	if err != nil {
		// Quarantine dir may not exist; treat as success (file may have been manually restored)
		return nil
	}

	idStr := strconv.FormatInt(quarantineID, 10)
	var matchDest string
	var matchMeta *quarantineMeta

	for _, e := range entries {
		name := e.Name()
		if strings.HasSuffix(name, quarantineMetaSuffix) {
			continue
		}
		path := filepath.Join(quarantineDir, name)
		meta, metaErr := readQuarantineMeta(path)
		if metaErr != nil {
			continue
		}
		if meta.QuarantineID == idStr || strings.HasPrefix(name, "q"+idStr+"_") {
			matchDest = path
			matchMeta = meta
			break
		}
	}

	if matchMeta == nil || matchDest == "" {
		// Best-effort: if exactly one quarantined file with meta exists, restore it.
		// Documented deferral when mapping is ambiguous without backend path fetch.
		var candidates []struct {
			dest string
			meta *quarantineMeta
		}
		for _, e := range entries {
			name := e.Name()
			if strings.HasSuffix(name, quarantineMetaSuffix) || e.IsDir() {
				continue
			}
			path := filepath.Join(quarantineDir, name)
			meta, metaErr := readQuarantineMeta(path)
			if metaErr != nil || strings.TrimSpace(meta.OriginalPath) == "" {
				continue
			}
			candidates = append(candidates, struct {
				dest string
				meta *quarantineMeta
			}{path, meta})
		}
		if len(candidates) == 1 {
			matchDest = candidates[0].dest
			matchMeta = candidates[0].meta
		} else {
			// Legacy behavior: chmod files so operators can recover manually.
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), quarantineMetaSuffix) {
					continue
				}
				_ = os.Chmod(filepath.Join(quarantineDir, e.Name()), 0644)
			}
			return fmt.Errorf("restoreFile: no local meta for quarantine id %d (need sidecar from quarantine with cmdId); deferred full backend path lookup", quarantineID)
		}
	}

	orig := strings.TrimSpace(matchMeta.OriginalPath)
	if orig == "" {
		return fmt.Errorf("restoreFile: empty original_path in meta")
	}
	if err := os.MkdirAll(filepath.Dir(orig), 0755); err != nil {
		return fmt.Errorf("restoreFile: create original dir: %w", err)
	}
	_ = os.Chmod(matchDest, 0644)
	if err := os.Rename(matchDest, orig); err != nil {
		return fmt.Errorf("restoreFile: move back: %w", err)
	}
	_ = os.Remove(matchDest + quarantineMetaSuffix)
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
