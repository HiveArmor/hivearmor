package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/hivearmor/agent/agent"
	pb "github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/serv"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/fs"
	"github.com/hivearmor/shared/http"
)

var installCmd = &cobra.Command{
	Use:     "install <server_address> <ha_key> <skip_cert_validation(yes/no)>",
	Short:   "Install the HiveArmorAgent service",
	Args:    cobra.ExactArgs(3),
	PreRunE: requireNotInstalled,
	RunE: func(cmd *cobra.Command, args []string) error {
		cnf := &config.Config{
			Server:             args[0],
			SkipCertValidation: args[2] == "yes",
		}
		haKey := args[1]

		utils.PrintBanner()
		fmt.Println("Installing HiveArmorAgent service ...")

		fmt.Print("Checking server connection ... ")
		if err := utils.ArePortsReachable(cnf.Server, config.AgentManagerPort, config.LogAuthProxyPort, config.DependenciesPort); err != nil {
			fmt.Println("\nError trying to connect to server: ", err)
			os.Exit(1)
		}
		fmt.Println("[OK]")

		fmt.Print("Downloading version info ... ")
		versionURL := fmt.Sprintf(config.DependUrl, cnf.Server, config.DependenciesPort, "version.json")
		if err := http.DownloadFile(versionURL, nil, "version.json", fs.GetExecutablePath(), cnf.SkipCertValidation); err != nil {
			fmt.Println("\nError downloading version.json: ", err)
			os.Exit(1)
		}
		fmt.Println("[OK]")

		fmt.Print("Configuring agent ... ")
		if err := pb.RegisterAgent(cnf, haKey); err != nil {
			fmt.Println("\nError registering agent: ", err)
			os.Exit(1)
		}
		if err := config.SaveConfig(cnf); err != nil {
			fmt.Println("\nError saving config: ", err)
			os.Exit(1)
		}
		if err := agent.SetDataRetention(""); err != nil {
			fmt.Println("\nError setting retention: ", err)
			os.Exit(1)
		}
		fmt.Println("[OK]")

		fmt.Print("Creating service ... ")
		serv.InstallService()
		fmt.Println("[OK]")
		fmt.Println("HiveArmorAgent service installed correctly")

		return nil
	},
}

func init() {
	rootCmd.AddCommand(installCmd)
}
