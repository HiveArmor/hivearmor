package serv

import (
	"github.com/kardianos/service"
)

// GetConfigServ creates and returns a pointer to a service configuration structure.
func GetConfigServ() *service.Config {
	svcConfig := &service.Config{
		Name:        "HiveArmorAS400Collector",
		DisplayName: "HiveArmor AS400 Collector",
		Description: "HiveArmor AS400 Collector Service",
		Arguments:   []string{"run"},
	}

	return svcConfig
}
