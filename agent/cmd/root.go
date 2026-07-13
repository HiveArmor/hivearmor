package cmd

import (
	"os"

	"github.com/spf13/cobra"
	"github.com/hivearmor/agent/serv"
)

var rootCmd = &cobra.Command{
	Use:   "hivearmor_agent",
	Short: "HiveArmor Agent CLI",
	Long: `HiveArmor Agent CLI

Usage Examples:
  hivearmor_agent install <server_address> <ha_key> <skip_cert_validation(yes/no)>
  hivearmor_agent enable-integration <integration> <protocol> [--tls]
  hivearmor_agent disable-integration <integration> <protocol>
  hivearmor_agent change-port <integration> <protocol> <new_port>
  hivearmor_agent change-retention <new_retention>
  hivearmor_agent load-tls-certs <cert> <key> [ca]
  hivearmor_agent clean-logs
  hivearmor_agent uninstall

TLS Certificate Management:
  # Load your own certificates (RECOMMENDED)
  hivearmor_agent load-tls-certs /path/to/server.crt /path/to/server.key /path/to/ca.crt
  hivearmor_agent load-tls-certs /path/to/server.crt /path/to/server.key  # Without CA

TLS Integration Examples:
  hivearmor_agent enable-integration syslog tcp --tls       # Enable with TLS
  hivearmor_agent enable-integration syslog tcp             # Enable without TLS (default)
  hivearmor_agent disable-integration syslog tcp            # Disable (auto-disables TLS)

Note:
  - Make sure to run commands with appropriate permissions.
  - All commands require administrative privileges.
  - For detailed logs, check the service log file.`,
	Run: func(cmd *cobra.Command, args []string) {
		serv.RunService()
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
