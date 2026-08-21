package cmd

import (
	"fmt"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/telemetry"
	"github.com/spf13/cobra"
)

var telemetryOnceCmd = &cobra.Command{
	Use:   "telemetry-once <server_address> <skip_cert_validation(yes/no)>",
	Short: "Post one observed SCA scan and one CycloneDX SBOM to the backend",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		cnf := &config.Config{
			Server:             args[0],
			SkipCertValidation: args[1] == "yes",
		}
		if err := telemetry.PostOnce(cnf); err != nil {
			return fmt.Errorf("telemetry-once failed: %w", err)
		}
		fmt.Println("telemetry-once accepted")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(telemetryOnceCmd)
}
