package serv

import (
	"github.com/hivearmor/hivearmor-collector/utils"
)

func UninstallService() {
	err := utils.StopService("HiveArmorCollector")
	if err != nil {
		utils.Logger.Fatal("error stopping HiveArmorCollector: %v", err)
	}
	err = utils.UninstallService("HiveArmorCollector")
	if err != nil {
		utils.Logger.Fatal("error uninstalling HiveArmorCollector: %v", err)
	}
}
