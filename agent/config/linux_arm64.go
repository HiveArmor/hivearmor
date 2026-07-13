//go:build linux && arm64
// +build linux,arm64

package config

var (
	ServiceFile = "hivearmor_agent_service_arm64%s"
	UpdaterFile = "hivearmor_updater_service%s"
	DependFiles = []string{"hivearmor_agent_dependencies_linux_arm64.zip"}
)
