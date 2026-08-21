package utils

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/hivearmor/shared/exec"
	"github.com/hivearmor/shared/fs"
)

func CheckIfServiceIsActive(serv string) (bool, error) {
	var errB bool
	var output string
	path := fs.GetExecutablePath()

	switch runtime.GOOS {
	case "windows":
		output, errB = ExecuteWithResult("sc", path, "query", serv)
	case "linux":
		output, errB = ExecuteWithResult("systemctl", path, "is-active", serv)
	case "darwin":
		output, errB = ExecuteWithResult("launchctl", path, "list", serv)
	default:
		return false, fmt.Errorf("unknown operating system")
	}

	if errB {
		return false, nil
	}

	serviceStatus := strings.ToLower(strings.TrimSpace(output))

	switch runtime.GOOS {
	case "windows":
		return strings.Contains(serviceStatus, "running") &&
			!strings.Contains(serviceStatus, "start_pending") &&
			!strings.Contains(serviceStatus, "stop_pending"), nil
	case "linux":
		return serviceStatus == "active", nil
	case "darwin":
		return true, nil
	default:
		return false, fmt.Errorf("unsupported operating system")
	}
}

// windowsServiceState returns a coarse SCM state for wait loops.
func windowsServiceState(name string) (string, error) {
	path := fs.GetExecutablePath()
	output, errB := ExecuteWithResult("sc", path, "query", name)
	if errB {
		return "unknown", nil
	}
	lower := strings.ToLower(output)
	switch {
	case strings.Contains(lower, "start_pending"):
		return "start_pending", nil
	case strings.Contains(lower, "stop_pending"):
		return "stop_pending", nil
	case strings.Contains(lower, "running"):
		return "running", nil
	case strings.Contains(lower, "stopped"):
		return "stopped", nil
	default:
		return "unknown", nil
	}
}

func StartService(name string) error {
	path := fs.GetExecutablePath()
	switch runtime.GOOS {
	case "windows":
		err := exec.Run("sc", path, "start", name)
		if err != nil {
			errText := strings.ToLower(err.Error())
			// ERROR_SERVICE_ALREADY_RUNNING (1056): treat as success only once RUNNING.
			if strings.Contains(errText, "1056") || strings.Contains(errText, "already been started") {
				if waitErr := WaitForServiceState(name, true, 45*time.Second); waitErr != nil {
					return fmt.Errorf("error starting service (1056): %w", waitErr)
				}
				return nil
			}
			if waitErr := WaitForServiceState(name, true, 45*time.Second); waitErr == nil {
				return nil
			}
			return fmt.Errorf("error starting service: %v", err)
		}
		return WaitForServiceState(name, true, 45*time.Second)
	case "linux":
		err := exec.Run("systemctl", path, "start", name)
		if err != nil {
			return fmt.Errorf("error starting service: %v", err)
		}
	case "darwin":
		plistPath := fmt.Sprintf("/Library/LaunchDaemons/%s.plist", name)
		err := exec.Run("launchctl", path, "load", plistPath)
		if err != nil {
			return fmt.Errorf("error starting macOS service: %v", err)
		}
	}
	return nil
}

// WaitForServiceState polls until the service is active (wantActive=true) or
// inactive (wantActive=false), or until timeout elapses.
func WaitForServiceState(name string, wantActive bool, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		if runtime.GOOS == "windows" {
			state, err := windowsServiceState(name)
			if err != nil {
				return err
			}
			if wantActive {
				if state == "running" {
					return nil
				}
			} else {
				// STOP_PENDING is not stopped — wait until STOPPED.
				if state == "stopped" {
					return nil
				}
			}
		} else {
			active, err := CheckIfServiceIsActive(name)
			if err != nil {
				return err
			}
			if active == wantActive {
				return nil
			}
		}
		if time.Now().After(deadline) {
			if wantActive {
				return fmt.Errorf("timeout waiting for service %s to become running", name)
			}
			return fmt.Errorf("timeout waiting for service %s to stop", name)
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func StopService(name string) error {
	path := fs.GetExecutablePath()
	switch runtime.GOOS {
	case "windows":
		err := exec.Run("sc", path, "stop", name)
		if err != nil {
			return fmt.Errorf("error stoping service: %v", err)
		}
	case "linux":
		err := exec.Run("systemctl", path, "stop", name)
		if err != nil {
			return fmt.Errorf("error stoping service: %v", err)
		}
	case "darwin":
		err := exec.Run("launchctl", path, "remove", name)
		if err != nil {
			return fmt.Errorf("error stopping macOS service: %v", err)
		}
	}
	return nil
}

func UninstallService(name string) error {
	path := fs.GetExecutablePath()
	switch runtime.GOOS {
	case "windows":
		err := exec.Run("sc", path, "delete", name)
		if err != nil {
			return fmt.Errorf("error uninstalling service: %v", err)
		}
	case "linux":
		err := exec.Run("systemctl", path, "disable", name)
		if err != nil {
			return fmt.Errorf("error uninstalling service: %v", err)
		}
		err = exec.Run("rm", "/etc/systemd/system/", "/etc/systemd/system/"+name+".service")
		if err != nil {
			return fmt.Errorf("error uninstalling service: %v", err)
		}
	case "darwin":
		exec.Run("launchctl", path, "remove", name)
		exec.Run("rm", "/Library/LaunchDaemons/"+name+".plist")
		exec.Run("rm", "/Users/"+os.Getenv("USER")+"/Library/LaunchAgents/"+name+".plist")

	}
	return nil
}

func CheckIfServiceIsInstalled(serv string) (bool, error) {
	path := fs.GetExecutablePath()
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Run("sc", path, "query", serv)
	case "linux":
		err = exec.Run("systemctl", path, "status", serv)
	case "darwin":
		err = exec.Run("launchctl", path, "list", serv)
	default:
		return false, fmt.Errorf("operative system unknown")
	}

	return err == nil, nil
}

func CreateLinuxService(serviceName string, execStart string) error {
	servicePath := "/etc/systemd/system/" + serviceName + ".service"
	if !fs.Exists(servicePath) {
		file, err := os.Create(servicePath)
		if err != nil {
			return fmt.Errorf("error creating %s file: %v", servicePath, err)
		}
		defer func() { _ = file.Close() }()

		serviceContent := fmt.Sprintf(`[Unit]
Description=%s
After=network.target

[Service]
ExecStart=%s
Restart=always

[Install]
WantedBy=multi-user.target
`, serviceName, execStart)

		_, err = file.WriteString(serviceContent)
		if err != nil {
			return err
		}

		err = file.Sync()
		if err != nil {
			return err
		}
	} else {
		return fmt.Errorf("service %s already exists", serviceName)
	}

	return nil
}
