package service

import (
	"github.com/kardianos/service"
)

func GetConfigServ() *service.Config {
	svcConfig := &service.Config{
		Name:        "HiveArmorAS400Updater",
		DisplayName: "HiveArmor AS400 Updater",
		Description: "HiveArmor AS400 Collector Updater Service",
	}

	return svcConfig
}
