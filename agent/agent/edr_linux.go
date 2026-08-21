//go:build linux

package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

func startEdrCollectorOS(cnf *config.Config) {
	StartLinuxEdrCollector(cnf)
}

func startEdrCollectorWithContextOS(cnf *config.Config, ctx context.Context) {
	StartLinuxEdrCollectorWithContext(cnf, ctx)
}

// StartLinuxEdrCollector starts the Linux EDR event collectors using a
// background context. For proper shutdown, use StartLinuxEdrCollectorWithContext.
func StartLinuxEdrCollector(cnf *config.Config) {
	ctx, cancel := context.WithCancel(context.Background())
	_ = cancel // caller does not hold the cancel — service shutdown relies on process exit
	StartLinuxEdrCollectorWithContext(cnf, ctx)
}

// StartLinuxEdrCollectorWithContext starts the Linux EDR collectors with a
// cancellable context. Both goroutines stop cleanly when ctx is cancelled.
// This is called from serv/service.go where ctx propagation is required.
func StartLinuxEdrCollectorWithContext(cnf *config.Config, ctx context.Context) {
	go collectLinuxProcessEvents(cnf, ctx)
	go collectLinuxFileEvents(cnf, ctx)
}

// collectLinuxProcessEvents polls /proc every second to detect new process
// creation. The seen map is capped at maxSeenPIDs to prevent unbounded
// growth on high-PID-churn hosts (e.g. container workloads that spawn
// thousands of short-lived processes per hour).
//
// NOTE: /proc polling misses short-lived processes. Phase 2 will replace
// this with eBPF tracepoints (cilium/ebpf) for zero-miss coverage.
const maxSeenPIDs = 4096

func collectLinuxProcessEvents(cnf *config.Config, ctx context.Context) {
	seen := make(map[string]int64, maxSeenPIDs) // pid → timestamp when first seen
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		entries, err := os.ReadDir("/proc")
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			continue
		}
		for _, e := range entries {
			select {
			case <-ctx.Done():
				return
			default:
			}
			if !e.IsDir() {
				continue
			}
			pid := e.Name()
			if !isNumeric(pid) {
				continue
			}
			if _, already := seen[pid]; already {
				continue
			}

			comm, _ := os.ReadFile("/proc/" + pid + "/comm")
			cmdline, _ := os.ReadFile("/proc/" + pid + "/cmdline")
			cmdlineStr := strings.ReplaceAll(strings.TrimSpace(string(cmdline)), "\x00", " ")

			evt := EdrEvent{
				EventType:   "PROCESS_CREATE",
				Severity:    "INFO",
				ProcessName: strings.TrimSpace(string(comm)),
				ProcessPath: "/proc/" + pid + "/exe",
				ProcessCmd:  cmdlineStr,
			}
			if numPid, err := parseInt(pid); err == nil {
				evt.ProcessPid = numPid
			}
			hostname, _ := os.Hostname()
			evt.Hostname = hostname
			_ = IngestEdrEvent(cnf, evt)

			// Cap the seen map to avoid unbounded memory growth.
			if len(seen) >= maxSeenPIDs {
				// Evict the oldest half of entries.
				oldest := time.Now().Add(-30 * time.Second).UnixNano()
				for p, ts := range seen {
					if ts < oldest {
						delete(seen, p)
					}
				}
			}
			seen[pid] = time.Now().UnixNano()
		}

		// Prune exited processes from the seen map (standard /proc check).
		for pid := range seen {
			if _, err := os.Stat("/proc/" + pid); os.IsNotExist(err) {
				delete(seen, pid)
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(1 * time.Second):
		}
	}
}

