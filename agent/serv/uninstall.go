package serv

import (
	"github.com/hivearmor/agent/utils"
	"github.com/hivearmor/shared/svc"
)

func UninstallService() {
	err := svc.Stop("HiveArmorAgent")
	if err != nil {
		utils.Logger.Fatal("error stopping HiveArmorAgent: %v", err)
	}
	err = utils.UninstallService("HiveArmorAgent")
	if err != nil {
		utils.Logger.Fatal("error uninstalling HiveArmorAgent: %v", err)
	}
}
