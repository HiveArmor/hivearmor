package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/hivearmor/agent/utils"
)

func requireInstalled(cmd *cobra.Command, args []string) error {
	isInstalled, err := utils.CheckIfServiceIsInstalled("HiveArmorAgent")
	if err != nil {
		return fmt.Errorf("error checking if service is installed: %v", err)
	}
	if !isInstalled {
		return fmt.Errorf("HiveArmorAgent service is not installed")
	}
	return nil
}

func requireNotInstalled(cmd *cobra.Command, args []string) error {
	isInstalled, err := utils.CheckIfServiceIsInstalled("HiveArmorAgent")
	if err != nil {
		return fmt.Errorf("error checking if service is installed: %v", err)
	}
	if isInstalled {
		return fmt.Errorf("HiveArmorAgent service is already installed")
	}
	return nil
}
