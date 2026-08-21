package serv

// Linux systemd drop-in and owner-only env file for observed SCA/SBOM.
// kardianos/service already references /etc/sysconfig/HiveArmorAgent (optional).
// Ubuntu hosts typically lack that path, so install also adds this drop-in.

const (
	LinuxTelemetryEnvPath      = "/etc/hivearmor/agent.env"
	LinuxTelemetryDropInDir    = "/etc/systemd/system/HiveArmorAgent.service.d"
	LinuxTelemetryDropInFile   = "10-telemetry.conf"
	LinuxTelemetryServiceName  = "HiveArmorAgent"
)

func telemetryDropInContents() string {
	return `[Service]
EnvironmentFile=-/etc/hivearmor/agent.env
`
}

func telemetryEnvTemplate() string {
	return `# HiveArmor agent environment — mode 0600, owner root.
# Do not put these values in the unit file, process arguments, tickets, or logs.
# HA_INTERNAL_KEY is staging-only until agent-manager signed telemetry ingest exists.
# HA_INTERNAL_KEY=
# HA_TENANT_ID=
# HA_AGENT_ID=
`
}

type linuxTelemetryPaths struct {
	EnvFile    string
	DropInDir  string
	DropInFile string
}

func defaultLinuxTelemetryPaths() linuxTelemetryPaths {
	return linuxTelemetryPaths{
		EnvFile:    LinuxTelemetryEnvPath,
		DropInDir:  LinuxTelemetryDropInDir,
		DropInFile: LinuxTelemetryDropInFile,
	}
}
