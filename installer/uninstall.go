package main

import (
	"fmt"
	"os"
	"time"

	"github.com/hivearmor/installer/utils"
)

func Uninstall() error {
	fmt.Println("### Uninstalling HiveArmor ###")

	fmt.Print("Checking if HiveArmor is installed")
	isInstalled, err := utils.CheckIfServiceIsInstalled("HiveArmorUpdater")
	if err != nil {
		return fmt.Errorf("error checking if service is installed: %v", err)
	}

	if !isInstalled {
		fmt.Println(" [NOT FOUND]")
		fmt.Println("HiveArmor service is not installed on this system.")

		fmt.Print("Checking if Docker Swarm stack exists")
		err := utils.RunCmd("docker", "stack", "ls", "--format", "{{.Name}}")
		if err == nil {
			output, _ := utils.RunCmdWithOutput("docker", "stack", "ls", "--format", "{{.Name}}")
			if contains(output, "hivearmor") {
				fmt.Println(" [FOUND]")
				fmt.Print("Removing HiveArmor Docker Swarm stack")
				if err := utils.RunCmd("docker", "stack", "rm", "hivearmor"); err != nil {
					fmt.Printf(" [ERROR]\nerror removing stack: %v\n", err)
				} else {
					fmt.Println(" [OK]")
				}
			} else {
				fmt.Println(" [NOT FOUND]")
			}
		} else {
			fmt.Println(" [NOT FOUND]")
		}

		cleanupFolders()
		return nil
	}
	fmt.Println(" [OK]")

	fmt.Print("Stopping HiveArmorUpdater service")
	err = utils.StopService("HiveArmorUpdater")
	if err != nil {
		fmt.Printf(" [ERROR]\nerror stopping service: %v\n", err)
	} else {
		fmt.Println(" [OK]")
	}

	time.Sleep(2 * time.Second)

	fmt.Print("Uninstalling HiveArmorUpdater service")
	err = utils.UninstallService("HiveArmorUpdater")
	if err != nil {
		return fmt.Errorf("error uninstalling service: %v", err)
	}
	fmt.Println(" [OK]")

	fmt.Print("Removing HiveArmor Docker Swarm stack")
	err = utils.RunCmd("docker", "stack", "rm", "hivearmor")
	if err != nil {
		fmt.Printf(" [WARNING]\nerror removing stack (stack might not exist): %v\n", err)
	} else {
		fmt.Println(" [OK]")

		fmt.Println("Waiting for services to be removed...")
		time.Sleep(30 * time.Second)

		fmt.Print("Cleaning up Docker system")
		if err := utils.RunCmd("docker", "system", "prune", "-a", "-f", "--volumes"); err != nil {
			fmt.Printf(" [WARNING]\nerror pruning docker system: %v\n", err)
		} else {
			fmt.Println(" [OK]")
		}
	}

	cleanupFolders()

	fmt.Println("\n### HiveArmor has been uninstalled successfully ###")
	fmt.Println("Note: The following items were NOT removed:")
	fmt.Println("  - Docker installation")
	fmt.Println("  - System packages (nginx, vlan, etc.)")
	fmt.Println("  - HiveArmor data directory (/hivearmor)")
	fmt.Println("\nIf you want to completely remove all data, you can manually delete:")
	fmt.Println("  - /hivearmor directory")
	fmt.Println("  - /root/hivearmor.yml configuration file")

	return nil
}

func cleanupFolders() {
	fmt.Print("Removing /hivearmor/updates folder")
	updatesPath := "/hivearmor/updates"
	if _, err := os.Stat(updatesPath); err == nil {
		if err := os.RemoveAll(updatesPath); err != nil {
			fmt.Printf(" [WARNING]\nerror removing updates folder: %v\n", err)
		} else {
			fmt.Println(" [OK]")
		}
	} else {
		fmt.Println(" [NOT FOUND]")
	}
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
