//go:build darwin
// +build darwin

package config

var (
	ServiceFile = "hivearmor_agent_service%s"
	UpdaterFile = "hivearmor_updater_service%s"
	DependFiles = []string{}
)