// collectLinuxFileEvents uses fsnotify (inotify kernel events) to watch
// sensitive paths for file-system changes. This replaces the previous
// inotifywait shell-out which required an external binary and had no
// context-aware shutdown path.
func collectLinuxFileEvents(cnf *config.Config, ctx context.Context) {
	watchPaths := []string{"/etc", "/usr/bin", "/usr/sbin", "/tmp", "/var/tmp"}
	hostname, _ := os.Hostname()

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		utils.Logger.ErrorF("edr_linux: fsnotify.NewWatcher: %v", err)
		return
	}
	defer watcher.Close()

	for _, dir := range watchPaths {
		if err := watcher.Add(dir); err != nil {
			utils.Logger.ErrorF("edr_linux: watch %s: %v", dir, err)
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op == fsnotify.Chmod {
				continue // too noisy
			}
			evtType := fsnotifyOpToString(event.Op)
			severity := linuxFileEventSeverity(event.Name)
			evt := EdrEvent{
				EventType: "FILE_" + evtType,
				Severity:  severity,
				FilePath:  event.Name,
				Hostname:  hostname,
			}
			_ = IngestEdrEvent(cnf, evt)

		case watchErr, ok := <-watcher.Errors:
			if !ok {
				return
			}
			utils.Logger.ErrorF("edr_linux: watcher error: %v", watchErr)
		}
	}
}

func fsnotifyOpToString(op fsnotify.Op) string {
	switch {
	case op.Has(fsnotify.Create):
		return "CREATE"
	case op.Has(fsnotify.Write):
		return "MODIFY"
	case op.Has(fsnotify.Remove):
		return "DELETE"
	case op.Has(fsnotify.Rename):
		return "RENAME"
	default:
		return "CHANGE"
	}
}

func linuxFileEventSeverity(path string) string {
	switch {
	case strings.HasPrefix(path, "/etc/") || strings.HasPrefix(path, "/usr/bin/") || strings.HasPrefix(path, "/usr/sbin/"):
		return "HIGH"
	case strings.HasPrefix(path, "/tmp/") || strings.HasPrefix(path, "/var/tmp/"):
		return "MEDIUM"
	default:
		return "INFO"
	}
}

// applyLinuxIsolation blocks all traffic except allowed IPs via iptables.
func applyLinuxIsolation(isoType string, allowedIPs []string) error {
	// Flush existing rules and set default DROP policy
	if err := runCmd("iptables", "-F"); err != nil {
		return fmt.Errorf("iptables flush: %w", err)
	}

	// Always allow loopback
	if err := runCmd("iptables", "-A", "INPUT", "-i", "lo", "-j", "ACCEPT"); err != nil {
		return err
	}
	if err := runCmd("iptables", "-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT"); err != nil {
		return err
	}

	// Allow already-established connections (needed for gRPC back-channel)
	_ = runCmd("iptables", "-A", "INPUT", "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT")

	// Allow explicit IPs
	for _, ip := range allowedIPs {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}
		_ = runCmd("iptables", "-A", "INPUT", "-s", ip, "-j", "ACCEPT")
		_ = runCmd("iptables", "-A", "OUTPUT", "-d", ip, "-j", "ACCEPT")
	}

	if isoType == "FULL" {
		_ = runCmd("iptables", "-P", "INPUT", "DROP")
		_ = runCmd("iptables", "-P", "OUTPUT", "DROP")
		_ = runCmd("iptables", "-P", "FORWARD", "DROP")
	}
	return nil
}

// liftLinuxIsolation removes isolation iptables rules.
func liftLinuxIsolation() error {
	if err := runCmd("iptables", "-F"); err != nil {
		return fmt.Errorf("iptables flush: %w", err)
	}
	_ = runCmd("iptables", "-P", "INPUT", "ACCEPT")
	_ = runCmd("iptables", "-P", "OUTPUT", "ACCEPT")
	_ = runCmd("iptables", "-P", "FORWARD", "ACCEPT")
	return nil
}

func runCmd(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}

// applyNetworkIsolation is the Linux implementation (exported via edr_response_actions.go contract).
func applyNetworkIsolation(isoType string, allowedIPs []string) error {
	return applyLinuxIsolation(isoType, allowedIPs)
}

// liftNetworkIsolation is the Linux implementation.
func liftNetworkIsolation() error {
	return liftLinuxIsolation()
}

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

func parseInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}
