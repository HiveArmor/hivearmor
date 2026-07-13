package main

import (
	"fmt"
	"os"

	"github.com/hivearmor/installer/updater"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {

		case "--help", "-h":
			help()

		case "--install", "-i":
			err := Install()
			if err != nil {
				fmt.Printf("\nerror installing HiveArmor: %v", err)
				os.Exit(1)
			}

		case "--run", "-r":
			updater.RunService()

		case "--version", "-v":
			version, err := updater.GetVersion()
			if err != nil {
				fmt.Printf("\nerror getting HiveArmor version: %v", err)
				os.Exit(1)
			}

			fmt.Printf("HiveArmor version: %s, edition: %s\n", version.Version, version.Edition)

		case "--uninstall", "-u":
			err := Uninstall()
			if err != nil {
				fmt.Printf("\nerror uninstalling HiveArmor: %v", err)
				os.Exit(1)
			}

		default:
			help()
		}
	} else {
		err := Install()
		if err != nil {
			fmt.Printf("\nerror installing HiveArmor: %v", err)
			os.Exit(1)
		}
	}
}

func help() {
	fmt.Println("### HiveArmor ###")
	fmt.Println("Usage: installer <argument>")
	fmt.Println("Arguments:")
	fmt.Println("  --help, -h                            Show this help")
	fmt.Println("  --install, -i                         Install HiveArmor")
	fmt.Println("  --uninstall, -u                       Uninstall HiveArmor")
	fmt.Println("  --version, -v                         Show HiveArmor version")
}
