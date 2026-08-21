package telemetry

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
)

const (
	sshConfigPath   = "/etc/ssh/sshd_config"
	loginDefsPath   = "/etc/login.defs"
	passwdPath      = "/etc/passwd"
	osReleasePath   = "/etc/os-release"
)

type fileReader func(path string) ([]byte, error)

func defaultReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// BuildObservedSCA returns host configuration observations. The pack is not a CIS catalog.
func BuildObservedSCA(agentID, hostname string, tenantID *int64, read fileReader) ScaPayload {
	if read == nil {
		read = defaultReadFile
	}
	if runtime.GOOS != "linux" {
		return ScaPayload{
			AgentID:     agentID,
			Hostname:    hostname,
			PackID:      observedSSHPackID,
			PackVersion: "1",
			TenantID:    tenantID,
			Results: []ScaResult{{
				CheckID:        "HA-OS-01",
				Title:          "Linux observed SSH/login pack (not CIS official applicability)",
				Level:          "info",
				Status:         "NOT_APPLICABLE",
				ObservedValue:  runtime.GOOS,
				ExpectedValue:  "linux",
				Remediation:    "This pack evaluates Linux files only.",
				Mitre:          []string{},
				ComplianceTags: []string{"hivearmor-observed"},
			}},
		}
	}
	return linuxObservedSCA(agentID, hostname, tenantID, read)
}

func linuxObservedSCA(agentID, hostname string, tenantID *int64, read fileReader) ScaPayload {
	if read == nil {
		read = defaultReadFile
	}
	results := []ScaResult{
		evaluateSSHDirective(read, "HA-SSH-01", "PermitRootLogin", "yes",
			"PermitRootLogin is not yes (observed sshd_config; not CIS)"),
		evaluateSSHDirective(read, "HA-SSH-02", "PasswordAuthentication", "yes",
			"PasswordAuthentication is not yes (observed sshd_config; not CIS)"),
		evaluatePassMaxDays(read),
		evaluateRootUID(read),
	}

	return ScaPayload{
		AgentID:     agentID,
		Hostname:    hostname,
		PackID:      observedSSHPackID,
		PackVersion: "1",
		TenantID:    tenantID,
		Results:     results,
	}
}

func evaluateSSHDirective(read fileReader, checkID, directive, failValue, title string) ScaResult {
	raw, err := read(sshConfigPath)
	if err != nil {
		return ScaResult{
			CheckID:        checkID,
			Title:          title,
			Level:          "1",
			Status:         "ERROR",
			ObservedValue:  err.Error(),
			ExpectedValue:  directive + " not " + failValue,
			Remediation:    "Ensure sshd_config is readable by the agent service account.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	value, found := sshDirective(string(raw), directive)
	if !found {
		return ScaResult{
			CheckID:        checkID,
			Title:          title,
			Level:          "1",
			Status:         "NOT_APPLICABLE",
			ObservedValue:  "directive not set",
			ExpectedValue:  directive + " not " + failValue + " (explicit)",
			Remediation:    "Set " + directive + " explicitly. Distro defaults are not assumed.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	status := "PASS"
	if strings.EqualFold(value, failValue) {
		status = "FAIL"
	}
	return ScaResult{
		CheckID:        checkID,
		Title:          title,
		Level:          "1",
		Status:         status,
		ObservedValue:  value,
		ExpectedValue:  "not " + failValue,
		Remediation:    fmt.Sprintf("Set %s to a value other than %s in sshd_config, then reload sshd.", directive, failValue),
		Mitre:          []string{},
		ComplianceTags: []string{"hivearmor-observed"},
	}
}

func evaluatePassMaxDays(read fileReader) ScaResult {
	title := "PASS_MAX_DAYS is 90 or less (observed login.defs; not CIS)"
	raw, err := read(loginDefsPath)
	if err != nil {
		return ScaResult{
			CheckID:        "HA-LOGIN-01",
			Title:          title,
			Level:          "1",
			Status:         "ERROR",
			ObservedValue:  err.Error(),
			ExpectedValue:  "PASS_MAX_DAYS <= 90",
			Remediation:    "Ensure /etc/login.defs is readable.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	value, found := loginDefsValue(string(raw), "PASS_MAX_DAYS")
	if !found {
		return ScaResult{
			CheckID:        "HA-LOGIN-01",
			Title:          title,
			Level:          "1",
			Status:         "NOT_APPLICABLE",
			ObservedValue:  "PASS_MAX_DAYS not set",
			ExpectedValue:  "PASS_MAX_DAYS <= 90",
			Remediation:    "Set PASS_MAX_DAYS explicitly in /etc/login.defs.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	days, convErr := strconv.Atoi(value)
	if convErr != nil {
		return ScaResult{
			CheckID:        "HA-LOGIN-01",
			Title:          title,
			Level:          "1",
			Status:         "ERROR",
			ObservedValue:  value,
			ExpectedValue:  "PASS_MAX_DAYS <= 90",
			Remediation:    "PASS_MAX_DAYS must be an integer.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	status := "PASS"
	if days > 90 || days < 0 {
		status = "FAIL"
	}
	return ScaResult{
		CheckID:        "HA-LOGIN-01",
		Title:          title,
		Level:          "1",
		Status:         status,
		ObservedValue:  value,
		ExpectedValue:  "<= 90",
		Remediation:    "Set PASS_MAX_DAYS to 90 or less in /etc/login.defs.",
		Mitre:          []string{},
		ComplianceTags: []string{"hivearmor-observed"},
	}
}

func evaluateRootUID(read fileReader) ScaResult {
	title := "Exactly one UID 0 account in /etc/passwd (observed; not CIS)"
	raw, err := read(passwdPath)
	if err != nil {
		return ScaResult{
			CheckID:        "HA-USER-01",
			Title:          title,
			Level:          "1",
			Status:         "ERROR",
			ObservedValue:  err.Error(),
			ExpectedValue:  "1",
			Remediation:    "Ensure /etc/passwd is readable.",
			Mitre:          []string{},
			ComplianceTags: []string{"hivearmor-observed"},
		}
	}
	n := countUID0(string(raw))
	status := "PASS"
	if n != 1 {
		status = "FAIL"
	}
	return ScaResult{
		CheckID:        "HA-USER-01",
		Title:          title,
		Level:          "1",
		Status:         status,
		ObservedValue:  strconv.Itoa(n),
		ExpectedValue:  "1",
		Remediation:    "Remove extra UID 0 accounts from /etc/passwd.",
		Mitre:          []string{},
		ComplianceTags: []string{"hivearmor-observed"},
	}
}
