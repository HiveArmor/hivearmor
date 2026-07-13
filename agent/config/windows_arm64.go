//go:build windows && arm64
// +build windows,arm64

package config

var (
	ServiceFile = "hivearmor_agent_service_arm64%s.exe"
	UpdaterFile = "hivearmor_updater_service%s.exe"
	DependFiles = []string{"hivearmor_agent_dependencies_windows_arm64.zip"}
)
