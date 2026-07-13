package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/hivearmor/agent/updater/config"
	"github.com/hivearmor/agent/updater/service"
	"github.com/hivearmor/shared/fs"
	"github.com/hivearmor/shared/logger"
)

func main() {
	basePath := fs.GetExecutablePath()
	logger.Init(filepath.Join(basePath, "logs", config.SERV_LOG), logger.LevelInfo)

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "install":
			fmt.Println("Installing HiveArmor Updater service...")

			fmt.Print("Creating service ... ")
			service.InstallService()
			fmt.Println("[OK]")

			fmt.Println("HiveArmorUpdater service installed correctly")
			return
		case "uninstall":
			fmt.Println("Uninstalling HiveArmor Updater service...")
			service.UninstallService()
			fmt.Println("Service uninstalled successfully")
			return
		case "start":
			fmt.Println("Starting HiveArmor Updater service...")
			return
		case "stop":
			fmt.Println("Stopping HiveArmor Updater service...")
			return
		}
	}

	service.RunService()
}
