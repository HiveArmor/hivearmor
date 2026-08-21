package serv

import (
	"fmt"
	"os"

	"github.com/kardianos/service"
)

func InstallService() {
	svcConfig := GetConfigServ()
	prg := new(program)
	newService, err := service.New(prg, svcConfig)
	if err != nil {
		fmt.Println("\nError creating new service: ", err)
		os.Exit(1)
	}
	err = newService.Install()
	if err != nil {
		fmt.Println("\nError installing new service: ", err)
		os.Exit(1)
	}

	if err := EnsureLinuxTelemetryEnvironment(); err != nil {
		fmt.Println("\nWarning: Linux telemetry EnvironmentFile drop-in was not applied: ", err)
	}

	err = newService.Start()
	if err != nil {
		fmt.Println("\nError starting new service: ", err)
		os.Exit(1)
	}
}
