package cmd

import (
	"fmt"
	"io"
	"time"

	pb "github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
	"github.com/spf13/cobra"
)

var credentialFile string

type credentialRotationOps struct {
	validate func(*config.Config, string) error
	save     func(*config.Config) error
	isActive func(string) (bool, error)
	restart  func(string) error
}

var rotateCredentialCmd = &cobra.Command{
	Use:     "rotate-credential --credential-file <path|->",
	Short:   "Install a newly issued device credential and restart the agent safely",
	Args:    cobra.NoArgs,
	PreRunE: requireInstalled,
	RunE: func(cmd *cobra.Command, _ []string) error {
		credential, err := readDeviceCredential(credentialFile, cmd.InOrStdin())
		if err != nil {
			return err
		}
		current, err := config.GetCurrentConfig()
		if err != nil {
			return fmt.Errorf("load current agent identity: %w", err)
		}
		ops := credentialRotationOps{
			validate: pb.ValidateCredential,
			save:     config.SaveConfig,
			isActive: utils.CheckIfServiceIsActive,
			restart:  restartAgentService,
		}
		if err := applyRotatedCredential(current, credential, ops); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "Device credential updated; plaintext was not written to logs or command arguments.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(rotateCredentialCmd)
	rotateCredentialCmd.Flags().StringVar(&credentialFile, "credential-file", "",
		"Read the one-time rotated device credential from a protected file, or '-' for standard input")
}

func readDeviceCredential(path string, stdin io.Reader) (string, error) {
	credential, err := readProtectedSecret(path, stdin, "--credential-file", "device credential")
	if err != nil {
		return "", err
	}
	if len(credential) < len("ha_agent_")+1 || credential[:len("ha_agent_")] != "ha_agent_" {
		return "", fmt.Errorf("device credential has an unsupported format")
	}
	return credential, nil
}

func applyRotatedCredential(current *config.Config, credential string, ops credentialRotationOps) error {
	if current == nil {
		return fmt.Errorf("current agent configuration is required")
	}
	if err := ops.validate(current, credential); err != nil {
		return err
	}
	wasActive, err := ops.isActive("HiveArmorAgent")
	if err != nil {
		return fmt.Errorf("check agent service state: %w", err)
	}
	updated := *current
	updated.AgentKey = credential
	if err := ops.save(&updated); err != nil {
		return fmt.Errorf("save rotated credential: %w", err)
	}
	if wasActive {
		if err := ops.restart("HiveArmorAgent"); err != nil {
			return fmt.Errorf("credential saved but agent service restart failed: %w", err)
		}
	}
	return nil
}

func restartAgentService(name string) error {
	if err := utils.StopService(name); err != nil {
		// Ignore "not started" style failures; still wait for a stopped state.
		_ = err
	}
	// Allow up to 90s: agent shutdown itself can take ~30s before SCM reports STOPPED.
	if err := utils.WaitForServiceState(name, false, 90*time.Second); err != nil {
		return err
	}
	// Brief settle so the previous process releases file handles before sc start.
	time.Sleep(3 * time.Second)
	if err := utils.StartService(name); err != nil {
		return err
	}
	return utils.WaitForServiceState(name, true, 90*time.Second)
}
