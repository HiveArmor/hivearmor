package agent

import (
	"runtime"
	"strings"
)

// enrollmentPlatform maps host inventory onto the manager allowlist
// (linux|windows|darwin). go-sysinfo OS.Platform is a distro name such as ubuntu.
func enrollmentPlatform(osType, platform string) string {
	typeName := strings.ToLower(strings.TrimSpace(osType))
	switch typeName {
	case "linux", "windows", "darwin":
		return typeName
	}
	name := strings.ToLower(strings.TrimSpace(platform))
	if name == "macos" {
		return "darwin"
	}
	switch name {
	case "linux", "windows", "darwin":
		return name
	}
	switch runtime.GOOS {
	case "linux", "windows", "darwin":
		return runtime.GOOS
	}
	return typeName
}
