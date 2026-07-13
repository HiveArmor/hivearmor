package agent

import (
	"fmt"
	"path/filepath"

	"github.com/hivearmor/hivearmor-collector/config"
	"github.com/hivearmor/hivearmor-collector/utils"
)

func UninstallAll() error {
	err := utils.Execute(filepath.Join(utils.GetMyPath(), fmt.Sprintf(config.ServiceLogFile, "")), utils.GetMyPath(), "uninstall")
	if err != nil {
		return utils.Logger.ErrorF("%v", err)
	}
	return nil
}
