//go:build linux && amd64
// +build linux,amd64

package config

var (
	ServiceFile = "hivearmor_agent_service%s"
	UpdaterFile = "hivearmor_updater_service%s"
	DependFiles = []string{"hivearmor_agent_dependencies_linux.zip"}
)
