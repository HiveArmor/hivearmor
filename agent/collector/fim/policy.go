// Package fim implements the File Integrity Monitoring engine.
// It uses fsnotify (inotify on Linux, ReadDirectoryChangesW on Windows,
// FSEvents/kqueue on macOS) for kernel-speed change detection, backed by a
// SQLite baseline DB that stores SHA-256/MD5 hashes, permissions, and
// ownership per file.  Changes are emitted as dataType "fim" (files) or
// "fim-registry" (Windows registry keys) on the shared LogQueue.
package fim

import (
	"path/filepath"
	"runtime"
)

// WatchRule describes a single policy entry for FIM.
// Rules are either pushed from the server via policy sync or initialised
// from the built-in defaults below.
type WatchRule struct {
	// Path is the absolute file or directory path to watch.
	Path string `json:"path" yaml:"path"`
	// Recursive controls whether sub-directories are also watched.
	Recursive bool `json:"recursive" yaml:"recursive"`
	// Exclude is a list of glob patterns relative to Path to ignore.
	Exclude []string `json:"exclude,omitempty" yaml:"exclude,omitempty"`
}

// defaultRules returns the built-in monitored paths for the current platform.
// These are always active regardless of server-pushed policy.
func defaultRules() []WatchRule {
	switch runtime.GOOS {
	case "linux":
		return linuxDefaultRules()
	case "windows":
		return windowsDefaultRules()
	case "darwin":
		return darwinDefaultRules()
	default:
		return nil
	}
}

func linuxDefaultRules() []WatchRule {
	paths := []string{
		"/etc",
		"/bin",
		"/sbin",
		"/usr/bin",
		"/usr/sbin",
		"/lib",
		"/lib64",
		"/boot",
		"/root/.ssh",
		"/etc/sudoers",
		"/etc/passwd",
		"/etc/shadow",
		"/etc/cron.d",
		"/etc/cron.daily",
		"/etc/cron.hourly",
		"/etc/cron.monthly",
		"/etc/cron.weekly",
		"/etc/crontab",
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: true})
	}
	return rules
}

func windowsDefaultRules() []WatchRule {
	sysroot := `C:\Windows`
	paths := []string{
		filepath.Join(sysroot, "System32"),
		filepath.Join(sysroot, "SysWOW64"),
		filepath.Join(sysroot, "System32", "drivers", "etc"),
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: false})
	}
	return rules
}

func darwinDefaultRules() []WatchRule {
	paths := []string{
		"/etc",
		"/bin",
		"/sbin",
		"/usr/bin",
		"/Library/LaunchDaemons",
		"/System/Library/LaunchDaemons",
	}
	rules := make([]WatchRule, 0, len(paths))
	for _, p := range paths {
		rules = append(rules, WatchRule{Path: p, Recursive: true})
	}
	return rules
}
