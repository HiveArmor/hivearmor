package serv

import (
	"github.com/hivearmor/as400/utils"
)

func UninstallService() {
	err := utils.StopService("HiveArmorAS400Collector")
	if err != nil {
		utils.Logger.Fatal("error stopping HiveArmorAS400Collector: %v", err)
	}
	err = utils.UninstallService("HiveArmorAS400Collector")
	if err != nil {
		utils.Logger.Fatal("error uninstalling HiveArmorAS400Collector: %v", err)
	}
}
