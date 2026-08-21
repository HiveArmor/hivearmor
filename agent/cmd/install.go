package cmd

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"

	"github.com/hivearmor/agent/agent"
	pb "github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/serv"
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/fs"
	"github.com/hivearmor/shared/http"
	"github.com/spf13/cobra"
)

var installMode string
var enrollmentTokenFile string

var installCmd = &cobra.Command{
	Use:     "install <server_address> <skip_cert_validation(yes/no)> --enrollment-token-file <path|->",
	Short:   "Install the HiveArmorAgent service",
	Args:    cobra.ExactArgs(2),
	PreRunE: requireNotInstalled,
	RunE: func(cmd *cobra.Command, args []string) error {
		mode := config.AgentMode(installMode)
		if mode != config.AgentModeLog && mode != config.AgentModeEDR {
			return fmt.Errorf("invalid --mode %q: must be 'log' or 'edr'", installMode)
		}

		cnf := &config.Config{
			Server:             args[0],
			SkipCertValidation: args[1] == "yes",
			Mode:               mode,
		}
		enrollmentToken, err := readEnrollmentToken(enrollmentTokenFile, cmd.InOrStdin())
		if err != nil {
			return err
		}

		utils.PrintBanner()
		fmt.Printf("Installing HiveArmorAgent service (mode: %s) ...\n", mode)

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
		if err := pb.RegisterAgent(cnf, enrollmentToken); err != nil {
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
	installCmd.Flags().StringVar(&installMode, "mode", string(config.AgentModeLog),
		"Agent operation mode: 'log' (log collection only) or 'edr' (log collection + endpoint telemetry)")
	installCmd.Flags().StringVar(&enrollmentTokenFile, "enrollment-token-file", "",
		"Read the one-time enrollment token from a protected file, or '-' for standard input")
}

func readEnrollmentToken(path string, stdin io.Reader) (string, error) {
	return readProtectedSecret(path, stdin, "--enrollment-token-file", "enrollment token")
}

func readProtectedSecret(path string, stdin io.Reader, flagName, secretName string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", fmt.Errorf("%s is required; %s secrets are not accepted as command arguments", flagName, secretName)
	}
	var reader io.Reader
	if path == "-" {
		reader = stdin
	} else {
		info, err := os.Stat(path)
		if err != nil {
			return "", fmt.Errorf("read %s file: %w", secretName, err)
		}
		if !info.Mode().IsRegular() {
			return "", fmt.Errorf("%s path must be a regular file", secretName)
		}
		if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
			return "", fmt.Errorf("%s file must not be readable or writable by group or others", secretName)
		}
		file, err := os.Open(path)
		if err != nil {
			return "", fmt.Errorf("open %s file: %w", secretName, err)
		}
		defer file.Close()
		reader = file
	}
	content, err := io.ReadAll(io.LimitReader(reader, 4097))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", secretName, err)
	}
	if len(content) > 4096 {
		return "", fmt.Errorf("%s exceeds 4096 bytes", secretName)
	}
	token := strings.TrimSpace(string(content))
	if token == "" {
		return "", fmt.Errorf("%s is empty", secretName)
	}
	return token, nil
}
