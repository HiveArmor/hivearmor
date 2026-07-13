package updates

import (
	"fmt"

	"github.com/hivearmor/as400/config"
	"github.com/hivearmor/as400/utils"
)

func DownloadVersion(address string, insecure bool) error {
	if err := utils.DownloadFile(fmt.Sprintf(config.DependUrl, address, config.DependenciesPort, "version.json"), map[string]string{}, "version.json", utils.GetMyPath(), insecure); err != nil {
		return fmt.Errorf("error downloading version.json : %v", err)
	}

	return nil

}

func DownloadUpdater(address string, insecure bool) error {
	if err := utils.DownloadFile(fmt.Sprintf(config.DependUrl, address, config.DependenciesPort, "hivearmor_as400_updater_service"), map[string]string{}, "hivearmor_as400_updater_service", utils.GetMyPath(), insecure); err != nil {
		return fmt.Errorf("error downloading hivearmor_as400_updater_service : %v", err)
	}

	return nil
}

func DownloadJar(address string, insecure bool) error {
	if err := utils.DownloadFile(fmt.Sprintf(config.DependUrl, address, config.DependenciesPort, "as400-collector.jar"), map[string]string{}, "as400-collector.jar", utils.GetMyPath(), insecure); err != nil {
		return fmt.Errorf("error downloading as400-collector.jar : %v", err)
	}

	return nil

}
