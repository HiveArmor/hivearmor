package config

import (
	"fmt"
	"path/filepath"
	"runtime"

	"github.com/hivearmor/shared/fs"
)

const (
	SERV_LOG        = "hivearmor_updater.log"
	SERV_AGENT_NAME = "HiveArmorAgent"

	agentBaseName = "hivearmor_agent_service"
)

var (
	DependUrl        = "https://%s:%s/private/dependencies/agent/%s"
	AgentManagerPort = "9000"
	LogAuthProxyPort = "50051"
	DependenciesPort = "9001"

	VersionPath = filepath.Join(fs.GetExecutablePath(), "version.json")
)

// ServiceFile returns the agent binary name with OS and architecture suffix.
// Format: hivearmor_agent_service_<os>_<arch>[.exe]
// Examples:
//   - hivearmor_agent_service_linux_amd64
//   - hivearmor_agent_service_windows_amd64.exe
//   - hivearmor_agent_service_darwin_arm64
func ServiceFile(suffix string) string {
	name := fmt.Sprintf("%s_%s_%s%s", agentBaseName, runtime.GOOS, runtime.GOARCH, suffix)
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
