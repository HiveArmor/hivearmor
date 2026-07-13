//go:build windows

package agent

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/hivearmor/agent/config"
)

func startEdrCollectorOS(cnf *config.Config) {
	StartWindowsEdrCollector(cnf)
}

// StartWindowsEdrCollector starts Windows EDR event collectors using a polling approach.
// It polls running processes and watches temp/system directories for suspicious file writes.
func StartWindowsEdrCollector(cnf *config.Config) {
	go collectWindowsProcessEvents(cnf)
	go collectWindowsFileEvents(cnf)
}

// collectWindowsProcessEvents polls the process list via WMIC and ingests new processes.
func collectWindowsProcessEvents(cnf *config.Config) {
	seen := map[string]bool{}
	hostname, _ := os.Hostname()

	for {
		out, err := exec.Command("wmic", "process", "get", "ProcessId,Name,CommandLine", "/format:csv").Output()
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			parts := strings.Split(line, ",")
			if len(parts) < 4 {
				continue
			}
			pid := strings.TrimSpace(parts[2])
			name := strings.TrimSpace(parts[3])
			cmdline := strings.TrimSpace(parts[1])

			if pid == "" || pid == "ProcessId" || seen[pid] {
				continue
			}
			seen[pid] = true

			severity := "INFO"
			if isPotentiallyMaliciousName(name) {
				severity = "HIGH"
			}

			numPid, _ := parseInt(pid)
			evt := EdrEvent{
				EventType:   "PROCESS_CREATE",
				Severity:    severity,
				ProcessName: name,
				ProcessPid:  numPid,
				ProcessCmd:  cmdline,
				Hostname:    hostname,
			}
			_ = IngestEdrEvent(cnf, evt)
		}

		time.Sleep(2 * time.Second)
	}
}

// collectWindowsFileEvents polls Temp and System32 directories for new/modified files.
func collectWindowsFileEvents(cnf *config.Config) {
	watchPaths := []string{
		os.TempDir(),
		`C:\Windows\System32`,
		`C:\Windows\SysWOW64`,
	}
	hostname, _ := os.Hostname()
	seen := map[string]time.Time{}

	for {
		for _, dir := range watchPaths {
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, entry := range entries {
				info, err := entry.Info()
				if err != nil {
					continue
				}
				path := dir + `\` + entry.Name()
				prev, exists := seen[path]
				seen[path] = info.ModTime()
				if !exists {
					continue
				}
				if info.ModTime().After(prev) {
					severity := "MEDIUM"
					if dir == `C:\Windows\System32` || dir == `C:\Windows\SysWOW64` {
						severity = "HIGH"
					}
					evt := EdrEvent{
						EventType: "FILE_MODIFY",
						Severity:  severity,
						FilePath:  path,
						Hostname:  hostname,
					}
					_ = IngestEdrEvent(cnf, evt)
				}
			}
		}
		time.Sleep(5 * time.Second)
	}
}

// applyWindowsIsolation blocks all traffic via Windows Firewall rules.
func applyWindowsIsolation(isoType string, allowedIPs []string) error {
	// Block all inbound
	if err := runCmd("netsh", "advfirewall", "set", "allprofiles", "firewallpolicy", "blockinbound,blockoutbound"); err != nil {
		return fmt.Errorf("applyWindowsIsolation: set policy: %w", err)
	}

	// Allow loopback (can't really block it via netsh but add a rule for explicitness)
	_ = runCmd("netsh", "advfirewall", "firewall", "add", "rule",
		"name=EDR_ALLOW_LOOPBACK", "dir=in", "action=allow", "localip=127.0.0.1")

	// Allow explicit IPs
	for _, ip := range allowedIPs {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}
		_ = runCmd("netsh", "advfirewall", "firewall", "add", "rule",
			"name=EDR_ALLOWED_"+ip, "dir=in", "action=allow", "remoteip="+ip)
		_ = runCmd("netsh", "advfirewall", "firewall", "add", "rule",
			"name=EDR_ALLOWED_OUT_"+ip, "dir=out", "action=allow", "remoteip="+ip)
	}
	return nil
}

// liftWindowsIsolation removes EDR isolation firewall rules.
func liftWindowsIsolation() error {
	// Restore default allow policy
	if err := runCmd("netsh", "advfirewall", "set", "allprofiles", "firewallpolicy", "blockinbound,allowoutbound"); err != nil {
		return fmt.Errorf("liftWindowsIsolation: reset policy: %w", err)
	}
	// Delete EDR-specific rules
	_ = runCmd("netsh", "advfirewall", "firewall", "delete", "rule", "name=EDR_ALLOW_LOOPBACK")
	_ = exec.Command("cmd", "/c",
		`for /f "tokens=*" %r in ('netsh advfirewall firewall show rule name=all ^| findstr "EDR_ALLOWED"') do netsh advfirewall firewall delete rule name="%r"`).Run()
	return nil
}

// applyNetworkIsolation is the Windows implementation.
func applyNetworkIsolation(isoType string, allowedIPs []string) error {
	return applyWindowsIsolation(isoType, allowedIPs)
}

// liftNetworkIsolation is the Windows implementation.
func liftNetworkIsolation() error {
	return liftWindowsIsolation()
}

func isPotentiallyMaliciousName(name string) bool {
	suspects := []string{"powershell.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe", "regsvr32.exe"}
	lower := strings.ToLower(name)
	for _, s := range suspects {
		if lower == s {
			return true
		}
	}
	return false
}

func runCmd(name string, args ...string) error {
	return exec.Command(name, args...).Run()
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
