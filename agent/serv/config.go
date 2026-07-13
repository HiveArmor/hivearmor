package serv

import (
	"github.com/kardianos/service"
)

// GetConfigServ creates and returns a pointer to a service configuration structure.
func GetConfigServ() *service.Config {
	svcConfig := &service.Config{
		Name:        "HiveArmorAgent",
		DisplayName: "HiveArmor Agent",
		Description: "HiveArmor Agent Service",
		Arguments:   []string{"run"},
	}

	return svcConfig
}
