package cmd

import (
	"github.com/spf13/cobra"
	"github.com/hivearmor/agent/serv"
)

var runCmd = &cobra.Command{
	Use:    "run",
	Short:  "Run the HiveArmorAgent service",
	Args:   cobra.NoArgs,
	PreRunE: requireInstalled,
	Run: func(cmd *cobra.Command, args []string) {
		serv.RunService()
	},
}

func init() {
	rootCmd.AddCommand(runCmd)
}
