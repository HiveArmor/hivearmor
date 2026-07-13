package main

import (
	"fmt"
	"time"

	"github.com/hivearmor/installer/config"
	"github.com/hivearmor/installer/docker"
	"github.com/hivearmor/installer/setup"
	"github.com/hivearmor/installer/updater"
	"github.com/hivearmor/installer/utils"
)

func Install() error {
	fmt.Println("### Installing HiveArmor ###")

	go updater.MonitorConnection(config.GetCMServer(), 30*time.Second, 3, &config.ConnectedToInternet)

	isInstalledAlready, err := utils.CheckIfServiceIsInstalled("HiveArmorUpdater")
	if err != nil {
		return fmt.Errorf("error checking if service is installed: %v", err)
	}

	if isInstalledAlready {
		fmt.Println("HiveArmor is already installed. If you want to re-install it, please remove the service HiveArmorUpdater first.")
		if err := utils.RestartService("HiveArmorUpdater"); err != nil {
			return fmt.Errorf("error restarting service: %v", err)
		}
		return nil
	}

	version, err := updater.GetVersion()
	if err != nil {
		return err
	}

	pass, err := setup.Apply(version.Version, false)
	if err != nil {
		return fmt.Errorf("error applying setup: %v", err)
	}

	fmt.Print("Installing Updater Service")
	updater.InstallService()
	fmt.Println(" [OK]")

	fmt.Println("Running post installation cleanup...")
	if err := docker.PostInstallation(); err != nil {
		fmt.Printf("Warning: post-installation cleanup failed: %v\n", err)
	}

	fmt.Println("Installation finished successfully. We have generated a configuration file for you, please do not modify or remove it. You can find it at /root/hivearmor.yml.")
	fmt.Println("You can also use it to re-install your stack in case of a disaster or changes in your hardware. Just run the installer again.")
	fmt.Println("You can access to your Web-GUI at https://<your-server-ip> using admin as your username")
	fmt.Printf("Web-GUI default password for admin: %s \n", pass)
	fmt.Println("You can also access to your Web-based Administration Interface at https://<your-server-ip>:9090 using your Linux system credentials.")
	fmt.Println("Detailed installation logs can be found at /var/log/hivearmor-installer.log")

	fmt.Println("### Thanks for using HiveArmor ###")

	return nil
}
