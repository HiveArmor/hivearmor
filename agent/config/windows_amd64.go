//go:build windows && amd64
// +build windows,amd64

package config

var (
	ServiceFile = "hivearmor_agent_service%s.exe"
	UpdaterFile = "hivearmor_updater_service%s.exe"
	DependFiles = []string{"hivearmor_agent_dependencies_windows.zip"}
)
