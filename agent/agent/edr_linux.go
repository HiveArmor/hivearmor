//go:build linux

package agent

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
)

func startEdrCollectorOS(cnf *config.Config) {
	StartLinuxEdrCollector(cnf)
}

// StartLinuxEdrCollector starts the Linux auditd-backed EDR event collector.
// It reads from /dev/stdin of ausearch or from the audit socket, ingesting
// process, file, and network events to the backend.
func StartLinuxEdrCollector(cnf *config.Config) {
	go collectLinuxProcessEvents(cnf)
	go collectLinuxFileEvents(cnf)
}

// collectLinuxProcessEvents tails /proc to detect new process creation.
// For production use the go-libaudit integration would be preferred;
// here we poll /proc every second and diff against a known pid set.
func collectLinuxProcessEvents(cnf *config.Config) {
	seen := map[string]bool{}
	for {
		entries, err := os.ReadDir("/proc")
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			pid := e.Name()
			if !isNumeric(pid) || seen[pid] {
				continue
			}
			seen[pid] = true

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
		}

		// Prune exited processes from the seen map
		for pid := range seen {
			if _, err := os.Stat("/proc/" + pid); os.IsNotExist(err) {
				delete(seen, pid)
			}
		}
		time.Sleep(1 * time.Second)
	}
}

// collectLinuxFileEvents uses inotifywait to watch sensitive paths for modifications.
func collectLinuxFileEvents(cnf *config.Config) {
	watchPaths := []string{"/etc", "/usr/bin", "/usr/sbin", "/tmp", "/var/tmp"}
	args := append([]string{"-m", "-r", "-e", "create,modify,delete", "--format", "%w%f %e"}, watchPaths...)
	cmd := exec.Command("inotifywait", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return
	}
	if err := cmd.Start(); err != nil {
		return
	}

	hostname, _ := os.Hostname()
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		filePath := parts[0]
		eventTyp := parts[1]

		severity := "INFO"
		if strings.HasPrefix(filePath, "/etc/") || strings.HasPrefix(filePath, "/usr/bin/") {
			severity = "HIGH"
		} else if strings.HasPrefix(filePath, "/tmp/") || strings.HasPrefix(filePath, "/var/tmp/") {
			severity = "MEDIUM"
		}

		evt := EdrEvent{
			EventType: "FILE_" + eventTyp,
			Severity:  severity,
			FilePath:  filePath,
			Hostname:  hostname,
		}
		_ = IngestEdrEvent(cnf, evt)
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
