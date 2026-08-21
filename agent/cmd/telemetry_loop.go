package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/telemetry"
	"github.com/spf13/cobra"
)

var telemetryLoopCmd = &cobra.Command{
	Use:   "telemetry-loop <server_address> <skip_cert_validation(yes/no)>",
	Short: "Run the observed SCA/SBOM loop until SIGTERM (systemd-friendly, no enrollment required)",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		cnf := &config.Config{
			Server:             args[0],
			SkipCertValidation: args[1] == "yes",
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		telemetry.StartLoop(ctx, cnf)
		if ctx.Err() == nil {
			return fmt.Errorf("telemetry-loop exited without shutdown signal")
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(telemetryLoopCmd)
}
